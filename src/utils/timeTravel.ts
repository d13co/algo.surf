import { decodeJSON, indexerModels, IntDecoding, modelsv2, parseJSON } from "algosdk";
import {
  fetchBoxesPageAt,
  getBoxAt,
  TimeTravelError,
  ttGetText as nodeGetText,
  type Query,
  type TimeTravelNode,
  type TTApplication,
  type TTBoxChange,
  type TTVersionsPage,
  type VersionsOrder,
} from "@node-toolkit/timetravel";
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
 * algo.surf's side of the experimental time-travel algod (go-algorand-timetravel),
 * which serves object version histories (`GET .../versions`) and state at a past
 * round (`?round=R` on the usual lookups). The transport and the node's types
 * are @node-toolkit/timetravel's; this picks the node and decodes into the SDK
 * models the pages render.
 */

export {
  TimeTravelError,
  type TimeTravelNode,
  type TTAccountVersion,
  type TTApplication,
  type TTAppLocalState,
  type TTAppParams,
  type TTAppVersion,
  type TTAsset,
  type TTAssetHolding,
  type TTBoxChange,
  type TTBoxesVersion,
  type TTBoxVersion,
  type TTInt,
  type TTKeyValue,
  type TTStateSchema,
  type TTVersionsPage,
  type VersionsOrder,
} from "@node-toolkit/timetravel";

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
    // Sent as X-Algo-API-Token: algod's CORS policy does not allow Authorization: Bearer.
    return { baseUrl: url.replace(/\/+$/, ""), token: token || undefined };
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

/** The configured node; throws where there is none (see getTimeTravelNode). */
export function requireTimeTravelNode(): TimeTravelNode {
  const node = getTimeTravelNode();
  if (!node) {
    throw new Error("No time travel node configured");
  }
  return node;
}

/**
 * GET a path on the time-travel node. Resolves null on 404 (no such object at
 * that round, or no time travel on this node); throws a TimeTravelError on any
 * other failure. Integers beyond 2^53 come back as bigint (parsed by algosdk,
 * which needs no JSON.parse source text, unlike the package's parseJson).
 */
export async function ttGet<T>(path: string, query: Query = {}, signal?: AbortSignal): Promise<T | null> {
  const text = await ttGetText(path, query, signal);
  return text === null ? null : (parseJSON(text, { intDecoding: IntDecoding.MIXED }) as T);
}

/** ttGet, but the raw body: for decoding into SDK models. */
function ttGetText(path: string, query: Query = {}, signal?: AbortSignal): Promise<string | null> {
  return nodeGetText(requireTimeTravelNode(), path, query, signal);
}

/** ttGetText, but a 404 throws a TimeTravelError (`what` names the missing thing). */
async function ttGetTextOrThrow(path: string, query: Query, what: string): Promise<string> {
  const text = await ttGetText(path, query);
  if (text === null) {
    throw new TimeTravelError(what, 404, path);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Records as they were at a past round, in the SDK models the pages render

/** An application at `round`, in the indexer model the application page reads. */
export async function getApplicationAt(id: number, round: number): Promise<indexerModels.Application> {
  const text = await ttGetTextOrThrow(`/v2/applications/${id}`, { round }, `Application ${id} did not exist at block ${round}`);
  return decodeJSON(text, indexerModels.Application);
}

/** An asset at `round`, in the indexer model the asset page reads. */
export async function getAssetAt(id: number, round: number): Promise<indexerModels.Asset> {
  const text = await ttGetTextOrThrow(`/v2/assets/${id}`, { round }, `Asset ${id} did not exist at block ${round}`);
  return decodeJSON(text, indexerModels.Asset);
}

/** An account at `round`, as algod's account information. */
export async function getAccountAt(address: string, round: number): Promise<modelsv2.Account> {
  const text = await ttGetTextOrThrow(`/v2/accounts/${address}`, { round }, `Account ${address} not found at block ${round}`);
  return decodeJSON(text, modelsv2.Account);
}

/** BoxClient's reads, from the time-travel node at `round`. */
export class TimeTravelBoxClient {
  constructor(private round: number) {}

  async getBoxNamesPage(id: number, nextToken?: string, limit = 500): Promise<BoxNamesPage> {
    const page = await fetchBoxesPageAt(requireTimeTravelNode(), id, this.round, { limit, next: nextToken });
    return { boxes: page.boxes.map(({ name }) => ({ name })), nextToken: page["next-token"] };
  }

  async getBox(id: number, name: string): Promise<A_Box> {
    const box = await getBoxAt(requireTimeTravelNode(), id, `b64:${name}`, this.round);
    if (!box) {
      throw new TimeTravelError(`No such box at block ${this.round}`, 404, `/v2/applications/${id}/box`);
    }
    return { name, value: box.value };
  }
}
