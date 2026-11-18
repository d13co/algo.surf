import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetryDelay, surfIdxSupported } from "src/utils/surfIdx";

/** The surf idx features this network's instance serves. Routes of one that is off are 404s. */
export interface SurfIdxCaps {
  proposers: boolean;
  /** Voters are kept for this many recent rounds; 0: no voter routes. */
  voterRounds: number;
  lsigs: boolean;
  msigs: boolean;
  /** Rekey history: false until its backfill is done. */
  rekeys: boolean;
  /** Features turned on but still backfilling their history: off until done. */
  backfilling: string[];
  /** Set when there is a surf idx but /v0/status failed: all features read as off until it answers. */
  unavailable?: boolean;
}

/** /v0/status, as far as the caps go. */
interface Status {
  proposers: boolean;
  voterRounds: number;
  lsigs: boolean;
  msigs: boolean;
  /** Absent from a surf idx older than the feature. */
  rekeys?: boolean;
  /** Left out when nothing is backfilling. */
  backfill?: Record<string, { roundsLeft: number }>;
}

const NO_CAPS: SurfIdxCaps = {
  proposers: false,
  voterRounds: 0,
  lsigs: false,
  msigs: false,
  rekeys: false,
  backfilling: [],
};
const UNAVAILABLE: SurfIdxCaps = { ...NO_CAPS, unavailable: true };

/**
 * From /v0/status, fetched once while it succeeds. undefined while loading; all off when there is
 * no surf idx, and `unavailable` when it can't be reached (refetched on window focus or reconnect).
 */
export function useSurfIdxCaps(): SurfIdxCaps | undefined {
  const { data, isError } = useQuery({
    queryKey: ["surf-idx-caps"],
    // Only the flags: the rest of the status (maxRound, records, roundsLeft) would go stale in this cache.
    queryFn: async (): Promise<SurfIdxCaps> => {
      const { proposers, voterRounds, lsigs, msigs, rekeys, backfill } = await surfIdxGet<Status>("/v0/status");
      return {
        proposers,
        voterRounds,
        lsigs,
        msigs,
        rekeys: !!rekeys,
        backfilling: Object.keys(backfill ?? {}),
      };
    },
    enabled: surfIdxSupported,
    staleTime: Infinity,
    // A backfill switches its feature on without a restart: look again now and then until it's done.
    refetchInterval: (query) => (query.state.data?.backfilling.length ? 5 * 60_000 : false),
    // A failure reads as every feature off, so retry whatever it is, honoring Retry-After.
    retry: 2,
    retryDelay: surfIdxRetryDelay,
    // A redeploy can change them: don't carry them across sessions.
    meta: { noPersist: true },
  });
  if (!surfIdxSupported) return NO_CAPS;
  return data ?? (isError ? UNAVAILABLE : undefined);
}

const FEATURE_LABELS: Record<string, string> = { rekeys: "Rekey history" };

/** The message for a page whose feature is off, by why. */
export function surfIdxOffMessage(caps: SurfIdxCaps, feature?: string): string {
  if (caps.unavailable) return "surf idx is unavailable. Try again later.";
  if (feature && caps.backfilling.includes(feature)) {
    return `${FEATURE_LABELS[feature] ?? feature} is still being indexed. Try again later.`;
  }
  return "Network not supported";
}
