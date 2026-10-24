import { isUtf8 } from "src/utils/isUtf8";
import type {
  TTAccountVersion,
  TTAppLocalState,
  TTAppParams,
  TTAppStateVersion,
  TTAssetHolding,
  TTBoxVersion,
  TTInt,
  TTKeyValue,
} from "src/utils/timeTravel";

/**
 * Turns version histories from the time-travel algod into per-row deltas.
 *
 * Each object an entry touches is normalised into plain JSON keyed by stable
 * ids (TEAL keys, not array indexes), so two versions diff field by field.
 */

/** TEAL bytes: rendered with the byte-format switcher, compared as base64. */
export type BytesLeaf = { $bytes: string };
/** A program: rendered as its size and hash, compared as base64. */
export type ProgramLeaf = { $program: string };

export type DJson =
  | string
  | number
  | bigint
  | boolean
  | null
  | BytesLeaf
  | ProgramLeaf
  | DJson[]
  | { [key: string]: DJson };

export type DObject = { [key: string]: DJson };

/** An object's state; null where it did not exist (never created, deleted, closed). */
export type Snapshot = DObject | null;

export function isBytesLeaf(v: unknown): v is BytesLeaf {
  return typeof v === "object" && v !== null && typeof (v as BytesLeaf).$bytes === "string";
}

export function isProgramLeaf(v: unknown): v is ProgramLeaf {
  return typeof v === "object" && v !== null && typeof (v as ProgramLeaf).$program === "string";
}

export function isPlainObject(v: unknown): v is { [key: string]: DJson } {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !isBytesLeaf(v) && !isProgramLeaf(v);
}

// ---------------------------------------------------------------------------
// Objects

export type ObjKind = "app" | "base" | "asset" | "local" | "created-asset" | "created-app" | "box";

/** `id`: an asset or app id, or a box's name in base64. */
export type ObjRef = { kind: ObjKind; id?: TTInt | string };

export function objKey(ref: ObjRef): string {
  return ref.id === undefined ? ref.kind : `${ref.kind}:${ref.id}`;
}

export const objKindLabel: Record<ObjKind, string> = {
  app: "Application",
  base: "Account",
  asset: "Asset holding",
  local: "Local state",
  "created-asset": "Created asset",
  "created-app": "Created app",
  box: "Box",
};

/** Object kinds keyed by TEAL key rather than by name. */
export const tealMapKeys = new Set(["global-state", "key-value"]);

function normalizeKv(kv: TTKeyValue[] | undefined): DObject {
  const entries = [...(kv ?? [])].sort((a, b) =>
    Buffer.compare(Buffer.from(a.key, "base64"), Buffer.from(b.key, "base64")),
  );
  const out: DObject = {};
  for (const { key, value } of entries) {
    out[key] = value.type === 1 ? { $bytes: value.bytes } : value.uint;
  }
  return out;
}

const emptySchema = { "num-byte-slice": 0, "num-uint": 0 };

/** algod leaves out zero values, so default them: otherwise a 0 → 1 change reads as "added". */
export function normalizeAppParams(p: TTAppParams): DObject {
  return {
    "global-state": normalizeKv(p["global-state"]),
    creator: p.creator,
    version: p.version ?? 0,
    "global-state-schema": { ...emptySchema, ...p["global-state-schema"] },
    "local-state-schema": { ...emptySchema, ...p["local-state-schema"] },
    "extra-program-pages": p["extra-program-pages"] ?? 0,
    "approval-program": { $program: p["approval-program"] },
    "clear-state-program": { $program: p["clear-state-program"] },
  };
}

function normalizeLocalState(s: TTAppLocalState): DObject {
  return {
    "key-value": normalizeKv(s["key-value"]),
    schema: { ...emptySchema, ...s.schema },
  };
}

function normalizeHolding(h: TTAssetHolding): DObject {
  return { amount: h.amount ?? 0, "is-frozen": !!h["is-frozen"] };
}

/**
 * The account's base record, as `exclude=all` returns it. `round` is when it
 * was read, and the pending reward fields restate `amount`, so neither is part
 * of the state. A closed account reads back as all zeros rather than 404, so
 * treat a zero balance as absent, like a deleted record.
 */
export function normalizeAccountBase(a: Record<string, unknown>): Snapshot {
  if (!a || !Number(a["amount-without-pending-rewards"] ?? a.amount ?? 0)) {
    return null;
  }
  const { round, "amount-without-pending-rewards": _, "pending-rewards": __, ...rest } = a;
  return rest as DObject;
}

function normalizeAssetParams(p: Record<string, unknown> | undefined): DObject {
  return { ...(p ?? {}) } as DObject;
}

// ---------------------------------------------------------------------------
// Touches: the objects one version entry changed, with their new state

export type Touch = { key: string; ref: ObjRef; after: Snapshot };

/** A box's state is its value, as one bytes leaf. */
function normalizeBox(value: string): DObject {
  return { value: { $bytes: value } };
}

/** The app where its params changed (`deleted` is there), then each box that changed, as `box:<name>`. */
export function appVersionTouches(v: TTAppStateVersion): Touch[] {
  const touches: Touch[] = [];
  if (v.deleted !== undefined) {
    const ref: ObjRef = { kind: "app" };
    touches.push({ key: objKey(ref), ref, after: v.deleted || !v.application ? null : normalizeAppParams(v.application.params) });
  }
  for (const b of v.boxes ?? []) {
    const ref: ObjRef = { kind: "box", id: b.name };
    touches.push({ key: objKey(ref), ref, after: b.deleted || b.value === undefined ? null : normalizeBox(b.value) });
  }
  return touches;
}

export function boxVersionTouches(v: TTBoxVersion): Touch[] {
  const ref: ObjRef = { kind: "box" };
  return [{ key: objKey(ref), ref, after: v.deleted || v.value === undefined ? null : normalizeBox(v.value) }];
}

/**
 * With created params excluded, created-asset/app entries only mark creation
 * and destruction, so they normalise to {} (exists) or null.
 */
export function accountVersionTouches(v: TTAccountVersion, includeCreatedParams: boolean): Touch[] {
  const touches: Touch[] = [];
  const add = (ref: ObjRef, after: Snapshot) => touches.push({ key: objKey(ref), ref, after });

  if (v.base) {
    add({ kind: "base" }, v.base.deleted || !v.base.account ? null : normalizeAccountBase(v.base.account));
  }
  for (const h of v.assets ?? []) {
    add({ kind: "asset", id: h["asset-id"] }, h.deleted || !h["asset-holding"] ? null : normalizeHolding(h["asset-holding"]));
  }
  for (const l of v["apps-local-state"] ?? []) {
    add({ kind: "local", id: l["app-id"] }, l.deleted || !l["app-local-state"] ? null : normalizeLocalState(l["app-local-state"]));
  }
  for (const c of v["created-assets"] ?? []) {
    add(
      { kind: "created-asset", id: c["asset-id"] },
      c.deleted ? null : includeCreatedParams && c.asset ? normalizeAssetParams(c.asset.params) : {},
    );
  }
  for (const c of v["created-apps"] ?? []) {
    add(
      { kind: "created-app", id: c["app-id"] },
      c.deleted ? null : includeCreatedParams && c.application ? normalizeAppParams(c.application.params) : {},
    );
  }
  return touches;
}

// ---------------------------------------------------------------------------
// Baselines: an object's state at a round, from the `?round=` lookups

export type BaselineContext =
  | { kind: "app"; appId: number; includeBoxes: boolean }
  | { kind: "account"; address: string; includeCreatedParams: boolean }
  | { kind: "box"; appId: number; name: string };

/**
 * The request that reads `ref` at `round`. A holding and a created asset share
 * one endpoint (as do local state and a created app), so the same request is
 * keyed once and `extractBaseline` picks the part it needs.
 */
export function baselineRequest(
  ctx: BaselineContext,
  ref: ObjRef,
  round: number,
): { path: string; query: Record<string, string | number> } {
  const boxAt = (appId: number, name: string) => ({ path: `/v2/applications/${appId}/box`, query: { name: `b64:${name}`, round } });
  if (ctx.kind === "app") {
    return ref.kind === "box" ? boxAt(ctx.appId, String(ref.id)) : { path: `/v2/applications/${ctx.appId}`, query: { round } };
  }
  if (ctx.kind === "box") {
    return boxAt(ctx.appId, ctx.name);
  }
  const account = `/v2/accounts/${ctx.address}`;
  switch (ref.kind) {
    case "base":
      return { path: account, query: { round, exclude: "all" } };
    case "asset":
    case "created-asset":
      return { path: `${account}/assets/${ref.id}`, query: { round } };
    default:
      return { path: `${account}/applications/${ref.id}`, query: { round } };
  }
}

/** `response` is null where the lookup 404'd: the object did not exist at that round. */
export function extractBaseline(ctx: BaselineContext, ref: ObjRef, response: any): Snapshot {
  if (!response) return null;
  const includeCreatedParams = ctx.kind === "account" && ctx.includeCreatedParams;
  switch (ref.kind) {
    case "app":
      return normalizeAppParams(response.params);
    case "base":
      return normalizeAccountBase(response);
    case "asset":
      return response["asset-holding"] ? normalizeHolding(response["asset-holding"]) : null;
    case "local":
      return response["app-local-state"] ? normalizeLocalState(response["app-local-state"]) : null;
    case "created-asset":
      if (!response["created-asset"]) return null;
      return includeCreatedParams ? normalizeAssetParams(response["created-asset"]) : {};
    case "created-app":
      if (!response["created-app"]) return null;
      return includeCreatedParams ? normalizeAppParams(response["created-app"]) : {};
    case "box":
      return normalizeBox(response.value);
  }
}

// ---------------------------------------------------------------------------
// Rows: each version with every touched object's before and after

/** The state of `ref` at `round`, which row `row` (an index into the versions) diffs against. */
export type BaselineNeed = { key: string; ref: ObjRef; round: number; row: number };

/** `before` is undefined while its baseline is still loading, or when reading it failed. */
export type RowObject = Touch & { before: Snapshot | undefined; baseline?: BaselineNeed; baselineError?: string };

/** Baselines read so far, by `baselineId`: the state, or why it could not be read. */
export type Baselines = Map<string, Snapshot | Error>;

export type VersionRow<V> = { round: number; timestamp: number; version: V; objects: RowObject[] };

export function baselineId(need: { key: string; round: number }): string {
  return `${need.key}@${need.round}`;
}

/**
 * Pair every touched object with its previous state. `versions` is newest
 * first, and covers every version in its round range, so an object's previous
 * state is its nearest older loaded touch. Past the oldest loaded touch it is
 * the state just before that round - read from the node while older versions
 * remain (`hasOlder`), and nothing once the list is complete.
 */
export function buildRows<V extends { round: number; timestamp: number }>(
  versions: V[],
  touchesOf: (v: V) => Touch[],
  hasOlder: boolean,
  baselines: Baselines,
): { rows: VersionRow<V>[]; needs: BaselineNeed[] } {
  const rows: VersionRow<V>[] = new Array(versions.length);
  const needs: BaselineNeed[] = [];
  const later = new Map<string, Snapshot>();

  for (let i = versions.length - 1; i >= 0; i--) {
    const version = versions[i];
    const objects: RowObject[] = touchesOf(version).map((touch) => {
      if (later.has(touch.key)) {
        return { ...touch, before: later.get(touch.key) };
      }
      if (!hasOlder) {
        return { ...touch, before: null };
      }
      const need = { key: touch.key, ref: touch.ref, round: version.round - 1, row: i };
      needs.push(need);
      const baseline = baselines.get(baselineId(need));
      if (baseline instanceof Error) {
        return { ...touch, before: undefined, baseline: need, baselineError: baseline.message };
      }
      return { ...touch, before: baseline, baseline: need };
    });
    for (const o of objects) later.set(o.key, o.after);
    rows[i] = { round: version.round, timestamp: version.timestamp, version, objects };
  }
  return { rows, needs };
}

// ---------------------------------------------------------------------------
// Diff

export type ChangeKind = "added" | "removed" | "changed";

export type Change = { path: string[]; kind: ChangeKind; before?: DJson; after?: DJson };

export function deepEqual(a: DJson | undefined, b: DJson | undefined): boolean {
  if (a === b) return true;
  if (isBytesLeaf(a) && isBytesLeaf(b)) return a.$bytes === b.$bytes;
  if (isProgramLeaf(a) && isProgramLeaf(b)) return a.$program === b.$program;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    return ak.length === bk.length && ak.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/** Leaf-level changes from `before` to `after`; undefined/null on either side means absent. */
export function diff(before: DJson | undefined, after: DJson | undefined, path: string[] = []): Change[] {
  const hasBefore = before !== undefined && !(path.length === 0 && before === null);
  const hasAfter = after !== undefined && !(path.length === 0 && after === null);
  if (!hasBefore && !hasAfter) return [];
  if (!hasBefore) return [{ path, kind: "added", after }];
  if (!hasAfter) return [{ path, kind: "removed", before }];
  if (deepEqual(before, after)) return [];
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...Object.keys(after), ...Object.keys(before).filter((k) => !(k in after))];
    return keys.flatMap((k) => diff(before[k], after[k], [...path, k]));
  }
  return [{ path, kind: "changed", before, after }];
}

// ---------------------------------------------------------------------------
// Fields: paths into a state, to narrow a delta to

/** A path into an object's state; TEAL keys in base64, as in Change.path. */
export type FieldPath = string[];

/** The value at `path` in `state`; undefined where there is none. */
export function valueAt(state: DJson | undefined, path: FieldPath): DJson | undefined {
  let v = state;
  for (const segment of path) {
    if (Array.isArray(v) && /^\d+$/.test(segment)) {
      v = v[Number(segment)];
    } else if (isPlainObject(v) && Object.prototype.hasOwnProperty.call(v, segment)) {
      v = v[segment];
    } else {
      return undefined;
    }
  }
  return v;
}

function isPrefix(prefix: FieldPath, path: FieldPath): boolean {
  return prefix.length <= path.length && prefix.every((s, i) => s === path[i]);
}

/** `fields` without those inside another (or repeated): their changes are the other's. */
export function fieldRoots(fields: FieldPath[]): FieldPath[] {
  return fields.filter((p, i) => !fields.some((q, j) => j !== i && isPrefix(q, p) && (q.length < p.length || j < i)));
}

/**
 * The changes from `before` to `after` at `fields` only, each at its own path:
 * a key added under a field shows at the key, not at its parent.
 */
export function diffFields(before: Snapshot | undefined, after: Snapshot | undefined, fields: FieldPath[]): Change[] {
  return fieldRoots(fields).flatMap((field) => diff(valueAt(before, field), valueAt(after, field), field));
}

/** The changes of `changes` away from `fields`: neither at or under one, nor above one. */
export function changesOutside(changes: Change[], fields: FieldPath[]): Change[] {
  const roots = fieldRoots(fields);
  return changes.filter((c) => !roots.some((f) => isPrefix(f, c.path) || isPrefix(c.path, f)));
}

/** A changed leaf in a delta tree. */
export type ChangeLeaf = { $change: Change };

export function isChangeLeaf(v: unknown): v is ChangeLeaf {
  return typeof v === "object" && v !== null && "$change" in v;
}

export type DeltaTree = ChangeLeaf | { [key: string]: DeltaTree };

/** Only the changed paths, nested as in the state, each ending in its change. */
export function buildDeltaTree(changes: Change[]): DeltaTree {
  const root: { [key: string]: DeltaTree } = {};
  for (const change of changes) {
    if (change.path.length === 0) return { $change: change };
    let node = root;
    change.path.forEach((segment, i) => {
      if (i === change.path.length - 1) {
        node[segment] = { $change: change };
      } else {
        if (!node[segment] || isChangeLeaf(node[segment])) node[segment] = {};
        node = node[segment] as { [key: string]: DeltaTree };
      }
    });
  }
  return root;
}

/**
 * The whole state with each change spliced in at its path: removed keys come
 * back (as their change), so nothing that went away is hidden.
 */
export function overlayChanges(state: Snapshot, changes: Change[]): DeltaTree | DJson {
  if (changes.some((c) => c.path.length === 0)) {
    return { $change: changes.find((c) => c.path.length === 0)! } as DeltaTree;
  }
  const clone = (v: DJson): any => (isPlainObject(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
  const root = clone(state ?? {});
  for (const change of changes) {
    let node = root;
    change.path.forEach((segment, i) => {
      if (i === change.path.length - 1) {
        node[segment] = { $change: change };
      } else {
        if (!isPlainObject(node[segment])) node[segment] = {};
        node = node[segment];
      }
    });
  }
  return root;
}

// ---------------------------------------------------------------------------
// Labels

/** A TEAL key as text where it is printable, else hex. */
export function displayTealKey(b64: string): string {
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length && isUtf8(bytes)) return bytes.toString("utf8");
  return `0x${bytes.toString("hex")}`;
}

/** Whether `segment` (the child of `parent`) is a base64 TEAL key. */
export function isTealKeySegment(parent: string | undefined): boolean {
  return parent !== undefined && tealMapKeys.has(parent);
}

export const shortSegment: Record<string, string> = {
  "global-state": "global",
  "key-value": "local",
};

/** `global-state.Y291bnRlcg==` → `global.counter` */
export function formatPath(path: string[]): string {
  return path
    .map((segment, i) => (isTealKeySegment(path[i - 1]) ? displayTealKey(segment) : shortSegment[segment] ?? segment))
    .join(".");
}

/** Account fields counted in microalgos. */
const algoFields = new Set(["amount", "min-balance", "rewards"]);

/**
 * What the integer at `path` in `ref`'s state counts, where it is an amount:
 * microalgos, or base units of the asset `ref` is about.
 */
export function amountUnit(ref: ObjRef, path: string[]): "algo" | "asset" | undefined {
  if (path.length !== 1) return undefined;
  const [field] = path;
  if (ref.kind === "base" && algoFields.has(field)) return "algo";
  if ((ref.kind === "asset" && field === "amount") || (ref.kind === "created-asset" && field === "total")) {
    return "asset";
  }
  return undefined;
}

export type ObjectSummary = {
  key: string;
  ref: ObjRef;
  status: "created" | "deleted" | "changed" | "unchanged" | "pending" | "error";
  changes: Change[];
  /** Its state after the version; before it, where the version deleted it. */
  state: Snapshot;
  error?: string;
};

/**
 * What a version did to an object. With `fields`, only to those: their
 * changes, and "unchanged" where none of them changed. `state` stays whole.
 */
export function summarizeObject(o: RowObject, fields?: FieldPath[]): ObjectSummary {
  const base = { key: o.key, ref: o.ref, state: o.after ?? o.before ?? null };
  if (o.baselineError) return { ...base, status: "error", changes: [], error: o.baselineError };
  if (o.before === undefined) return { ...base, status: "pending", changes: [] };
  let changes = fields?.length ? diffFields(o.before, o.after, fields) : diff(o.before, o.after);
  // Created/deleted with values excluded ({}): nothing to show but the event.
  const root = changes.length === 1 && changes[0].path.length === 0 ? changes[0] : undefined;
  if (root && isPlainObject(root.after ?? root.before) && !Object.keys(root.after ?? root.before).length) {
    changes = [];
  }
  if (fields?.length && !changes.length) return { ...base, status: "unchanged", changes };
  if (o.before === null && o.after !== null) return { ...base, status: "created", changes };
  if (o.before !== null && o.after === null) return { ...base, status: "deleted", changes };
  return { ...base, status: changes.length ? "changed" : "unchanged", changes };
}

/**
 * What a filtered version did besides what the filter picks: the changes its
 * `objects` made away from `fields` (with any), and each object in `rest` -
 * those the version touched that the filtered list does not hold.
 */
export function summarizeOthers(objects: RowObject[], fields: FieldPath[], rest: RowObject[]): ObjectSummary[] {
  const elsewhere = fields.length
    ? objects.flatMap((o) => {
        const s = summarizeObject(o);
        const changes = changesOutside(s.changes, fields);
        return changes.length ? [{ ...s, changes }] : [];
      })
    : [];
  return [...elsewhere, ...rest.map((o) => summarizeObject(o))];
}
