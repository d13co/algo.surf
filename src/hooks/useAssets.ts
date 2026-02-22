import { useInfiniteQuery } from "@tanstack/react-query";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";

export function useAssets() {
  return useInfiniteQuery({
    queryKey: ["assets-list"],
    queryFn: ({ pageParam }) =>
      new AssetClient(explorer.network).getAssets(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
  });
}
