import { useQuery, UseQueryResult } from "@tanstack/react-query";
import type { NfdGhostSDK } from "nfd-ghost-sdk";
import { getNfdReader, nfdReaderKey, nfdRoundKey } from "src/packages/nfd/nfdGhost";
import { useRound } from "src/hooks/useRound";
import { useTimeTravelSupport } from "src/hooks/useTimeTravel";

/**
 * NFD names through nfd-ghost-sdk (read-only queries), at the page's round
 * (`?round=`). Labels are decoration: where the node can't read NFDs, or a
 * read fails, there is no name.
 */

const HOUR = 60 * 60 * 1000;

/**
 * The NFD reader (see getNfdReader) when its node can read NFDs: the SDK's
 * probe, asked once per node. Null until then, and where it can't.
 */
export function useNfdReader(): NfdGhostSDK | null {
  const timeTravel = useTimeTravelSupport();
  const sdk = getNfdReader(timeTravel);
  const { data } = useQuery({
    queryKey: ["nfd-reader-support", nfdReaderKey(timeTravel)],
    queryFn: async () => {
      try {
        return await sdk!.supported();
      } catch (e) {
        // Resolved rather than thrown: every label that mounts would retry it.
        console.warn(`NFD names unavailable: ${(e as Error).message}`);
        return false;
      }
    },
    enabled: !!sdk,
    // A no from a failed probe can be a passing one (a network blip): asked again after a minute.
    staleTime: (query) => (query.state.data ? Infinity : 60_000),
    retry: false,
    meta: { noPersist: true },
  });
  return data ? sdk : null;
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
