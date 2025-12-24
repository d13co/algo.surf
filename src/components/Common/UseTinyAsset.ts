import { UseQueryResult, useQuery } from "@tanstack/react-query";
import { queryClient } from "../../db/query-client";
import { abel, abelTinyToAssetTiny } from "../../packages/abel/abel";
import { A_AssetTiny } from "../../packages/core-sdk/types";
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
      const tiny = abelTinyToAssetTiny(abelData.get(BigInt(assetId)));
      if (tiny) {
        // Persist to IndexedDB asynchronously (ignore errors)
        void AssetCache.insertOne(tiny).catch(() => {});
      }
      return tiny ?? null;
    },
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

      // First, hydrate from IndexedDB cache (ignore cache errors)
      let cachedMap: Map<number, A_AssetTiny> = new Map();
      try {
        cachedMap = await AssetCache.getByIndices(assetIds);
      } catch {
        // ignore cache failures
      }

      const missingIds = assetIds.filter((id) => !cachedMap.has(id));
      if (missingIds.length === 0) {
        // Return in requested order
        return assetIds.map((id) => cachedMap.get(id)!) as A_AssetTiny[];
      }

      // Fetch missing from ABEL
      const timeLabel = `Fetching ${missingIds.length} tiny assets from ABEL`;
      console.time(timeLabel);
      const abelData = await abel.getAssetsTinyLabels(missingIds.map((id) => BigInt(id)));
      console.timeEnd(timeLabel);

      // Convert and persist missing
      const fetchedList: A_AssetTiny[] = missingIds
        .map((id) => abelData.get(BigInt(id)))
        .filter((v) => !!v)
        .map((v) => abelTinyToAssetTiny(v!));

      if (fetchedList.length) {
        // Persist asynchronously
        setTimeout(() => {
          void AssetCache.insertMany(fetchedList).catch(() => {});
        }, 1000);
        // Update local map
        for (const a of fetchedList) cachedMap.set(a.index, a);
      }

      // Assemble in requested order
      return assetIds
        .map((id) => cachedMap.get(id))
        .filter((a): a is A_AssetTiny => !!a);
    },
    staleTime: Infinity,
  });
}
