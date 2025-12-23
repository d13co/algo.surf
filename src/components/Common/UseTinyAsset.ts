import { UseQueryResult, useQuery } from "@tanstack/react-query";
import { queryClient } from "../../db/query-client";
import { abel, abelTinyToAssetTiny } from "../../packages/abel/abel";
import { A_AssetTiny } from "../../packages/core-sdk/types";

export function useTinyAsset(
  assetId: number
): UseQueryResult<A_AssetTiny | null> {
  return useQuery({
    queryKey: ["tiny-asset", assetId],
    queryFn: async () => {
      const abelData = await abel.getAssetsTiny([BigInt(assetId)]);
      return abelTinyToAssetTiny(abelData.get(BigInt(assetId)));
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useTinyAssets(
  assetIds: number[]
): UseQueryResult<A_AssetTiny[] | null> {
  return useQuery({
    queryKey: ["tiny-assets", assetIds.join(",")],
    queryFn: async () => {
      if (assetIds.length === 0) return [];

      const cached = assetIds.map((id) =>
        queryClient.getQueryData<A_AssetTiny>(["tiny-asset", id])
      );
      const missingIds = assetIds.filter((id, index) => !cached[index]);
      if (missingIds.length === 0) return cached as A_AssetTiny[];

      const timeLabel = `Fetching ${missingIds.length} tiny assets from ABEL`;
      console.time(timeLabel);
      const abelData = await abel.getAssetsTiny(
        missingIds.map((id) => BigInt(id))
      );
      console.timeEnd(timeLabel);

      if (abelData.size < 1000) {
        // caching only if less than 1000 assets to avoid flooding the cache and blocking thread
        for (const abelTiny of abelData.values()) {
          queryClient.setQueryData<A_AssetTiny>(
            ["tiny-asset", Number(abelTiny.id)],
            abelTinyToAssetTiny(abelTiny)
          );
        }
      }

      return assetIds.map((id) => {
        if (abelData.has(BigInt(id))) {
          return abelTinyToAssetTiny(abelData.get(BigInt(id)));
        } else {
          return cached.find((c) => c?.index === id)!;
        }
      });
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
