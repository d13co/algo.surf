import { useInfiniteQuery } from "@tanstack/react-query";
import { AssetClient, ASSETS_PAGE_SIZE } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";

export function useAssets() {
  return useInfiniteQuery({
    queryKey: ["assets-list"],
    queryFn: ({ pageParam }) =>
      new AssetClient(explorer.network).getAssets(pageParam),
    initialPageParam: undefined as string | undefined,
    // The indexer can return a next-token even on the final (short) page, so
    // only treat it as a real next page when the page came back full.
    getNextPageParam: (lastPage) =>
      lastPage.assets.length >= ASSETS_PAGE_SIZE
        ? lastPage["next-token"] || undefined
        : undefined,
  });
}
