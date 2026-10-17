import { useQuery } from "@tanstack/react-query";
import { network } from "src/packages/core-sdk/constants";

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

const ANALYTICS_HOSTS: Record<string, string> = {
  Mainnet: "https://mainnet-analytics.d13.co",
  Fnet: "https://fnet-analytics.d13.co",
};
const analyticsHost = ANALYTICS_HOSTS[network];
export const validatorStatsSupported = !!analyticsHost;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${analyticsHost}${path}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
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
  return useQuery({
    queryKey: ["validator-stats", address, minRound, ...(maxRound === undefined ? [] : [{ maxRound }])],
    queryFn: () =>
      getJson<ValidatorStats>(`/v0/proposer/${address}/stats${roundQuery(minRound, maxRound)}`),
    enabled: !!address && validatorStatsSupported,
  });
}

/** Full block/eviction lists, up to `maxRound` when given. Heavy; only enable when needed. */
export function useValidator(address: string, enabled = true, maxRound?: number) {
  return useQuery({
    queryKey: ["validator", address, ...(maxRound === undefined ? [] : [{ maxRound }])],
    queryFn: async (): Promise<ValidatorResult> => {
      const { exists } = await getJson<{ exists: boolean }>(`/v0/exists/${address}`);
      if (!exists) return { address, proposals: [], suspensions: [] };
      const [proposals, suspensions] = await Promise.all([
        getJson<ProposalData>(`/v0/proposer/${address}${roundQuery(0, maxRound)}`),
        getJson<number[]>(`/v0/evictions/${address}${roundQuery(0, maxRound)}`),
      ]);
      return { address, proposals, suspensions };
    },
    enabled: enabled && !!address && validatorStatsSupported,
    // Can be millions of rows: drop from memory soon after the dialog closes,
    // never persist to IndexedDB.
    gcTime: 60_000,
    meta: { noPersist: true },
  });
}
