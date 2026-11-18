import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetry } from "src/utils/surfIdx";
import { useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { LIST_LIMIT } from "src/hooks/useAccountSummary";

/**
 * One (account, authorizer) pair of surf idx's rekey history, seen from one side: `address` is the
 * other side. No per-txn history: the txns that set the account's authorizer to the authorizer, inner
 * txns included, and the first and last round of them.
 */
export interface RekeyPair {
  address: string;
  txns: number;
  firstRound: number;
  lastRound: number;
}

/** /v0/rekeys/<address>. Each list is newest last round first. */
export interface Rekeys {
  /** The authorizers the account was rekeyed to. One whose address is the account itself counts its
   * rekeys back to its own key and its close-outs while rekeyed. */
  to: RekeyPair[];
  /** The accounts rekeyed to this address. */
  from: RekeyPair[];
}

/** Both sides of the account's rekey history, while surf idx serves it. */
export function useRekeys(address: string | undefined, enabled = true) {
  const rekeys = useSurfIdxCaps()?.rekeys;
  return useQuery({
    queryKey: ["surf-rekeys", address],
    queryFn: () => surfIdxGet<Rekeys>(`/v0/rekeys/${address}?limit=${LIST_LIMIT}`),
    enabled: enabled && !!address && !!rekeys,
    // It changes as the chain moves: don't carry it across sessions.
    staleTime: 5 * 60_000,
    meta: { noPersist: true },
    ...surfIdxRetry,
  });
}
