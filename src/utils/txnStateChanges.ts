import type { TTInt } from "./timeTravel";

/**
 * Per-transaction app state changes from dt-algorand's
 * `GET /v2/deltas/{round}/txn/state-changes`: every global key, local key and
 * box a transaction changed, with its value before and after that
 * transaction, exact even when other transactions in the round touched the
 * same state. The node re-evaluates the round to get them.
 *
 * The types are the node's JSON (bytes as base64, uint64 as number, or bigint
 * past 2^53): dt-algosdk's models through nodeJson (see getTxnStateChanges
 * in timeTravel.ts), as the other time-travel reads.
 */

/** A TEAL value: type 1 is bytes, 2 is uint. */
export type SCTealValue = { type: number; bytes?: string; uint?: TTInt };

export type SCStateType = "g" | "l" | "b";

/**
 * One key a transaction changed. No `before`: the key did not exist. No
 * `after`: it was deleted, or its local state cleared, or its app deleted.
 * A box's value is the whole box, as bytes.
 */
export type SCChange = {
  "app-id": number;
  "app-state-type": SCStateType;
  /** The account, for a local state key. */
  account?: string;
  /** The key, or the box name (base64). */
  key: string;
  before?: SCTealValue;
  after?: SCTealValue;
};

/** A transaction's changes, net over it and its inner transactions, in the order it first made them. */
export type SCTxn = {
  /** Its index in the block's payset, then its index among its parent's inner transactions at each level (0-based). */
  path: number[];
  /** Top-level transactions only. */
  txid?: string;
  changes: SCChange[];
};

/**
 * The transactions of a round that changed app state, top-level and inner, in
 * execution order; with full deltas (`include`), also what each group
 * changed besides app state.
 */
export type SCRound = {
  round: number;
  txns: SCTxn[];
  /** With full deltas: one per top-level group that changed something, in block order; left out where none did. */
  groups?: SCGroup[];
  /** With full deltas: the fee sink's address, an account every group pays into. */
  "fee-sink"?: string;
};

// ---------------------------------------------------------------------------
// Full deltas: what a group changed besides app state
//
// Per group, not per transaction: the evaluator applies a group, its inner
// transactions included, as one unit. Each entry is listed only where its
// before and after differ. No `before`: created or opted in. No `after`:
// closed, destroyed, deleted or opted out.

/**
 * An account's own fields, under algod's Account names (`amount`,
 * `min-balance`, `status`, `auth-addr`, the counters, `participation` …),
 * zeros and falses left out.
 */
export type SCAccountState = Record<string, any>;
export type SCAccountChange = { address: string; before?: SCAccountState; after?: SCAccountState };

export type SCHolding = { "asset-id": TTInt; amount?: TTInt; "is-frozen"?: boolean };
export type SCHoldingChange = { address: string; "asset-id": TTInt; before?: SCHolding; after?: SCHolding };

/** algod's AssetParams. */
export type SCAssetParams = Record<string, any>;
export type SCAssetChange = { "asset-id": TTInt; before?: SCAssetParams; after?: SCAssetParams };

/** algod's ApplicationParams, without global state (its changes are in `txns`). */
export type SCAppParams = Record<string, any>;
export type SCAppChange = { "app-id": TTInt; before?: SCAppParams; after?: SCAppParams };

/** An app's local state existing: opted in. Its keys' changes are in `txns`. */
export type SCLocalState = { id: TTInt; schema?: { "num-uint"?: TTInt; "num-byte-slice"?: TTInt } };
export type SCLocalChange = { address: string; "app-id": TTInt; before?: SCLocalState; after?: SCLocalState };

export type SCGroup = {
  /** The payset index of its first top-level transaction (= `path[0]` in `txns`). */
  first: number;
  /** Its top-level transactions: payset indexes first .. first+count-1. */
  count: number;
  /** Base64; left out for a lone transaction. */
  "group-id"?: string;
  /** Its top-level transactions, in payset order. */
  txids: string[];
  accounts?: SCAccountChange[];
  holdings?: SCHoldingChange[];
  assets?: SCAssetChange[];
  apps?: SCAppChange[];
  "local-states"?: SCLocalChange[];
};

// ---------------------------------------------------------------------------
// Reading the answer

/** The changes of one app, split by kind; locals by account, in first-change order. */
export type SCAppChanges = {
  appId: number;
  globals: SCChange[];
  locals: { account: string; changes: SCChange[] }[];
  boxes: SCChange[];
};

/** `changes` by app, in the order each app was first changed. */
export function byApp(changes: SCChange[]): SCAppChanges[] {
  const apps = new Map<number, SCAppChanges>();
  for (const c of changes) {
    const appId = Number(c["app-id"]);
    let app = apps.get(appId);
    if (!app) {
      app = { appId, globals: [], locals: [], boxes: [] };
      apps.set(appId, app);
    }
    if (c["app-state-type"] === "g") app.globals.push(c);
    else if (c["app-state-type"] === "b") app.boxes.push(c);
    else {
      const account = c.account ?? "";
      let local = app.locals.find((l) => l.account === account);
      if (!local) {
        local = { account, changes: [] };
        app.locals.push(local);
      }
      local.changes.push(c);
    }
  }
  return [...apps.values()];
}

/**
 * The node's path of an inner transaction: its top-level transaction's payset
 * index, then the explorer's 1-based inner path ("2/1") as 0-based indexes.
 */
export function innerNodePath(topIndex: number, innerPath: string): number[] {
  return [topIndex, ...innerPath.split("/").map((i) => Number(i) - 1)];
}

/** The explorer's 1-based inner path ("2/1") of a node path, "" for a top-level one. */
export function explorerInnerPath(path: number[]): string {
  return path.slice(1).map((i) => i + 1).join("/");
}

export function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => Number(x) === Number(b[i]));
}

/**
 * The payset index of top-level transaction `txid`: from its entry, or, where
 * it has none, from its group's (full deltas); undefined where neither says.
 */
export function paysetIndex(answer: SCRound, txid: string): number | undefined {
  const top = answer.txns.find((t) => t.txid === txid && t.path.length === 1);
  if (top) return Number(top.path[0]);
  const g = groupOfTxn(answer, txid);
  return g ? Number(g.first) + g.txids.indexOf(txid) : undefined;
}

/**
 * The entry of the transaction at `innerPath` under `txid` ("" for `txid`
 * itself); one without changes where it changed no app state, as the
 * answer leaves those out. A top-level txn whose changes net to nothing is
 * left out too, though its inner txns' changes are listed; finding those
 * needs its payset index: from its group (full deltas), or, in an answer
 * for `txid` alone, from any entry, as they're all its own. Undefined where
 * neither says.
 */
export function findTxn(answer: SCRound, txid: string, innerPath = ""): SCTxn | undefined {
  let index = paysetIndex(answer, txid);
  if (index === undefined) {
    const roots = new Set(answer.txns.map((t) => Number(t.path[0])));
    // Nothing changed at all.
    if (!roots.size) return { path: [], ...(innerPath ? {} : { txid }), changes: [] };
    if (roots.size > 1 || answer.txns.some((t) => t.txid && t.txid !== txid)) return undefined;
    index = [...roots][0];
  }
  const path = innerPath ? innerNodePath(index, innerPath) : [index];
  return answer.txns.find((t) => samePath(t.path, path)) ?? { path, ...(innerPath ? {} : { txid }), changes: [] };
}

/** The base64 of a change's value, for boxes; null where there is none. */
export function boxValue(v: SCTealValue | undefined): string | null {
  return v ? (v.bytes ?? "") : null;
}

// ---------------------------------------------------------------------------
// Outer vs inner

/** A key's identity across entries: its app, kind, account and key. */
export function changeId(c: SCChange): string {
  return `${Number(c["app-id"])}|${c["app-state-type"]}|${c.account ?? ""}|${c.key}`;
}

export function sameValue(a: SCTealValue | undefined, b: SCTealValue | undefined): boolean {
  if (!a || !b) return !a && !b;
  return Number(a.type) === Number(b.type) && (a.bytes ?? "") === (b.bytes ?? "") && String(a.uint ?? 0) === String(b.uint ?? 0);
}

function isUnder(path: number[], parent: number[]): boolean {
  return path.length > parent.length && parent.every((x, i) => Number(path[i]) === Number(x));
}

/** The entries of the transactions under `path`, at any depth, in execution order. */
export function descendantsOf(answer: SCRound, path: number[]): SCTxn[] {
  return path.length ? answer.txns.filter((t) => isUnder(t.path, path)) : [];
}

/** Of `entries`, those directly under `path`. */
export function childrenOf(entries: SCTxn[], path: number[]): SCTxn[] {
  return entries.filter((t) => t.path.length === path.length + 1 && isUnder(t.path, path));
}

/**
 * Who made a change of a transaction with inner transactions. `via`: the
 * innermost transactions that changed the key (node paths), in execution
 * order. `own`: the transaction's own code changed it, which shows where no
 * inner transaction did, or where the inner transactions' changes don't
 * chain from its before to its after. A transaction can also change a key and
 * restore it around its inner calls; that doesn't show.
 */
export type SCAttribution = { own: boolean; via: number[][] };

/** The attribution of each of `entry`'s changes, by changeId; `descendants` are the entries under it. */
export function attribute(entry: SCTxn, descendants: SCTxn[]): Map<string, SCAttribution> {
  const byId = descendants.map((t) => ({ t, changes: new Map(t.changes.map((c) => [changeId(c), c])) }));
  const result = new Map<string, SCAttribution>();
  for (const c of entry.changes) {
    const id = changeId(c);
    const touching = byId.filter((d) => d.changes.has(id));
    // Innermost: no other touching entry is under it.
    const via = touching
      .filter((d) => !touching.some((o) => isUnder(o.t.path, d.t.path)))
      .map((d) => d.t.path.map(Number));
    // The direct children's changes, chained from this txn's before to its after.
    const steps = touching.filter((d) => d.t.path.length === entry.path.length + 1).map((d) => d.changes.get(id)!);
    let own = !steps.length;
    let at = c.before;
    for (const s of steps) {
      if (!sameValue(at, s.before)) own = true;
      at = s.after;
    }
    if (steps.length && !sameValue(at, c.after)) own = true;
    result.set(id, { own, via });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Groups

/** The group holding top-level transaction `txid`; undefined where the group changed nothing. */
export function groupOfTxn(answer: SCRound, txid: string): SCGroup | undefined {
  return answer.groups?.find((g) => g.txids.includes(txid));
}

/** Whether the group changed anything besides app state, ignoring the fee sink. */
export function groupChangedAny(g: SCGroup, feeSink?: string): boolean {
  return !!(
    g.accounts?.some((a) => a.address !== feeSink) ||
    g.holdings?.length ||
    g.assets?.length ||
    g.apps?.length ||
    g["local-states"]?.length
  );
}

/** One account's changes in a group: its own record, its holdings and its local state opt-ins and opt-outs. */
export type SCAccountRow = {
  address: string;
  account?: SCAccountChange;
  holdings: SCHoldingChange[];
  locals: SCLocalChange[];
};

/** The group's account, holding and local state changes by account, sorted by address as the node sorts them. */
export function accountRows(g: SCGroup): SCAccountRow[] {
  const rows = new Map<string, SCAccountRow>();
  const row = (address: string) => {
    let r = rows.get(address);
    if (!r) rows.set(address, (r = { address, holdings: [], locals: [] }));
    return r;
  };
  for (const a of g.accounts ?? []) row(a.address).account = a;
  for (const h of g.holdings ?? []) row(h.address).holdings.push(h);
  for (const l of g["local-states"] ?? []) row(l.address).locals.push(l);
  return [...rows.values()].sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
}
