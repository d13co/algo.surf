import { useQuery } from "@tanstack/react-query";
import { SurfIdxError, surfIdxGetOrNull } from "src/utils/surfIdx";
import { useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";

/**
 * surf idx's /v0/account: what the account page needs to pick its tabs and chips, in one request.
 * Keys of features the instance doesn't track are absent. Counts are totals, not capped like lists.
 */
export interface AccountSummary {
  /** LSIGS: the logic sig at this program address, null if none. */
  lsig?: { template: string; name: string | null } | null;
  /** LSIGS: rows of /v0/delegations. */
  delegations?: number;
  /** MSIGS: multisigs it is a subsigner of (rows of /v0/subsigner). */
  multisigs?: number;
  /** MSIGS: its subsigners if it is a multisig (rows of /v0/msig). */
  signers?: number;
  /** PROPOSERS: ever proposed a block. */
  proposed?: boolean;
  /** PROPOSERS: ever evicted (suspended). */
  evicted?: boolean;
  /** VOTER_ROUNDS: voted within the voter window. */
  voted?: boolean;
}

/** Rows a list route returns at most here; a summary count above it means the list is cut. */
export const LIST_LIMIT = 10_000;

/**
 * The account's summary. null when surf idx has no /v0/account (an older build) or it failed: the
 * caller falls back to the list routes, so one failure doesn't hide every tab. A 400 (bad address)
 * still fails: the lists would too. No history, like the lists: it is the current state.
 */
export function useAccountSummary(address: string | undefined) {
  const caps = useSurfIdxCaps();
  const tracked = !!caps && (caps.lsigs || caps.msigs || caps.proposers || caps.voterRounds > 0);
  return useQuery({
    queryKey: ["surf-account", address],
    // null, not an error: a refetch of an errored query (on a tab's mount, on focus) would clear the
    // error while it runs, and the page would flip out of the fallback and back.
    queryFn: async () => {
      try {
        return await surfIdxGetOrNull<AccountSummary>(`/v0/account/${address}`);
      } catch (e) {
        if (e instanceof SurfIdxError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
        return null;
      }
    },
    enabled: !!address && tracked,
    // It changes as the chain moves: don't carry it across sessions.
    staleTime: 5 * 60_000,
    meta: { noPersist: true },
  });
}

/**
 * "The N most recent" (of M, when the total is known), or null when the list isn't cut. Only a full
 * list is cut: the total is a separate query, which can be fresher than the list for a moment.
 */
export function cutNote(rows: number, total: number | undefined): string | null {
  if (rows < LIST_LIMIT || (total !== undefined && rows >= total)) return null;
  return `The ${rows.toLocaleString()} most recent${total !== undefined ? ` of ${total.toLocaleString()}` : ""}.`;
}
