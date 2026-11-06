import { useCallback } from "react";
import { useQuery, useQueryClient, UseQueryResult } from "@tanstack/react-query";
import type { NfdGhostSDK } from "nfd-ghost-sdk";
import { getNfdReader, nfdReaderKey, nfdRoundKey } from "src/packages/nfd/nfdGhost";
import { useRound } from "src/hooks/useRound";
import { timeTravelSupportQuery, useTimeTravelStatus, useTimeTravelSupport } from "src/hooks/useTimeTravel";
import { getTimeTravelNode } from "src/utils/timeTravel";

/**
 * NFD names through nfd-ghost-sdk (read-only queries), at the page's round
 * (`?round=`). Labels are decoration: where the node can't read NFDs, or a
 * read fails, there is no name.
 */

const HOUR = 60 * 60 * 1000;

/** Whether getNfdReader(timeTravel) can read NFDs: the SDK's probe, asked once per node. */
function nfdReaderSupportQuery(timeTravel: boolean) {
  const sdk = getNfdReader(timeTravel);
  return {
    queryKey: ["nfd-reader-support", nfdReaderKey(timeTravel)],
    queryFn: async () => {
      if (!sdk) return false;
      try {
        return await sdk.supported();
      } catch (e) {
        // Resolved rather than thrown: every label that mounts would retry it.
        console.warn(`NFD names unavailable: ${(e as Error).message}`);
        return false;
      }
    },
    // A no from a failed probe can be a passing one (a network blip): asked again after a minute.
    staleTime: (query: { state: { data?: boolean } }) => (query.state.data ? Infinity : 60_000),
    retry: false as const,
    meta: { noPersist: true },
  };
}

/**
 * The NFD reader (see getNfdReader) when its node can read NFDs. Null until
 * that is known, and where it can't. Waits for the time-travel node's check,
 * so names aren't read from the network's algod and then again from it.
 */
export function useNfdReader(): NfdGhostSDK | null {
  const status = useTimeTravelStatus();
  const timeTravel = status === "supported";
  const settled = status !== "checking";
  const sdk = getNfdReader(timeTravel);
  const { data } = useQuery({ ...nfdReaderSupportQuery(timeTravel), enabled: !!sdk && settled });
  return settled && data ? sdk : null;
}

/**
 * The NFD reader for a search (see useNfdReader), as a function that waits
 * for the checks still running instead of answering null. A failed probe is
 * asked again: a search is worth one request.
 */
export function useNfdSearchReader(): () => Promise<NfdGhostSDK | null> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const timeTravel = !!getTimeTravelNode() && !!(await queryClient.fetchQuery(timeTravelSupportQuery()));
    const sdk = getNfdReader(timeTravel);
    if (!sdk) return null;
    const support = nfdReaderSupportQuery(timeTravel);
    const supported = await queryClient.fetchQuery({
      ...support,
      staleTime: (query: { state: { data?: boolean } }) => (query.state.data ? Infinity : 0),
    });
    return supported ? sdk : null;
  }, [queryClient]);
}

/** Query options for names at `round`: a pinned round never changes. */
const roundCache = (round: number | undefined) => ({
  gcTime: HOUR,
  staleTime: round === undefined ? HOUR : Infinity,
});

/**
 * The primary NFD that lists `address` as a verified address at the page's
 * round, or null. Reads asked for within 10 ms go as one query per round (the
 * SDK's batcher).
 */
export const useReverseNFD = (address: string): UseQueryResult<string | null> => {
  const { round } = useRound();
  const sdk = useNfdReader();
  const timeTravel = useTimeTravelSupport();
  return useQuery({
    queryKey: ["nfd-rev", nfdReaderKey(timeTravel), address, nfdRoundKey(round)],
    queryFn: async () => {
      const records = await sdk!.reverseLookup([address], { round, fields: [] });
      return records.get(address)?.[0]?.name ?? null;
    },
    enabled: !!sdk && !!address,
    retry: false,
    ...roundCache(round),
  });
};

/** Each address with its primary NFD at the page's round (see useReverseNFD), in one read. */
export const useReverseNFDs = (addresses: string[]): UseQueryResult<[string, string | null][] | null> => {
  const { round } = useRound();
  const sdk = useNfdReader();
  const timeTravel = useTimeTravelSupport();
  return useQuery({
    queryKey: ["nfd-revs", nfdReaderKey(timeTravel), addresses, nfdRoundKey(round)],
    queryFn: async () => {
      const records = await sdk!.reverseLookup(addresses, { round, fields: [] });
      return addresses.map((address): [string, string | null] => [address, records.get(address)?.[0]?.name ?? null]);
    },
    enabled: !!sdk && addresses.length > 0,
    retry: false,
    ...roundCache(round),
  });
};
