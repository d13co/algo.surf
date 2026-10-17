import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetry } from "src/utils/surfIdx";
import { useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";

export type ProposalData = Array<{ rnd: number; pp: number; ts: number }>;

export interface ValidatorResult {
  address: string;
  proposals: ProposalData;
  suspensions: number[];
}

export interface ValidatorStats {
  blocks: number;
  payouts: number;
  suspensions: number;
  firstRound: number;
  lastRound: number;
  avgBlocksPerDay: number;
  range: { firstRound: number; lastRound: number; firstTs: number; lastTs: number };
}

/** `?minRound=&maxRound=` for the given bounds; maxRound undefined = up to now. */
function roundQuery(minRound: number, maxRound?: number): string {
  const params = new URLSearchParams();
  if (minRound) params.set("minRound", String(minRound));
  if (maxRound !== undefined) params.set("maxRound", String(maxRound));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Aggregate stats. minRound 0 = lifetime; with `maxRound`, only up to it (see useRound). */
export function useValidatorStats(address: string, minRound = 0, maxRound?: number) {
  const proposers = useSurfIdxCaps()?.proposers;
  return useQuery({
    ...surfIdxRetry,
    queryKey: ["validator-stats", address, minRound, ...(maxRound === undefined ? [] : [{ maxRound }])],
    queryFn: () =>
      surfIdxGet<ValidatorStats>(`/v0/proposer/${address}/stats${roundQuery(minRound, maxRound)}`),
    enabled: !!address && !!proposers,
  });
}

/** Full block/eviction lists, up to `maxRound` when given. Heavy; only enable when needed. */
export function useValidator(address: string, enabled = true, maxRound?: number) {
  const proposers = useSurfIdxCaps()?.proposers;
  return useQuery({
    ...surfIdxRetry,
    queryKey: ["validator", address, ...(maxRound === undefined ? [] : [{ maxRound }])],
    queryFn: async (): Promise<ValidatorResult> => {
      const { exists } = await surfIdxGet<{ exists: boolean }>(`/v0/exists/${address}`);
      if (!exists) return { address, proposals: [], suspensions: [] };
      const [proposals, suspensions] = await Promise.all([
        surfIdxGet<ProposalData>(`/v0/proposer/${address}${roundQuery(0, maxRound)}`),
        surfIdxGet<number[]>(`/v0/evictions/${address}${roundQuery(0, maxRound)}`),
      ]);
      return { address, proposals, suspensions };
    },
    enabled: enabled && !!address && !!proposers,
    // Can be millions of rows: drop from memory soon after the dialog closes,
    // never persist to IndexedDB.
    gcTime: 60_000,
    meta: { noPersist: true },
  });
}
