import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetryDelay, surfIdxSupported } from "src/utils/surfIdx";

/** The surf idx features this network's instance serves. Routes of one that is off are 404s. */
export interface SurfIdxCaps {
  proposers: boolean;
  /** Voters are kept for this many recent rounds; 0: no voter routes. */
  voterRounds: number;
  lsigs: boolean;
  msigs: boolean;
  /** Set when there is a surf idx but /v0/status failed: all features read as off until it answers. */
  unavailable?: boolean;
}

const NO_CAPS: SurfIdxCaps = { proposers: false, voterRounds: 0, lsigs: false, msigs: false };
const UNAVAILABLE: SurfIdxCaps = { ...NO_CAPS, unavailable: true };

/**
 * From /v0/status, fetched once while it succeeds. undefined while loading; all off when there is
 * no surf idx, and `unavailable` when it can't be reached (refetched on window focus or reconnect).
 */
export function useSurfIdxCaps(): SurfIdxCaps | undefined {
  const { data, isError } = useQuery({
    queryKey: ["surf-idx-caps"],
    // Only the flags: the rest of the status (maxRound, records) would go stale in this cache.
    queryFn: async (): Promise<SurfIdxCaps> => {
      const { proposers, voterRounds, lsigs, msigs } = await surfIdxGet<SurfIdxCaps>("/v0/status");
      return { proposers, voterRounds, lsigs, msigs };
    },
    enabled: surfIdxSupported,
    staleTime: Infinity,
    // A failure reads as every feature off, so retry whatever it is, honoring Retry-After.
    retry: 2,
    retryDelay: surfIdxRetryDelay,
    // A redeploy can change them: don't carry them across sessions.
    meta: { noPersist: true },
  });
  if (!surfIdxSupported) return NO_CAPS;
  return data ?? (isError ? UNAVAILABLE : undefined);
}

/** The message for a page whose feature is off, by why. */
export function surfIdxOffMessage(caps: SurfIdxCaps): string {
  return caps.unavailable ? "surf idx is unavailable. Try again later." : "Network not supported";
}
