import {
  base64ToBytes,
  bytesToBase64,
  decodeJSON,
  decodeMsgpack,
  DTAlgodClient,
  DTUnsupportedError,
  encodeJSON,
  indexerModels,
  isHistoryUnavailable,
  LedgerStateDelta,
  modelsv2,
} from "algosdk";
import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import { DEFAULT_MAX_VERSIONS_ROUNDS_PER_REQUEST } from "@algorandfoundation/algokit-utils/types/dt-manager";
import { network, Networks } from "src/packages/core-sdk/constants";
import type { BoxNamesPage } from "src/packages/core-sdk/clients/boxClient";
import type { A_Box } from "src/packages/core-sdk/types";
import {
  REACT_APP_TIMETRAVEL_ALGOD_TOKEN,
  REACT_APP_TIMETRAVEL_ALGOD_URL,
  REACT_APP_TIMETRAVEL_SEARCH_DELAY_MS,
} from "src/env";
import { getApiBaseUrl, getApiHeaders } from "./nodeApi";
import { nodeJson } from "./nodeJson";
import { retryOptions } from "./retryWaits";
import { omitMapKeys } from "./msgpackOmit";

/**
 * Client for the experimental time-travel algod (dt-algorand), which serves
 * object version histories (`GET .../versions`) and state at a past round
 * (`?round=R` on the usual lookups). Requests go through dt-algosdk's
 * DTAlgodClient, which checks that the node answered at the round asked for;
 * asset holders through dt-algokit-utils. Version histories and the states
 * they are diffed against are read as the node's JSON (see ttRead).
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

/** An asset's params from this round on; none where the round destroyed it. */
export type TTAssetVersion = {
  round: number;
  timestamp: number;
  deleted: boolean;
  asset?: TTAsset;
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

let cachedClients: { node: string; algod: DTAlgodClient; algorand: AlgorandClient } | undefined;

/** The configured node's clients, one pair per node, so the answers they cache (capabilities) are shared. */
function getClients() {
  const node = getTimeTravelNode();
  if (!node) return null;
  const key = JSON.stringify(node);
  if (cachedClients?.node !== key) {
    // The token as a header object, which may be empty: a string, even "",
    // would send a header and make every read a CORS preflight. No port: the
    // URL's own. Retries 429s, busy 503s and network errors, reporting each
    // wait for RetryWaitToast; the DTAlgodClient shares that HTTP client.
    const algorand = AlgorandClient.fromConfig({
      algodConfig: { server: node.baseUrl, token: node.headers, retry: retryOptions("time-travel") },
    });
    cachedClients = { node: key, algod: DTAlgodClient.from(algorand.client.algod), algorand };
  }
  return cachedClients;
}

/**
 * A DTAlgodClient (dt-algosdk) on the configured time-travel node, or null
 * without one (see getTimeTravelNode).
 */
export function getDTAlgod(): DTAlgodClient | null {
  return getClients()?.algod ?? null;
}

/**
 * The dt-algokit-utils AlgorandClient on the configured time-travel node (it
 * shares getDTAlgod's HTTP client and retries), or null without one.
 */
export function getTTAlgorand(): AlgorandClient | null {
  return getClients()?.algorand ?? null;
}

function requireClients() {
  const clients = getClients();
  if (!clients) throw new Error("No time travel node configured");
  return clients;
}

function requireDTAlgod(): DTAlgodClient {
  return requireClients().algod;
}

/** An SDK request: its response decoded into the SDK's model. */
type TTRequest = {
  do(headers?: Record<string, string>, customOptions?: Record<string, unknown>): Promise<unknown>;
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

/** The HTTP status of an SDK or utils error, if it has one. */
function statusOf(e: unknown): number | undefined {
  const status = (e as any)?.response?.status ?? (e as any)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * `e` as a TimeTravelError, where it is one the node gave: a node without
 * the feature, or one that did not answer at the round asked for
 * (DTUnsupportedError), counts as 404, as do the node's own 404s. Anything
 * else (a network failure, an abort) is `e` itself.
 */
function asTimeTravelError(e: unknown): unknown {
  if (e instanceof TimeTravelError) return e;
  if (e instanceof DTUnsupportedError) return new TimeTravelError(e.message, 404);
  const status = statusOf(e);
  return status === undefined ? e : new TimeTravelError(errorMessage(e), status);
}

/**
 * Sends an SDK request to the time-travel node and returns its response as
 * the node's JSON (see nodeJson): what the version and delta code reads.
 * Resolves null on the node's 404 (no such object at that round); throws a
 * TimeTravelError on any other failure (see asTimeTravelError).
 */
async function ttRead<T>(req: TTRequest, signal?: AbortSignal): Promise<T | null> {
  const model = await ttDo(req, signal);
  return model === null ? null : nodeJson<T>(model);
}

/** ttRead's request, its response left as the SDK's model. */
async function ttDo<M>(req: { do(headers?: Record<string, string>, customOptions?: Record<string, unknown>): Promise<M> }, signal?: AbortSignal): Promise<M | null> {
  try {
    return await req.do(undefined, signal ? { signal } : undefined);
  } catch (e) {
    if (signal?.aborted) throw e;
    if (!(e instanceof DTUnsupportedError) && statusOf(e) === 404) return null;
    throw asTimeTravelError(e);
  }
}

// ---------------------------------------------------------------------------
// Versions

/** What every `...Versions` builder of DTAlgodClient takes. */
interface VersionsBuilder extends TTRequest {
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
  const page = await ttRead<TTVersionsPage<V>>(req, signal);
  // The versions endpoints never 404 (an object without versions has none);
  // the SDK throws DTUnsupportedError where the route is missing.
  if (!page) throw new TimeTravelError("This node does not serve version histories", 404);
  return page;
}

/**
 * The most rounds one batched read asks for: dt-algokit-utils' default, which
 * keeps the request line (the rounds are in its query string) under the 8 KB
 * many proxies allow.
 */
const AS_OF_BATCH_ROUNDS = DEFAULT_MAX_VERSIONS_ROUNDS_PER_REQUEST;

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

// ---------------------------------------------------------------------------
// What the node serves

/** What a dt-algorand node reports it can do (`GET /v2/capabilities`), as dt-algosdk reads it. */
export type TTCapabilities = Awaited<ReturnType<DTAlgodClient["capabilities"]>>;

/** What the configured node serves this network, by its capabilities and genesis. */
export type TimeTravelSupport =
  | { supported: true; capabilities: TTCapabilities }
  | { supported: false; reason: string };

/**
 * Whether the node serves past state and version histories, for this network:
 * time travel in its capabilities (`GET /v2/capabilities`, read once per
 * client), and a genesis of this network's. With them, the node's limits and
 * whether it runs queries (`query`, absent when they are off). Throws where
 * the node cannot be reached.
 */
export async function getTimeTravelSupport(): Promise<TimeTravelSupport> {
  const algod = requireDTAlgod();
  const [capabilities, params] = await Promise.all([algod.capabilities(), algod.getTransactionParams().do()]);
  if (!capabilities.timeTravel) {
    return {
      supported: false,
      reason: capabilities.reported
        ? "time travel is off (EnableTimeTravel)"
        : "it is stock algod, or a dt-algorand without capabilities",
    };
  }
  const genesisId = params.genesisID ?? "";
  if (network !== Networks.Localnet && !genesisId.toLowerCase().startsWith(network.toLowerCase())) {
    return { supported: false, reason: `it follows ${genesisId}, not ${network}` };
  }
  return { supported: true, capabilities };
}

/**
 * Whether the node lists asset holders: time travel and the holders index
 * (see DTAlgodClient.supportsAssetHolders, cached per client). A node whose
 * index is on but not built yet says yes, then answers the holders with a
 * 503 (see holdersError).
 */
export function getHoldersSupport(): Promise<boolean> {
  return requireDTAlgod().supportsAssetHolders();
}

// ---------------------------------------------------------------------------
// Asset holders

/** An account holding an asset (opted in: the amount can be 0). */
export type TTAssetHolder = { address: string; amount: bigint; frozen: boolean };

/** A page of an asset's holders at `round`, in address order. */
export type TTAssetHoldersPage = { round: number; holders: TTAssetHolder[]; nextToken?: string };

/** Holders per request: the node's default. */
export const HOLDERS_BATCH_SIZE = 1000;

/** A holders read's failure as a TimeTravelError, its message saying why. */
function holdersError(e: unknown, assetId: number, round: number | undefined): unknown {
  if (isHistoryUnavailable(e)) {
    return new TimeTravelError("The node's asset holders index is not ready yet (it is being built or catching up)", 503);
  }
  if (!(e instanceof DTUnsupportedError) && statusOf(e) === 404) {
    return new TimeTravelError(
      round === undefined ? `Asset ${assetId} does not exist` : `Asset ${assetId} did not exist at block ${round}`,
      404,
    );
  }
  return asTimeTravelError(e);
}

/**
 * A page of an asset's holders at `round` (default: the latest), after
 * `next` (the previous page's `nextToken`, with its `round`), from
 * dt-algokit-utils. The node examines at most 100,000 accounts per page, so a
 * page can be short or empty while more remain: only a missing `nextToken`
 * ends the list.
 */
export async function getAssetHoldersPage(
  assetId: number,
  { round, next, limit = HOLDERS_BATCH_SIZE }: { round?: number; next?: string; limit?: number },
  signal?: AbortSignal,
): Promise<TTAssetHoldersPage> {
  try {
    const page = await requireClients().algorand.dt.getAssetHolders(BigInt(assetId), {
      round,
      next,
      limit,
      signal,
    });
    return { round: Number(page.round), holders: page.holders, nextToken: page.nextToken };
  } catch (e) {
    if (signal?.aborted) throw e;
    throw holdersError(e, assetId, round);
  }
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

function atRoundRequest(algod: DTAlgodClient, r: AtRoundRead): TTRequest {
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
  return ttRead<T>(atRoundRequest(requireDTAlgod(), r), signal);
}

/**
 * An algod model as the indexer's: the application and asset pages read the
 * indexer models, whose JSON algod's is a subset of.
 */
function asIndexerModel<T>(model: unknown, indexerModel: Parameters<typeof decodeJSON>[1]): T {
  return decodeJSON(encodeJSON(model as Parameters<typeof encodeJSON>[0]), indexerModel) as T;
}

/** An application at `round`, in the indexer model the application page reads. */
export async function getApplicationAt(id: number, round: number): Promise<indexerModels.Application> {
  const app = await ttDo(requireDTAlgod().getApplicationByID(id).round(round));
  if (!app) throw new TimeTravelError(`Application ${id} did not exist at block ${round}`, 404);
  return asIndexerModel(app, indexerModels.Application);
}

/** An asset at `round`, in the indexer model the asset page reads. */
export async function getAssetAt(id: number, round: number): Promise<indexerModels.Asset> {
  const asset = await ttDo(requireDTAlgod().getAssetByID(id).round(round));
  if (!asset) throw new TimeTravelError(`Asset ${id} did not exist at block ${round}`, 404);
  return asIndexerModel(asset, indexerModels.Asset);
}

/** An account at `round`, as algod's account information. */
export async function getAccountAt(address: string, round: number): Promise<modelsv2.Account> {
  const account = await ttDo(requireDTAlgod().accountInformation(address).round(round));
  if (!account) throw new TimeTravelError(`Account ${address} not found at block ${round}`, 404);
  return account;
}

/**
 * The ledger state delta of `round` from the time-travel node; null where the
 * node doesn't store that block (it rebuilds an old round's delta from it).
 */
export function getLedgerDeltaAt(round: number, signal?: AbortSignal) {
  const req = requireDTAlgod().getLedgerStateDelta(round);
  // Decoded from the raw msgpack without `Txleases`: a block with leased txns
  // keys it by {Sender, Lease} structs, which algosdk's decoder rejects
  // ("The type of key must be string, number, bigint, or Uint8Array").
  return ttDo(
    {
      do: async (headers?: Record<string, string>, options?: Record<string, unknown>) =>
        decodeMsgpack(omitMapKeys(await req.doRaw(headers, options), ["Txleases"]), LedgerStateDelta),
    },
    signal,
  );
}

/** BoxClient's reads, from the time-travel node at `round`. */
export class TimeTravelBoxClient {
  constructor(private round: number) {}

  async getBoxNamesPage(id: number, nextToken?: string, limit = 500): Promise<BoxNamesPage> {
    // do(), not a raw read: it checks that the page is of `round`.
    const page = await ttDo(requireDTAlgod().getApplicationBoxes(id).round(this.round).limit(limit).next(nextToken));
    return {
      boxes: page?.boxes.map(({ name }) => ({ name: bytesToBase64(name) })) ?? [],
      nextToken: page?.nextToken || undefined,
    };
  }

  async getBox(id: number, name: string): Promise<A_Box> {
    const box = await ttDo(requireDTAlgod().getApplicationBoxByName(id, nameBytes(name)).round(this.round));
    if (!box) {
      throw new TimeTravelError(`No such box at block ${this.round}`, 404);
    }
    return { name, value: bytesToBase64(box.value) };
  }
}
