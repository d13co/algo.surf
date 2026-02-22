import { useInfiniteQuery } from "@tanstack/react-query";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";

export function useAssetTransactions(id: number) {
  return useInfiniteQuery({
    queryKey: ["asset-transactions", id],
    queryFn: ({ pageParam }) =>
      new AssetClient(explorer.network).getAssetTransactions(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!id,
  });
}
