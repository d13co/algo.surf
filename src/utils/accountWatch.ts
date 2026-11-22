/**
 * What an account watch (useAccountWatch) looks for in the transactions the indexer returns for an
 * address, and how it pages through them round after round. Pure, for tests.
 */

export type WatchDirection = "incoming" | "outgoing" | "both";
export type WatchSide = "incoming" | "outgoing";

/** The fields of an indexer transaction a watch reads. */
export interface WatchTxn {
  sender: string;
  id?: string;
  txType?: string;
  confirmedRound?: bigint;
  innerTxns?: WatchTxn[];
  paymentTransaction?: { receiver: string };
  assetTransferTransaction?: { receiver: string };
}

/** The transaction `address` sent: `txn` itself, or the first of its inner transactions (at any depth) it sent. */
function sentBy(txn: WatchTxn, address: string): WatchTxn | undefined {
  if (txn.sender === address) return txn;
  for (const inner of txn.innerTxns ?? []) {
    const sent = sentBy(inner, address);
    if (sent) return sent;
  }
  return undefined;
}

/**
 * The indexer returns a transaction for an address when the address takes part in it or in one of
 * its inner transactions. Outgoing: the account sent it (by its key, a rekeyed auth address or a
 * logic sig), or sent one of its inner transactions (an app account). Incoming: someone else sent
 * it. An app account's inner send inside someone else's call is both.
 */
export function classify(txn: WatchTxn, address: string): { incoming: boolean; outgoing: boolean } {
  return {
    incoming: txn.sender !== address,
    outgoing: !!sentBy(txn, address),
  };
}

/**
 * The first transaction in `txns` the watch is for, and which side of it the account is on; null if
 * none. The indexer lists an address's transactions newest first, so in a check that is the newest.
 */
export function findMatch<T extends WatchTxn>(
  txns: T[],
  address: string,
  direction: WatchDirection
): { txn: T; side: WatchSide } | null {
  for (const txn of txns) {
    const { incoming, outgoing } = classify(txn, address);
    if (direction !== "outgoing" && incoming) return { txn, side: "incoming" };
    if (direction !== "incoming" && outgoing) return { txn, side: "outgoing" };
  }
  return null;
}

/**
 * The round the next check starts from: past what the indexer had imported when the check began,
 * and past the newest transaction it returned. Never earlier than before.
 */
export function nextMinRound(prevMin: bigint, currentRound: bigint, newestSeen?: bigint): bigint {
  let next = prevMin;
  if (currentRound + 1n > next) next = currentRound + 1n;
  if (newestSeen !== undefined && newestSeen + 1n > next) next = newestSeen + 1n;
  return next;
}

/**
 * The other party to name in a notification: the sender of an incoming txn; for an outgoing one,
 * the receiver of the transaction the account sent (an inner one, for an app account's send).
 */
export function counterparty(txn: WatchTxn, side: WatchSide, address: string): string | undefined {
  if (side === "incoming") return txn.sender;
  const sent = sentBy(txn, address) ?? txn;
  return sent.paymentTransaction?.receiver ?? sent.assetTransferTransaction?.receiver;
}

/**
 * Where a watch is between checks. `minRound`: the first round not yet read. `token` and
 * `snapshotRound`: a check that read its page limit with older pages left, resumed by the next check
 * from `token` (the same search, so the same results), before `minRound` moves past `snapshotRound`,
 * the indexer's round when that search began.
 */
export interface ScanState {
  minRound: bigint;
  token?: string;
  snapshotRound?: bigint;
  /** The newest round a resumed search returned so far (its first pages). */
  seenRound?: bigint;
}

export interface TxnPage<T> {
  transactions: T[];
  currentRound: bigint;
  nextToken?: string;
}

export type FetchPage<T> = (minRound: bigint, token?: string) => Promise<TxnPage<T>>;

/** A check's outcome: a match, or where the next check starts; `error` when a page failed. */
export interface ScanResult<T> {
  match: { txn: T; side: WatchSide } | null;
  state: ScanState;
  error?: unknown;
}

/**
 * One check: reads up to `maxPages` pages of the address's transactions from `state.minRound` (or
 * resumes a search left unfinished), and stops at the first match. Without one, returns where the
 * next check starts: past this search's round once every page was read, else at the next page. A
 * page can hold fewer than the limit with more to come (the indexer merges an outer txn's rows), so
 * only a missing token or an empty page ends the search. When a page fails, the pages read before
 * it still count: the next check resumes at the failed one.
 */
export async function scan<T extends WatchTxn>(
  fetchPage: FetchPage<T>,
  state: ScanState,
  address: string,
  direction: WatchDirection,
  maxPages: number
): Promise<ScanResult<T>> {
  let token = state.token;
  let snapshotRound = state.snapshotRound;
  let seenRound = state.seenRound;
  // Where a check stopped short of the end: resume there.
  const pending = (): ScanState =>
    snapshotRound === undefined ? state : { minRound: state.minRound, token, snapshotRound, seenRound };

  for (let page = 0; page < maxPages; page++) {
    let res: TxnPage<T>;
    try {
      res = await fetchPage(state.minRound, token);
    } catch (error) {
      return { match: null, state: pending(), error };
    }
    // The search's first page says how far the indexer had imported: later pages of the same
    // search can report a newer round whose transactions the search doesn't hold.
    if (snapshotRound === undefined) snapshotRound = res.currentRound;
    // A later page from an indexer behind the first (replicas behind a load balancer) can leave out
    // rows of the rounds it lacks: read that page again next time.
    else if (res.currentRound < snapshotRound) {
      return { match: null, state: pending(), error: new Error(`indexer at round ${res.currentRound}, behind ${snapshotRound}`) };
    }
    for (const t of res.transactions) {
      if (t.confirmedRound !== undefined && (seenRound === undefined || t.confirmedRound > seenRound)) seenRound = t.confirmedRound;
    }
    const match = findMatch(res.transactions, address, direction);
    if (match) return { match, state };
    token = res.transactions.length ? res.nextToken : undefined;
    if (!token) break;
  }
  if (token) return { match: null, state: pending() };
  return { match: null, state: { minRound: nextMinRound(state.minRound, snapshotRound ?? state.minRound - 1n, seenRound) } };
}
