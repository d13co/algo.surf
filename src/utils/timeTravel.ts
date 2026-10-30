import { base64ToBytes, decodeJSON, DTAlgodClient, DTUnsupportedError, indexerModels, IntDecoding, modelsv2, parseJSON } from "algosdk";
import { network, Networks } from "src/packages/core-sdk/constants";
import type { BoxNamesPage } from "src/packages/core-sdk/clients/boxClient";
import type { A_Box } from "src/packages/core-sdk/types";
import {
  REACT_APP_TIMETRAVEL_ALGOD_TOKEN,
  REACT_APP_TIMETRAVEL_ALGOD_URL,
  REACT_APP_TIMETRAVEL_SEARCH_DELAY_MS,
} from "src/env";
import { getApiBaseUrl, getApiHeaders } from "./nodeApi";

/**
 * Client for the experimental time-travel algod (dt-algorand), which serves
 * object version histories (`GET .../versions`) and state at a past round
 * (`?round=R` on the usual lookups). Requests go through dtalgosdk's
 * DTAlgodClient; responses are read as the node's JSON (see ttRaw).
 */

export type TimeTravelNode = { baseUrl: string; headers: Record<string, string> };

export type TTInt = number | bigint;

export type TTKeyValue = {
  key: string;
  value: { type: number; bytes: string; uint: TTInt };
};

export type TTStateSchema = { "num-byte-slice": number; "num-uint": number };

export type TTAppParams = {
  creator: string;
  "approval-program": string;
  "clear-state-program": string;
  "extra-program-pages"?: number;
  "global-state-schema"?: TTStateSchema;
  "local-state-schema"?: TTStateSchema;
  "global-state"?: TTKeyValue[];
  version?: number;
};

export type TTApplication = { id: TTInt; params: TTAppParams };

export type TTAssetHolding = { amount: TTInt; "asset-id": TTInt; "is-frozen": boolean };

export type TTAppLocalState = { id: TTInt; schema: TTStateSchema; "key-value"?: TTKeyValue[] };

export type TTAsset = { index: TTInt; params: Record<string, unknown> };

export type TTAppVersion = {
  round: number;
  timestamp: number;
  deleted: boolean;
  application?: TTApplication;
};

/** A box's value from this round on (base64); none where the round deleted it. */
export type TTBoxVersion = {
  round: number;
  timestamp: number;
  deleted: boolean;
  value?: string;
};

/** A box's change in a round of an application's box feed: its new value (base64), none where deleted. */
export type TTBoxChange = { name: string; deleted: boolean; value?: string };

/** One round's changes to an application's boxes, in name order. */
export type TTBoxesVersion = { round: number; timestamp: number; boxes: TTBoxChange[] };

/**
 * One round's changes to an application, from its params feed and (where
 * asked for) its box feed: `deleted` and `application` where the params
 * changed, as in TTAppVersion; `boxes` where boxes did.
 */
export type TTAppStateVersion = {
  round: number;
  timestamp: number;
  deleted?: boolean;
  application?: TTApplication;
  boxes?: TTBoxChange[];
};

/** One round's changes to an account: only the constituents that changed, each in full. */
export type TTAccountVersion = {
  round: number;
  timestamp: number;
  base?: { deleted: boolean; account?: Record<string, unknown> };
  assets?: { "asset-id": TTInt; deleted: boolean; "asset-holding"?: TTAssetHolding }[];
  "apps-local-state"?: { "app-id": TTInt; deleted: boolean; "app-local-state"?: TTAppLocalState }[];
  "created-assets"?: { "asset-id": TTInt; deleted: boolean; asset?: TTAsset }[];
  "created-apps"?: { "app-id": TTInt; deleted: boolean; application?: TTApplication }[];
};

export type TTVersionsPage<V> = { round: number; "next-token"?: string; versions: V[] };

/** Version lists: newest first (`desc`) or oldest first (`asc`). */
export type VersionsOrder = "asc" | "desc";

/** The rounds a version list reads: at least `min` and at most `max`, each unbounded where undefined. */
export type RoundBounds = { min?: number; max?: number };

/** Rows per page of a version table. */
export const VERSIONS_PAGE_SIZE = 10;

/**
 * Versions per request: a few pages first, so the first page's deltas wait on
 * no second batch and few previous-state reads, then more at a time.
 * The node ends a batch early past ~1 MB of values (app versions carry their
 * programs), so one can come back short.
 */
export const VERSIONS_FIRST_BATCH_SIZE = 3 * VERSIONS_PAGE_SIZE;
export const VERSIONS_BATCH_SIZE = 5 * VERSIONS_PAGE_SIZE;

/** Versions per request once a list filtered to fields is told to keep searching: the node's maximum. */
export const VERSIONS_SEARCH_BATCH_SIZE = 1000;

/** Box histories render every loaded version, of values up to 32 KB: a page at a time. */
export const BOX_VERSIONS_BATCH_SIZE = VERSIONS_PAGE_SIZE;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The algod to read version histories from, if any.
 *
 * Only the time-travel algod serves them, so this is opt-in:
 * `localStorage.timetravelAlgodUrl` (and `timetravelAlgodToken`), else
 * `REACT_APP_TIMETRAVEL_ALGOD_URL` (and `_TOKEN`) at build time. Localnet falls
 * back to its own algod, which may be one. Anywhere else: null, and nothing is
 * probed.
 */
export function getTimeTravelNode(): TimeTravelNode | null {
  const storedUrl = readStorage("timetravelAlgodUrl");
  const url = storedUrl || REACT_APP_TIMETRAVEL_ALGOD_URL;
  if (url) {
    const token = storedUrl ? readStorage("timetravelAlgodToken") : REACT_APP_TIMETRAVEL_ALGOD_TOKEN;
    return {
      baseUrl: url.replace(/\/+$/, ""),
      // Not Authorization: Bearer - algod's CORS policy does not allow that header.
      headers: token ? { "X-Algo-API-Token": token } : {},
    };
  }
  if (network === Networks.Localnet) {
    return { baseUrl: getApiBaseUrl("algod").replace(/\/+$/, ""), headers: getApiHeaders("algod") };
  }
  return null;
}

/** Whether `baseUrl` is on this machine or a private network. */
function isLocalServer(baseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)[\d.]+$/.test(host)
  );
}

/**
 * The least time, in ms, between the end of one batch of a version search
 * (Keep searching) and the next request: `localStorage.timetravelSearchDelayMs`,
 * else `REACT_APP_TIMETRAVEL_SEARCH_DELAY_MS` at build time, else none for a
 * local server (see isLocalServer) and 500 for any other.
 */
export function getSearchDelayMs(): number {
  for (const value of [readStorage("timetravelSearchDelayMs"), REACT_APP_TIMETRAVEL_SEARCH_DELAY_MS]) {
    const ms = value ? Number(value) : NaN;
    if (Number.isFinite(ms) && ms >= 0) return ms;
  }
  const node = getTimeTravelNode();
  return node && isLocalServer(node.baseUrl) ? 0 : 500;
}

export class TimeTravelError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let cachedClient: { node: string; algod: DTAlgodClient } | undefined;

/**
 * A DTAlgodClient (dtalgosdk) on the configured time-travel node, or null
 * without one (see getTimeTravelNode). One per node, so the answers it caches
 * are shared.
 */
export function getDTAlgod(): DTAlgodClient | null {
  const node = getTimeTravelNode();
  if (!node) return null;
  const key = JSON.stringify(node);
  if (cachedClient?.node !== key) {
    // The token as a header object, which may be empty: a string, even "",
    // would send a header and make every read a CORS preflight. No port: the
    // URL's own.
    cachedClient = { node: key, algod: new DTAlgodClient(node.headers, node.baseUrl, undefined) };
  }
  return cachedClient.algod;
}

function requireDTAlgod(): DTAlgodClient {
  const algod = getDTAlgod();
  if (!algod) throw new Error("No time travel node configured");
  return algod;
}

/** An SDK request whose response is read as the node sent it. */
type RawRequest = {
  doRaw(headers?: Record<string, string>, customOptions?: Record<string, unknown>): Promise<Uint8Array>;
};

/** The node's message in an SDK HTTP error, without the SDK's "Network request error..." prefix. */
function errorMessage(e: any): string {
  try {
    const message = JSON.parse(new TextDecoder().decode(e.response.body)).message;
    if (message) return message;
  } catch {
    // no JSON body: the SDK's message
  }
  return e.message;
}

/**
 * Sends an SDK request to the time-travel node and returns the body as is.
 * Resolves null on 404 (no such object at that round); throws a
 * TimeTravelError on any other failure, including a node without the
 * feature (DTUnsupportedError).
 */
async function ttRawText(req: RawRequest, signal?: AbortSignal): Promise<string | null> {
  try {
    return new TextDecoder().decode(await req.doRaw(undefined, signal ? { signal } : undefined));
  } catch (e) {
    if (signal?.aborted) throw e;
    if (e instanceof DTUnsupportedError) throw new TimeTravelError(e.message, 404);
    const status = (e as any)?.response?.status ?? (e as any)?.status;
    if (status === 404) return null;
    if (typeof status === "number") throw new TimeTravelError(errorMessage(e), status);
    throw e;
  }
}

/**
 * ttRawText, parsed: the node's JSON as the version and delta code reads it.
 * Integers beyond 2^53 come back as bigint. Not the SDK's models: re-encoded,
 * they leave out zero and empty values, which would read as removed fields.
 */
async function ttRaw<T>(req: RawRequest, signal?: AbortSignal): Promise<T | null> {
  const text = await ttRawText(req, signal);
  return text === null ? null : (parseJSON(text, { intDecoding: IntDecoding.MIXED }) as T);
}

// ---------------------------------------------------------------------------
// Versions

/** What every `...Versions` builder of DTAlgodClient takes. */
interface VersionsBuilder extends RawRequest {
  minRound(round: number | bigint): this;
  maxRound(round: number | bigint): this;
  order(order: VersionsOrder): this;
  limit(limit: number): this;
  next(nextToken: string | undefined): this;
  rounds(rounds: readonly number[]): this;
  include(...include: "values"[]): this;
}

/** A version list request's range and paging. */
export type VersionsQuery = {
  next?: string;
  minRound?: number;
  maxRound?: number;
  order?: VersionsOrder;
  limit?: number;
  /** Each version's new value (`include=values`). */
  values?: boolean;
  /** Instead of a range, the object as of each of these rounds (not with minRound/maxRound). */
  rounds?: number[];
};

/** Where a version list is read from: a builder of `algod`'s, without range or paging. */
export type VersionsSource = (algod: DTAlgodClient) => VersionsBuilder;

/** A page of versions from `source`. */
export async function getVersionsPage<V>(
  source: VersionsSource,
  { next, minRound, maxRound, order, limit, values, rounds }: VersionsQuery,
  signal?: AbortSignal,
): Promise<TTVersionsPage<V>> {
  const req = source(requireDTAlgod());
  if (next !== undefined) req.next(next);
  if (minRound !== undefined) req.minRound(minRound);
  if (maxRound !== undefined) req.maxRound(maxRound);
  if (order) req.order(order);
  if (limit !== undefined) req.limit(limit);
  if (rounds) req.rounds(rounds);
  if (values) req.include("values");
  const page = await ttRaw<TTVersionsPage<V>>(req, signal);
  // The versions endpoints never 404 (an object without versions has none);
  // the SDK throws DTUnsupportedError where the route is missing.
  if (!page) throw new TimeTravelError("This node does not serve version histories", 404);
  return page;
}

/** The most rounds one batched read asks for: a page's worth with values. */
const AS_OF_BATCH_ROUNDS = 1000;

type AsOfWaiter = { resolve: (entry: unknown) => void; reject: (e: unknown) => void };
type AsOfBatch = { source: VersionsSource; waiters: Map<number, AsOfWaiter[]> };
const asOfBatches = new Map<string, AsOfBatch>();

/**
 * The entry of `source`'s versions as of `round`: the object's state at the
 * end of that round (see `rounds()`). Reads of the same list (`id`) asked
 * for together go as one request.
 */
export function readVersionAsOf<V>(id: string, source: VersionsSource, round: number): Promise<V> {
  return new Promise<V>((resolve, reject) => {
    let batch = asOfBatches.get(id);
    if (!batch) {
      batch = { source, waiters: new Map() };
      asOfBatches.set(id, batch);
      // Gather the reads a render asks for, then send them.
      setTimeout(() => {
        asOfBatches.delete(id);
        flushAsOf(batch!);
      }, 0);
    }
    const waiters = batch.waiters.get(round) ?? [];
    waiters.push({ resolve: resolve as (entry: unknown) => void, reject });
    batch.waiters.set(round, waiters);
  });
}

async function flushAsOf({ source, waiters }: AsOfBatch) {
  const rounds = [...waiters.keys()].sort((a, b) => a - b);
  for (let i = 0; i < rounds.length; i += AS_OF_BATCH_ROUNDS) {
    const chunk = rounds.slice(i, i + AS_OF_BATCH_ROUNDS);
    try {
      const entries = new Map<number, unknown>();
      let next: string | undefined;
      do {
        const page = await getVersionsPage<{ round: number }>(source, { rounds: chunk, values: true, limit: chunk.length, next });
        for (const entry of page.versions) entries.set(entry.round, entry);
        next = page["next-token"] || undefined;
      } while (next);
      for (const round of chunk) {
        const entry = entries.get(round);
        for (const w of waiters.get(round)!) {
          // One entry per round asked for; a node without `rounds` answers with a range instead.
          if (entry) w.resolve(entry);
          else w.reject(new TimeTravelError("This node does not serve versions at rounds", 404));
        }
      }
    } catch (e) {
      for (const round of chunk) for (const w of waiters.get(round)!) w.reject(e);
    }
  }
}

/** A TEAL key or box name, base64 as the version JSON carries it, as bytes. */
export const nameBytes = (b64: string) => base64ToBytes(b64);

/** Whether the node serves version histories: a one-version read of an account's. */
export async function probeVersions(address: string): Promise<boolean> {
  try {
    await getVersionsPage((algod) => algod.accountVersions(address), { limit: 1 });
    return true;
  } catch (e) {
    if (e instanceof TimeTravelError && e.status === 404) return false;
    throw e;
  }
}

/** The node's genesis ID, from its suggested params. */
export async function getGenesisId(): Promise<string> {
  const params = await ttRaw<{ "genesis-id": string }>(requireDTAlgod().getTransactionParams());
  return params?.["genesis-id"] ?? "";
}

// ---------------------------------------------------------------------------
// Records as they were at a past round

/**
 * A read of one object at a round: what a version is diffed against, and
 * what a page at a past round shows. Plain data, so it can key a query.
 */
export type AtRoundRead =
  | { read: "app"; appId: number; round: number }
  | { read: "asset"; assetId: number; round: number }
  | { read: "box"; appId: number; name: string; round: number }
  /** An account's own fields (`exclude=all`): no holdings, local states or created objects. */
  | { read: "account"; address: string; round: number; exclude?: "all" }
  | { read: "account-asset"; address: string; assetId: number; round: number }
  | { read: "account-app"; address: string; appId: number; round: number };

function atRoundRequest(algod: DTAlgodClient, r: AtRoundRead): RawRequest {
  switch (r.read) {
    case "app":
      return algod.getApplicationByID(r.appId).round(r.round);
    case "asset":
      return algod.getAssetByID(r.assetId).round(r.round);
    case "box":
      return algod.getApplicationBoxByName(r.appId, nameBytes(r.name)).round(r.round);
    case "account": {
      const req = algod.accountInformation(r.address).round(r.round);
      return r.exclude ? req.exclude(r.exclude) : req;
    }
    case "account-asset":
      return algod.accountAssetInformation(r.address, r.assetId).round(r.round);
    case "account-app":
      return algod.accountApplicationInformation(r.address, r.appId).round(r.round);
  }
}

/** `r` as the node's JSON; null where the object did not exist at that round. */
export function readAtRound<T = any>(r: AtRoundRead, signal?: AbortSignal): Promise<T | null> {
  return ttRaw<T>(atRoundRequest(requireDTAlgod(), r), signal);
}

/** readAtRound's body, decoded into `model`; a TimeTravelError (404) with `missing` where there was none. */
async function readAtRoundAs<T>(r: AtRoundRead, model: Parameters<typeof decodeJSON>[1], missing: string): Promise<T> {
  const text = await ttRawText(atRoundRequest(requireDTAlgod(), r));
  if (text === null) throw new TimeTravelError(missing, 404);
  return decodeJSON(text, model) as T;
}

/** An application at `round`, in the indexer model the application page reads. */
export function getApplicationAt(id: number, round: number): Promise<indexerModels.Application> {
  return readAtRoundAs({ read: "app", appId: id, round }, indexerModels.Application, `Application ${id} did not exist at block ${round}`);
}

/** An asset at `round`, in the indexer model the asset page reads. */
export function getAssetAt(id: number, round: number): Promise<indexerModels.Asset> {
  return readAtRoundAs({ read: "asset", assetId: id, round }, indexerModels.Asset, `Asset ${id} did not exist at block ${round}`);
}

/** An account at `round`, as algod's account information. */
export function getAccountAt(address: string, round: number): Promise<modelsv2.Account> {
  return readAtRoundAs({ read: "account", address, round }, modelsv2.Account, `Account ${address} not found at block ${round}`);
}

/** BoxClient's reads, from the time-travel node at `round`. */
export class TimeTravelBoxClient {
  constructor(private round: number) {}

  async getBoxNamesPage(id: number, nextToken?: string, limit = 500): Promise<BoxNamesPage> {
    const req = requireDTAlgod().getApplicationBoxes(id).round(this.round).limit(limit).next(nextToken);
    const page = await ttRaw<{ boxes: { name: string }[]; "next-token"?: string }>(req);
    return { boxes: page?.boxes.map(({ name }) => ({ name })) ?? [], nextToken: page?.["next-token"] };
  }

  async getBox(id: number, name: string): Promise<A_Box> {
    const box = await readAtRound<{ value: string }>({ read: "box", appId: id, name, round: this.round });
    if (!box) {
      throw new TimeTravelError(`No such box at block ${this.round}`, 404);
    }
    return { name, value: box.value };
  }
}
