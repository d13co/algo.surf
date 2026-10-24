import { isUtf8 } from "src/utils/isUtf8";
import type { VersionsOrder } from "src/utils/timeTravel";
import {
  FieldPath,
  ObjectSummary,
  ObjKind,
  objKey,
  ObjRef,
  shortSegment,
  tealMapKeys,
} from "src/utils/versionDelta";

/**
 * Filters for version lists, as the URL carries them:
 *
 *   ?object=asset:31566704             one object's versions (account pages)
 *   ?object=box:bmFtZQ==               ...or of a box (app pages, with boxes)
 *   ?field=global.counter              the versions that changed a field
 *   ?object=local:123&field=local.foo  ...of one object
 *
 * `object` is an objKey. `field` is a path into the object's state, spelled
 * as the Changed chips spell it, and may repeat: any of them changing
 * matches. A field covers everything under it: `global` is any global state
 * change. On a page of several objects, a field without an object is about
 * the account itself (`base`), or on an app's, the app (`app`).
 */
export type VersionFilter = {
  /** The object (objKey) the versions must touch; undefined on single-object pages. */
  object?: string;
  fields: FieldPath[];
};

const toShort = new Map(Object.entries(shortSegment));
const toLong = new Map(Object.entries(shortSegment).map(([long, short]) => [short, long]));

/**
 * A TEAL key in a URL: as text where printable, else `0x` and hex - and hex
 * too for text that would read as hex.
 */
function urlTealKey(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  const text = bytes.toString("utf8");
  if (bytes.length && isUtf8(bytes) && !/[\t\n\r]/.test(text) && !/^0x/i.test(text)) return text;
  return `0x${bytes.toString("hex")}`;
}

function parseUrlTealKey(s: string): string {
  const hex = /^0x((?:[0-9a-f]{2})*)$/i.exec(s);
  return (hex ? Buffer.from(hex[1], "hex") : Buffer.from(s, "utf8")).toString("base64");
}

/** `["global-state", "Y291bnRlcg=="]` → `global.counter` */
export function formatField(path: FieldPath): string {
  return path
    .map((segment, i) => (tealMapKeys.has(path[i - 1]) ? urlTealKey(segment) : toShort.get(segment) ?? segment))
    .join(".");
}

/** `global.counter` → `["global-state", "Y291bnRlcg=="]`; undefined where it is not a path. */
export function parseField(s: string): FieldPath | undefined {
  const path: FieldPath = [];
  let rest = s;
  while (rest) {
    const dot = rest.indexOf(".");
    const segment = dot < 0 ? rest : rest.slice(0, dot);
    rest = dot < 0 ? "" : rest.slice(dot + 1);
    if (!segment) return undefined;
    const name = toLong.get(segment) ?? segment;
    path.push(name);
    // A TEAL key is always last, and may hold dots.
    if (tealMapKeys.has(name) && dot >= 0) {
      path.push(parseUrlTealKey(rest));
      break;
    }
  }
  return path.length ? path : undefined;
}

/** The pages that list several objects: an account's, and an app's with its boxes. */
export type VersionObjects = "account" | "app";

const objectKinds: Record<VersionObjects, Set<ObjKind>> = {
  account: new Set(["base", "asset", "local", "created-asset", "created-app"]),
  app: new Set(["app", "box"]),
};

/** What a field without an object is about: the account itself, or the app. */
const defaultObject: Record<VersionObjects, string> = { account: "base", app: "app" };

/**
 * An object's ref from its objKey (`base`, `asset:31566704`, `app`,
 * `box:<base64 name>`, ...); undefined where it is not one. A `+` in a box
 * name typed into a query unescaped reads back as a space.
 */
export function parseObjKey(key: string): ObjRef | undefined {
  const [kind, id, ...extra] = key.split(":");
  if (extra.length) return undefined;
  if (kind === "base" || kind === "app") return id === undefined ? { kind } : undefined;
  if (kind === "box") {
    const b64 = id?.replace(/ /g, "+");
    if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return undefined;
    return { kind, id: Buffer.from(b64, "base64").toString("base64") };
  }
  if (!objectKinds.account.has(kind as ObjKind)) return undefined;
  return id !== undefined && /^\d+$/.test(id) ? { kind: kind as ObjKind, id: Number(id) } : undefined;
}

/**
 * The filter in a page's query: undefined where there is none. `objects`:
 * which objects the page lists, where it lists several, so `object` applies.
 */
export function parseVersionFilter(params: URLSearchParams, objects?: VersionObjects): VersionFilter | undefined {
  const fields = params.getAll("field").map(parseField).filter((f): f is FieldPath => !!f);
  let object: string | undefined;
  if (objects) {
    const parsed = parseObjKey(params.get("object") ?? "");
    const ref = parsed && objectKinds[objects].has(parsed.kind) ? parsed : undefined;
    // As the touches key it: `asset:007` is `asset:7`.
    object = ref ? objKey(ref) : fields.length ? defaultObject[objects] : undefined;
  }
  return object || fields.length ? { object, fields } : undefined;
}

const queryValue = (v: string) => encodeURIComponent(v).replace(/%3A/gi, ":");

/** `path` (with any query, e.g. `round`) showing the versions `filter` picks, or all of them without one. */
export function withVersionFilter(path: string, filter: VersionFilter | undefined): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("object");
  params.delete("field");
  if (filter?.object) params.append("object", filter.object);
  for (const field of filter?.fields ?? []) params.append("field", formatField(field));
  const qs = [...params].map(([k, v]) => `${k}=${queryValue(v)}`).join("&");
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Whether a version did what the filter looks for, from its objects' summaries
 * (made with the filter's fields, and of its object only): changed one of the
 * fields, or without fields, changed at all. Undefined while that depends on
 * a previous state still being read.
 */
export function versionMatches(summaries: ObjectSummary[], fields: FieldPath[]): boolean | undefined {
  let pending = false;
  for (const s of summaries) {
    if (s.status === "pending") {
      pending = true;
    } else if (s.status === "error" || (fields.length ? s.changes.length > 0 : s.status !== "unchanged")) {
      return true;
    }
  }
  return pending ? undefined : false;
}

/**
 * A version list's date range, as the URL carries it:
 *
 *   ?from=2026-01-01T00:00:00Z         the versions at or after an instant
 *   ?to=2026-02-01T00:00:00Z           ...at or before one
 *
 * Each an ISO 8601 date and time (UTC where it names no offset) or Unix
 * seconds; held as Unix seconds. It applies along with any VersionFilter.
 */
export type VersionRange = { from?: number; to?: number };

/** An instant from a URL query value, in Unix seconds; undefined where it is not one. */
export function parseInstant(raw: string | null): number | undefined {
  if (!raw) return undefined;
  // Date-time without an offset: UTC, not the reader's zone, so a link reads alike everywhere.
  const iso = /^\d{4}-\d\d-\d\dT[\d:.]+$/.test(raw) ? `${raw}Z` : raw;
  const ms = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(iso);
  // Beyond what Date holds, it could not be shown or linked to.
  return Number.isFinite(new Date(ms).getTime()) ? Math.floor(ms / 1000) : undefined;
}

/** `1767225600` → `2026-01-01T00:00:00Z` */
export function formatInstant(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.000Z$/, "Z");
}

/** The date range in a page's query: undefined where there is none. */
export function parseVersionRange(params: URLSearchParams): VersionRange | undefined {
  const from = parseInstant(params.get("from"));
  const to = parseInstant(params.get("to"));
  return from !== undefined || to !== undefined ? { from, to } : undefined;
}

/** `path` (with any query) showing the versions in `range`, or of any date without one. */
export function withVersionRange(path: string, range: VersionRange | undefined): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("from");
  params.delete("to");
  if (range?.from !== undefined) params.append("from", formatInstant(range.from));
  if (range?.to !== undefined) params.append("to", formatInstant(range.to));
  const qs = [...params].map(([k, v]) => `${k}=${queryValue(v)}`).join("&");
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * A version list's order, as the URL carries it: `?order=asc` for oldest
 * first; newest first without it, so a link lists alike for every reader.
 */
export function parseVersionsOrder(params: URLSearchParams): VersionsOrder {
  return params.get("order") === "asc" ? "asc" : "desc";
}

/** `path` (with any query) listing its versions in `order`. */
export function withVersionsOrder(path: string, order: VersionsOrder): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("order");
  if (order === "asc") params.append("order", "asc");
  const qs = [...params].map(([k, v]) => `${k}=${queryValue(v)}`).join("&");
  return qs ? `${pathname}?${qs}` : pathname;
}
