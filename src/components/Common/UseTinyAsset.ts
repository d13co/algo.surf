import { UseQueryResult, useQuery } from "@tanstack/react-query";
import { abel, abelTinyToAssetTiny, isDeletedAssetTiny } from "../../packages/abel/abel";
import { getAbelAt } from "../../packages/abel/abelAt";
import { A_AssetTiny } from "../../packages/core-sdk/types";
import { getTimeTravelNode } from "../../utils/timeTravel";
import AssetCache from "./AssetCache";

export function useTinyAsset(
  assetId: number
): UseQueryResult<A_AssetTiny | null> {
  return useQuery({
    queryKey: ["tiny-asset", assetId],
    queryFn: async () => {
      // Try IndexedDB cache first (ignore cache errors)
      let cached: A_AssetTiny | null = null;
      try {
        cached = await AssetCache.getByIndex(assetId);
      } catch {
        // ignore cache failures
      }
      if (cached) return cached;

      // Fallback to ABEL and persist
      const abelData = await abel.getAssetsTinyLabels([BigInt(assetId)]);
      const found = abelData.get(BigInt(assetId));
      const tiny = found ? abelTinyToAssetTiny(found) : null;
      if (tiny && !isDeletedAssetTiny(tiny)) {
        // Persist to IndexedDB asynchronously (ignore errors)
        void AssetCache.insertOne(tiny).catch(() => {});
      }
      return tiny ?? null;
    },
    enabled: assetId > 0,
    staleTime: Infinity,
  });
}

export function useTinyAssets(
  assetIds: number[]
): UseQueryResult<A_AssetTiny[] | null> {
  return useQuery({
    queryKey: ["tiny-assets", assetIds.join(",")],
    queryFn: async () => {
      if (assetIds.length === 0) return [];
      const realAssetIds = assetIds.includes(0) ? assetIds.filter((id) => id !== 0) : assetIds;

      // First, hydrate from IndexedDB cache (ignore cache errors)
      let cachedMap: Map<number, A_AssetTiny> = new Map();
      try {
        cachedMap = await AssetCache.getByIndices(realAssetIds);
      } catch {
        // ignore cache failures
      }

      const missingIds = realAssetIds.filter((id) => !cachedMap.has(id));
      if (missingIds.length === 0) {
        // Return in requested order
        return realAssetIds.map((id) => cachedMap.get(id)!) as A_AssetTiny[];
      }

      // Fetch missing from ABEL
      const timeLabel = `Fetch ${missingIds.length} assets from ABEL`;
      console.time(timeLabel);
      try {
        const abelData = await abel.getAssetsTinyLabels(
          missingIds.map((id) => BigInt(id))
        );
        
        // Convert and persist missing
        const fetchedList: A_AssetTiny[] = missingIds
          .map((id) => abelData.get(BigInt(id)))
          .filter((v) => !!v)
          .map((v) => abelTinyToAssetTiny(v!));

        if (fetchedList.length) {
          // Persist asynchronously
          const found = fetchedList.filter((a) => !isDeletedAssetTiny(a));
          setTimeout(() => {
            void AssetCache.insertMany(found).catch(() => {});
          }, 1000);
          // Update local map
          for (const a of fetchedList) cachedMap.set(a.index, a);
        }

        // Assemble in requested order
        return realAssetIds
          .map((id) => cachedMap.get(id))
          .filter((a): a is A_AssetTiny => !!a);
      } catch (e) {
        console.error("Error fetching tiny assets from ABEL:", e);
        throw e;
      } finally {
        console.timeEnd(timeLabel);
      }
    },
    staleTime: Infinity,
  });
}

/**
 * useTinyAssets, with deleted assets read again on the time-travel node at
 * `round`, a round they existed at (e.g. the round before a block that
 * touched them). An asset's name, unit and decimals never change, so the
 * current read is right for every asset it finds. Without a node or a round,
 * or where the asset didn't exist then either, it stays the deleted stand-in
 * (isDeletedAssetTiny).
 */
export function useTinyAssetsAtRound(
  assetIds: number[],
  round: number | undefined
): { data: Map<number, A_AssetTiny> | undefined; isLoading: boolean } {
  const current = useTinyAssets(assetIds);
  const deleted = (current.data ?? []).filter(isDeletedAssetTiny).map((a) => a.index);
  const node = getTimeTravelNode()?.baseUrl;
  const canReadAt = !!node && round !== undefined && round > 0;
  const past = useQuery({
    queryKey: ["tiny-assets-at", node, round, deleted.join(",")],
    queryFn: async () => {
      const abelAt = getAbelAt();
      if (!abelAt) return [];
      const read = await abelAt.getAssetsTinyLabels(deleted, { round });
      return [...read.values()].map(abelTinyToAssetTiny).filter((a) => !isDeletedAssetTiny(a));
    },
    enabled: canReadAt && deleted.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  if (!current.data) return { data: undefined, isLoading: current.isLoading };
  const map = new Map(current.data.map((a) => [a.index, a]));
  for (const a of past.data ?? []) map.set(a.index, a);
  return { data: map, isLoading: current.isLoading || past.isLoading };
}
