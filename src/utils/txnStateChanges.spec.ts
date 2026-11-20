import { describe, expect, it } from "vitest";
import { byApp, explorerInnerPath, findTxn, innerNodePath, SCChange, SCRound, attribute, changeId, childrenOf, descendantsOf, accountRows, groupChangedAny, groupOfTxn, SCGroup } from "./txnStateChanges";

const g = (app: number, key: string): SCChange => ({ "app-id": app, "app-state-type": "g", key, after: { type: 2, uint: 1 } });
const l = (app: number, account: string, key: string): SCChange => ({ "app-id": app, "app-state-type": "l", account, key });
const b = (app: number, key: string): SCChange => ({ "app-id": app, "app-state-type": "b", key, before: { type: 1, bytes: "AA==" } });

describe("byApp", () => {
  it("splits changes by app, in first-change order, and locals by account", () => {
    const apps = byApp([g(2, "a"), b(1, "x"), l(2, "A", "k"), l(2, "B", "k"), l(2, "A", "j"), g(1, "c")]);
    expect(apps.map((a) => a.appId)).toEqual([2, 1]);
    expect(apps[0].globals.map((c) => c.key)).toEqual(["a"]);
    expect(apps[0].locals.map((x) => [x.account, x.changes.map((c) => c.key)])).toEqual([
      ["A", ["k", "j"]],
      ["B", ["k"]],
    ]);
    expect(apps[1].boxes.map((c) => c.key)).toEqual(["x"]);
    expect(apps[1].globals.map((c) => c.key)).toEqual(["c"]);
  });
});

describe("inner paths", () => {
  it("maps the explorer's 1-based inner path to the node's 0-based one and back", () => {
    expect(innerNodePath(5, "2/1")).toEqual([5, 1, 0]);
    expect(explorerInnerPath([5, 1, 0])).toBe("2/1");
    expect(explorerInnerPath([5])).toBe("");
  });
});

describe("findTxn", () => {
  const answer: SCRound = {
    round: 10,
    txns: [
      { path: [3], txid: "T1", changes: [g(1, "a")] },
      { path: [3, 0], changes: [g(1, "a")] },
      { path: [3, 1, 2], changes: [b(2, "x")] },
      { path: [4], txid: "T2", changes: [g(1, "b")] },
    ],
  };

  it("finds a top-level txn by id", () => {
    expect(findTxn(answer, "T2").changes.map((c) => c.key)).toEqual(["b"]);
  });

  it("finds an inner txn by its explorer path under its top-level txn", () => {
    expect(findTxn(answer, "T1", "2/3").changes.map((c) => c.key)).toEqual(["x"]);
  });

  it("gives no changes for a txn the answer leaves out", () => {
    expect(findTxn(answer, "T1", "2")?.changes).toEqual([]);
    // Not in an answer about other transactions: not placed.
    expect(findTxn(answer, "T3")).toBeUndefined();
  });
});

describe("attribute", () => {
  const u = (n: number) => ({ type: 2, uint: n });
  const g = (key: string, before?: number, after?: number) => ({
    "app-id": 1, "app-state-type": "g" as const, key,
    ...(before === undefined ? {} : { before: u(before) }),
    ...(after === undefined ? {} : { after: u(after) }),
  });
  const answer = {
    round: 10,
    txns: [
      { path: [0], txid: "T", changes: [g("own", 1, 2), g("viaInner", 1, 3), g("mixed", 1, 9), g("deep", undefined, 5)] },
      { path: [0, 0], changes: [g("viaInner", 1, 3), g("mixed", 1, 4), g("deep", undefined, 5)] },
      { path: [0, 0, 1], changes: [g("deep", undefined, 5)] },
      { path: [1], txid: "U", changes: [g("other", 1, 2)] },
    ],
  };
  const top = answer.txns[0];
  const desc = descendantsOf(answer, [0]);
  const a = attribute(top, desc);
  const at = (key: string) => a.get(changeId(g(key)))!;

  it("finds the descendants and children", () => {
    expect(desc.map((t) => t.path)).toEqual([[0, 0], [0, 0, 1]]);
    expect(childrenOf(desc, [0]).map((t) => t.path)).toEqual([[0, 0]]);
  });

  it("attributes each change", () => {
    expect(at("own")).toEqual({ own: true, via: [] });
    expect(at("viaInner")).toEqual({ own: false, via: [[0, 0]] });
    // The inner took it 1 → 4; the outer then to 9.
    expect(at("mixed")).toEqual({ own: true, via: [[0, 0]] });
    // Innermost only.
    expect(at("deep")).toEqual({ own: false, via: [[0, 0, 1]] });
  });
});

describe("groups", () => {
  const g: SCGroup = {
    first: 2,
    count: 2,
    txids: ["A", "B"],
    accounts: [
      { address: "FEE", before: { amount: 1 }, after: { amount: 2 } },
      { address: "X", before: { amount: 5 }, after: { amount: 3 } },
    ],
    holdings: [{ address: "Y", "asset-id": 7, after: { "asset-id": 7, amount: 0 } }],
    "local-states": [{ address: "X", "app-id": 9, before: { id: 9 } }],
  };
  const answer: SCRound = { round: 1, txns: [], groups: [g], "fee-sink": "FEE" };

  it("finds a txn's group", () => {
    expect(groupOfTxn(answer, "B")).toBe(g);
    expect(groupOfTxn(answer, "C")).toBeUndefined();
  });

  it("merges changes by account", () => {
    const rows = accountRows(g);
    expect(rows.map((r) => r.address)).toEqual(["FEE", "X", "Y"]);
    expect(rows[1].account?.after?.amount).toBe(3);
    expect(rows[1].locals).toHaveLength(1);
    expect(rows[2].holdings).toHaveLength(1);
  });

  it("ignores the fee sink alone", () => {
    expect(groupChangedAny({ first: 0, count: 1, txids: ["A"], accounts: [g.accounts![0]] }, "FEE")).toBe(false);
    expect(groupChangedAny(g, "FEE")).toBe(true);
  });
});

describe("findTxn without the top-level entry", () => {
  // Txn T (payset 4) netted to nothing, so it's left out; its inner 2 changed a key.
  const inner = { path: [4, 1], changes: [{ "app-id": 1, "app-state-type": "g" as const, key: "a2V5", after: { type: 2, uint: 1 } }] };
  const answer: SCRound = { round: 1, txns: [inner], groups: [{ first: 3, count: 2, txids: ["S", "T"] }] };

  it("finds its inner txns through its group", () => {
    expect(findTxn(answer, "T", "2")).toBe(inner);
    expect(findTxn(answer, "T")).toEqual({ path: [4], txid: "T", changes: [] });
  });

  it("finds nothing without full deltas", () => {
    // An answer for T alone: its entries are all T's, so they give its payset index.
    expect(findTxn({ round: 1, txns: [inner] }, "T", "2")).toBe(inner);
    expect(findTxn({ round: 1, txns: [inner] }, "T")?.path).toEqual([inner.path[0]]);
    // Nothing changed at all.
    expect(findTxn({ round: 1, txns: [] }, "T", "2")?.changes).toEqual([]);
  });
});
