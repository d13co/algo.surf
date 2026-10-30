import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";
import { getAssetAt, TimeTravelError } from "src/utils/timeTravel";

const latestAsset = (id: number) => ({
  queryKey: ["asset", id],
  queryFn: () => new AssetClient(explorer.network).getWithCreationFallback(id),
});

// Back-fills params from the asset-creation transaction when the asset has been
// deleted (the indexer clears its info). Cheap for live assets — the fallback
// short-circuits right after the initial lookup. Single ["asset", id] key so
// every consumer (asset page, balances, transaction views) shares one entry.
//
// With `round` (see useRound), the params are as they were at that round, from
// the time-travel node; the creation round comes from that shared entry. An
// asset destroyed by then reads as on the latest page: deleted.
export function useAsset(id: number, round?: number) {
  const queryClient = useQueryClient();
  return useQuery({
    ...(round === undefined
      ? { queryKey: ["asset", id] }
      : { queryKey: ["asset", id, { round }], meta: { noPersist: true }, retry: false }),
    queryFn: async () => {
      if (round === undefined) {
        return latestAsset(id).queryFn();
      }
      const [atRound, latest] = await Promise.all([
        getAssetAt(id, round).catch((e: Error) => e),
        // The creation round never changes: a cached latest asset will do.
        queryClient.ensureQueryData(latestAsset(id)).catch(() => undefined),
      ]);
      if (atRound instanceof Error) {
        const destroyed = latest?.deleted && latest.destroyedAtRound !== undefined && latest.destroyedAtRound <= BigInt(round);
        if (atRound instanceof TimeTravelError && atRound.status === 404 && destroyed) return latest;
        throw atRound;
      }
      atRound.createdAtRound = latest?.createdAtRound;
      return atRound;
    },
    enabled: !!id,
  });
}
