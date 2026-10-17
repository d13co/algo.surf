import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parseRound } from "src/hooks/useRound";

/**
 * A transactions tab's round filter, `?txn-round=R`: only the transactions in
 * round R. Unlike `?round` (see useRound), the page's state stays as it is.
 */
const TXN_ROUND_PARAM = "txn-round";

/** `path` (with any query and hash) listing only the transactions in `round`, or all of them without one. */
export function withTxnRound(path: string, round: number | undefined): string {
  const [beforeHash, hash = ""] = path.split(/(?=#)/);
  const [pathname, query = ""] = beforeHash.split("?");
  const params = new URLSearchParams(query);
  if (round === undefined) params.delete(TXN_ROUND_PARAM);
  else params.set(TXN_ROUND_PARAM, String(round));
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}

/**
 * Whether the transactions in `txnRound` are past `round`, the round the page
 * shows (see useRound): there are none up to it.
 */
export function isPastRound(txnRound: number | undefined, round: number | undefined): boolean {
  return txnRound !== undefined && round !== undefined && txnRound > round;
}

/**
 * Whether a list filtered to `txnRound` is empty without asking the indexer:
 * past `round` (see isPastRound), or in round 0. Genesis has no transactions,
 * and algosdk drops a `round` of 0 from the query, which would list them all.
 */
export function isEmptyTxnRound(txnRound: number | undefined, round: number | undefined): boolean {
  return txnRound === 0 || isPastRound(txnRound, round);
}

/** The round from `?txn-round=R`; undefined where there is none. */
export function useTxnRound(): number | undefined {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get(TXN_ROUND_PARAM);
  return useMemo(() => parseRound(raw), [raw]);
}
