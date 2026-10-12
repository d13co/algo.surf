import { decodeJSON, indexerModels, IntDecoding, modelsv2, parseJSON } from "algosdk";
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
 * Client for the experimental time-travel algod (go-algorand-timetravel), which
 * serves object version histories (`GET .../versions`) and state at a past
 * round (`?round=R` on the usual lookups).
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

type Query = Record<string, string | number | undefined>;

/**
 * GET a path on the time-travel node. Resolves null on 404 (no such object at
 * that round, or no time travel on this node); throws on any other failure.
 * Integers beyond 2^53 come back as bigint.
 */
export async function ttGet<T>(path: string, query: Query = {}, signal?: AbortSignal): Promise<T | null> {
  const text = await ttGetText(path, query, signal);
  return text === null ? null : (parseJSON(text, { intDecoding: IntDecoding.MIXED }) as T);
}

/** ttGet, but the raw body: for decoding into SDK models. */
async function ttGetText(path: string, query: Query = {}, signal?: AbortSignal): Promise<string | null> {
  const node = getTimeTravelNode();
  if (!node) {
    throw new Error("No time travel node configured");
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();

  const res = await fetch(`${node.baseUrl}${path}${qs ? `?${qs}` : ""}`, { headers: node.headers, signal });
  const text = await res.text();
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      // not JSON: keep the body
    }
    throw new TimeTravelError(message || res.statusText, res.status);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Records as they were at a past round, in the SDK models the pages render

/** An application at `round`, in the indexer model the application page reads. */
export async function getApplicationAt(id: number, round: number): Promise<indexerModels.Application> {
  const text = await ttGetText(`/v2/applications/${id}`, { round });
  if (text === null) {
    throw new TimeTravelError(`Application ${id} did not exist at block ${round}`, 404);
  }
  return decodeJSON(text, indexerModels.Application);
}

/** An asset at `round`, in the indexer model the asset page reads. */
export async function getAssetAt(id: number, round: number): Promise<indexerModels.Asset> {
  const text = await ttGetText(`/v2/assets/${id}`, { round });
  if (text === null) {
    throw new TimeTravelError(`Asset ${id} did not exist at block ${round}`, 404);
  }
  return decodeJSON(text, indexerModels.Asset);
}

/** An account at `round`, as algod's account information. */
export async function getAccountAt(address: string, round: number): Promise<modelsv2.Account> {
  const text = await ttGetText(`/v2/accounts/${address}`, { round });
  if (text === null) {
    throw new TimeTravelError(`Account ${address} not found at block ${round}`, 404);
  }
  return decodeJSON(text, modelsv2.Account);
}

/** BoxClient's reads, from the time-travel node at `round`. */
export class TimeTravelBoxClient {
  constructor(private round: number) {}

  async getBoxNamesPage(id: number, nextToken?: string, limit = 500): Promise<BoxNamesPage> {
    const page = await ttGet<{ boxes: { name: string }[]; "next-token"?: string }>(
      `/v2/applications/${id}/boxes`,
      { round: this.round, limit, next: nextToken },
    );
    return { boxes: page?.boxes.map(({ name }) => ({ name })) ?? [], nextToken: page?.["next-token"] };
  }

  async getBox(id: number, name: string): Promise<A_Box> {
    const box = await ttGet<{ value: string }>(`/v2/applications/${id}/box`, {
      name: `b64:${name}`,
      round: this.round,
    });
    if (!box) {
      throw new TimeTravelError(`No such box at block ${this.round}`, 404);
    }
    return { name, value: box.value };
  }
}
