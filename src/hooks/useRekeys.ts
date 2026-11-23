import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetry } from "src/utils/surfIdx";
import { abel } from "src/packages/abel/abel";
import { getAbelAt } from "src/packages/abel/abelAt";
import { useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { createLimit } from "src/utils/limit";

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

/**
 * Both sides of the account's rekey history, while surf idx serves it: whole, up to its RESULTS_LIMIT
 * (cut beyond: cutNote with that limit says so).
 */
export function useRekeys(address: string | undefined, enabled = true) {
  const caps = useSurfIdxCaps();
  const limit = caps?.resultsLimit;
  return useQuery({
    queryKey: ["surf-rekeys", address, limit],
    queryFn: () => surfIdxGet<Rekeys>(`/v0/rekeys/${address}?limit=${limit}`),
    enabled: enabled && !!address && !!caps?.rekeys,
    // It changes as the chain moves: don't carry it across sessions.
    staleTime: 5 * 60_000,
    meta: { noPersist: true },
    ...surfIdxRetry,
  });
}

/** Accounts per abel read of their authorizers. */
const AUTH_CHUNK = 1000;

/** Abel reads of authorizers in flight at once, across every list: up to 100 chunks would otherwise all go out together.
 * A list that goes away (another account, another round) drops its queued reads. */
const authLimit = createLimit(4);

/**
 * The authorizer of each account at the page's round (now when undefined), from abel in bulk: one
 * read per AUTH_CHUNK accounts, in order, so the first rows' come first. A past round needs the
 * time-travel node: without one, nothing. An account read has an entry, undefined when not rekeyed;
 * one not read yet (or not readable) has none.
 */
export function useAuthAddrsOf(accounts: string[], round: number | undefined): Map<string, string | undefined> {
  // Each chunk's key covers all its accounts, as a hash: the list itself would be ~58KB to hash per chunk per render.
  const chunks = useMemo(() => {
    const out: { accounts: string[]; id: string }[] = [];
    for (let i = 0; i < accounts.length; i += AUTH_CHUNK) {
      const chunk = accounts.slice(i, i + AUTH_CHUNK);
      out.push({ accounts: chunk, id: hashAccounts(chunk) });
    }
    return out;
  }, [accounts]);
  return useQueries({
    queries: chunks.map(({ accounts, id }) => ({
      queryKey: ["auth-addrs", round ?? "now", id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        authLimit(async () => {
          const sdk = round === undefined ? abel : getAbelAt();
          return sdk ? sdk.getAuthAddrs(accounts, round === undefined ? {} : { round }) : null;
        }, signal),
      enabled: accounts.length > 0,
      staleTime: round === undefined ? 60_000 : Infinity,
      // As useControllingAccounts: a refetch on focus would ask for every chunk again.
      refetchOnWindowFocus: false,
      meta: { noPersist: true },
    })),
    combine: joinAuthAddrs,
  });
}

/** The chunk's count and two 32-bit FNV-style hashes of its accounts: different chunks don't meet in practice. */
function hashAccounts(accounts: string[]): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const a of accounts) {
    for (let i = 0; i < a.length; i++) {
      const c = a.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    }
    h1 = Math.imul(h1 ^ 0x2c, 0x01000193); // a separator: ["AB","C"] isn't ["A","BC"]
  }
  return `${accounts.length}:${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/** Every chunk's authorizers in one map. Stable, so useQueries rebuilds it only when a chunk's result changes. */
function joinAuthAddrs(results: { data?: Map<string, string | undefined> | null }[]): Map<string, string | undefined> {
  const all = new Map<string, string | undefined>();
  for (const r of results) r.data?.forEach((auth, account) => all.set(account, auth));
  return all;
}
