import { describe, expect, it } from "vitest";
import { classify, counterparty, FetchPage, findMatch, nextMinRound, scan, TxnPage, WatchTxn } from "./accountWatch";

const ME = "ME";
const OTHER = "OTHER";
const APP = "APP";

const pay = (sender: string, receiver: string, round = 10n, id = `${sender}-${receiver}-${round}`): WatchTxn => ({
  sender,
  id,
  txType: "pay",
  confirmedRound: round,
  paymentTransaction: { receiver },
});

describe("classify", () => {
  it("someone else's txn is incoming", () => {
    expect(classify(pay(OTHER, ME), ME)).toEqual({ incoming: true, outgoing: false });
  });
  it("the account's own txn is outgoing", () => {
    expect(classify(pay(ME, OTHER), ME)).toEqual({ incoming: false, outgoing: true });
  });
  it("an app account's inner send in someone else's call is both", () => {
    const call: WatchTxn = { sender: OTHER, txType: "appl", innerTxns: [{ sender: APP, innerTxns: [pay(ME, OTHER)] }] };
    expect(classify(call, ME)).toEqual({ incoming: true, outgoing: true });
  });
});

describe("findMatch", () => {
  it("incoming: only self-sent txns → null", () => {
    expect(findMatch([pay(ME, OTHER), pay(ME, ME)], ME, "incoming")).toBeNull();
  });
  it("incoming: the first txn someone else sent", () => {
    const a = pay(ME, OTHER, 12n);
    const b = pay(OTHER, ME, 11n);
    const c = pay(OTHER, ME, 10n);
    expect(findMatch([a, b, c], ME, "incoming")).toEqual({ txn: b, side: "incoming" });
  });
  it("outgoing: only received txns → null", () => {
    expect(findMatch([pay(OTHER, ME)], ME, "outgoing")).toBeNull();
  });
  it("outgoing: an inner txn sent by the (app) account", () => {
    const call: WatchTxn = { sender: OTHER, txType: "appl", innerTxns: [pay(ME, OTHER)] };
    expect(findMatch([call], ME, "outgoing")).toEqual({ txn: call, side: "outgoing" });
  });
  it("both: the first txn of either kind", () => {
    const out = pay(ME, OTHER, 11n);
    const inc = pay(OTHER, ME, 10n);
    expect(findMatch([out, inc], ME, "both")).toEqual({ txn: out, side: "outgoing" });
    expect(findMatch([inc, out], ME, "both")).toEqual({ txn: inc, side: "incoming" });
  });
});

describe("nextMinRound", () => {
  it("resumes after the indexer's current round", () => {
    expect(nextMinRound(100n, 105n)).toBe(106n);
  });
  it("never goes back when the indexer lags the tick", () => {
    expect(nextMinRound(100n, 98n)).toBe(100n);
  });
  it("passes the newest txn seen", () => {
    expect(nextMinRound(100n, 105n, 107n)).toBe(108n);
  });
});

describe("counterparty", () => {
  it("names the sender of an incoming txn and the receiver of an outgoing one", () => {
    expect(counterparty(pay(OTHER, ME), "incoming", ME)).toBe(OTHER);
    expect(counterparty(pay(ME, OTHER), "outgoing", ME)).toBe(OTHER);
    expect(counterparty({ sender: ME, txType: "appl" }, "outgoing", ME)).toBeUndefined();
  });
  it("names the receiver of an app account's inner send, not the outer call's", () => {
    const call: WatchTxn = { sender: OTHER, txType: "appl", innerTxns: [pay(APP, "X"), pay(ME, "PAYEE")] };
    expect(counterparty(call, "outgoing", ME)).toBe("PAYEE");
  });
});

/** An indexer stub: `pages[token ?? ""]` per request, recording each request. */
function stub(pages: Record<string, TxnPage<WatchTxn>>) {
  const calls: { minRound: bigint; token?: string }[] = [];
  const fetchPage: FetchPage<WatchTxn> = async (minRound, token) => {
    calls.push({ minRound, token });
    const page = pages[token ?? ""];
    if (!page) throw new Error(`no page ${token}`);
    return page;
  };
  return { fetchPage, calls };
}

describe("scan", () => {
  it("advances past the indexer's round when every page was read", async () => {
    const { fetchPage } = stub({ "": { transactions: [pay(ME, OTHER, 104n)], currentRound: 105n } });
    const res = await scan(fetchPage, { minRound: 100n }, ME, "incoming", 5);
    expect(res).toEqual({ match: null, state: { minRound: 106n } });
  });

  it("keeps the first page's round: a later page's newer round is not read", async () => {
    const { fetchPage } = stub({
      "": { transactions: [pay(ME, OTHER, 100n)], currentRound: 100n, nextToken: "p2" },
      p2: { transactions: [pay(ME, OTHER, 99n)], currentRound: 101n },
    });
    const res = await scan(fetchPage, { minRound: 99n }, ME, "incoming", 5);
    expect(res.state).toEqual({ minRound: 101n });
  });

  it("does not advance with pages left, and resumes from the next page", async () => {
    const { fetchPage, calls } = stub({
      "": { transactions: [pay(ME, OTHER, 103n)], currentRound: 103n, nextToken: "p2" },
      p2: { transactions: [pay(ME, OTHER, 102n)], currentRound: 104n, nextToken: "p3" },
      p3: { transactions: [pay(OTHER, ME, 101n, "old-incoming")], currentRound: 105n },
    });
    const first = await scan(fetchPage, { minRound: 100n }, ME, "incoming", 2);
    expect(first).toEqual({ match: null, state: { minRound: 100n, token: "p3", snapshotRound: 103n, seenRound: 103n } });

    const second = await scan(fetchPage, first.state, ME, "incoming", 2);
    expect(second.match?.txn.id).toBe("old-incoming");
    expect(calls.map((c) => [c.minRound, c.token])).toEqual([
      [100n, undefined],
      [100n, "p2"],
      [100n, "p3"],
    ]);
  });

  it("after a resumed search, moves past its first round", async () => {
    const { fetchPage } = stub({ p3: { transactions: [pay(ME, OTHER, 101n)], currentRound: 110n } });
    const res = await scan(fetchPage, { minRound: 100n, token: "p3", snapshotRound: 103n, seenRound: 103n }, ME, "incoming", 2);
    expect(res.state).toEqual({ minRound: 104n });
  });

  it("follows the token past a page shorter than the limit", async () => {
    // The indexer merges an outer txn's rows (its inner txns) into one result: a short page isn't the end.
    const { fetchPage, calls } = stub({
      "": { transactions: [pay(ME, OTHER, 104n)], currentRound: 105n, nextToken: "p2" },
      p2: { transactions: [pay(OTHER, ME, 103n, "older-incoming")], currentRound: 105n, nextToken: "p3" },
    });
    const res = await scan(fetchPage, { minRound: 100n }, ME, "incoming", 5);
    expect(res.match?.txn.id).toBe("older-incoming");
    expect(calls).toHaveLength(2);
  });

  it("an empty page ends the search, even with a token", async () => {
    const { fetchPage, calls } = stub({
      "": { transactions: [pay(ME, OTHER, 104n)], currentRound: 105n, nextToken: "p2" },
      p2: { transactions: [], currentRound: 105n, nextToken: "p3" },
    });
    const res = await scan(fetchPage, { minRound: 100n }, ME, "incoming", 5);
    expect(res.state).toEqual({ minRound: 106n });
    expect(calls).toHaveLength(2);
  });

  it("a failed first page leaves the state as it was", async () => {
    const { fetchPage } = stub({});
    const res = await scan(fetchPage, { minRound: 100n }, ME, "incoming", 5);
    expect(res.match).toBeNull();
    expect(res.state).toEqual({ minRound: 100n });
    expect(res.error).toBeInstanceOf(Error);
  });

  it("a failed later page keeps the pages read before it, and resumes at it", async () => {
    const { fetchPage } = stub({
      "": { transactions: [pay(ME, OTHER, 103n)], currentRound: 103n, nextToken: "p2" },
    });
    const res = await scan(fetchPage, { minRound: 100n }, ME, "incoming", 5);
    expect(res.state).toEqual({ minRound: 100n, token: "p2", snapshotRound: 103n, seenRound: 103n });
    expect(res.error).toBeInstanceOf(Error);
  });

  it("reads a later page again when it comes from an indexer behind the first", async () => {
    const { fetchPage } = stub({
      "": { transactions: [pay(ME, OTHER, 103n)], currentRound: 103n, nextToken: "p2" },
      p2: { transactions: [pay(ME, OTHER, 101n)], currentRound: 102n, nextToken: "p3" },
    });
    const res = await scan(fetchPage, { minRound: 100n }, ME, "incoming", 5);
    expect(res.state).toEqual({ minRound: 100n, token: "p2", snapshotRound: 103n, seenRound: 103n });
    expect(res.error).toBeInstanceOf(Error);
  });

  it("stops at the first match", async () => {
    const { fetchPage, calls } = stub({
      "": { transactions: [pay(OTHER, ME, 101n, "hit")], currentRound: 101n, nextToken: "p2" },
    });
    const res = await scan(fetchPage, { minRound: 100n }, ME, "both", 5);
    expect(res.match).toEqual({ txn: expect.objectContaining({ id: "hit" }), side: "incoming" });
    expect(calls).toHaveLength(1);
  });
});
