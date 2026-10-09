import { isUtf8 } from "src/utils/isUtf8";
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
 *   ?field=global.counter              the versions that changed a field
 *   ?object=local:123&field=local.foo  ...of one object
 *
 * `object` is an objKey. `field` is a path into the object's state, spelled
 * as the Changed chips spell it, and may repeat: any of them changing
 * matches. A field covers everything under it: `global` is any global state
 * change. On a page of several objects, a field without an object is about
 * the account itself (`base`).
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

const accountObjectKinds = new Set<ObjKind>(["base", "asset", "local", "created-asset", "created-app"]);

/** An account object's ref from its objKey (`base`, `asset:31566704`, ...); undefined where it is not one. */
export function parseObjKey(key: string): ObjRef | undefined {
  const [kind, id, ...extra] = key.split(":");
  if (extra.length || !accountObjectKinds.has(kind as ObjKind)) return undefined;
  if (kind === "base") return id === undefined ? { kind } : undefined;
  return id !== undefined && /^\d+$/.test(id) ? { kind: kind as ObjKind, id: Number(id) } : undefined;
}

/**
 * The filter in a page's query: undefined where there is none. `objects`:
 * whether the page lists several objects (an account's), so `object` applies.
 */
export function parseVersionFilter(params: URLSearchParams, objects: boolean): VersionFilter | undefined {
  const fields = params.getAll("field").map(parseField).filter((f): f is FieldPath => !!f);
  let object: string | undefined;
  if (objects) {
    const ref = parseObjKey(params.get("object") ?? "");
    // As the touches key it: `asset:007` is `asset:7`.
    object = ref ? objKey(ref) : fields.length ? "base" : undefined;
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
