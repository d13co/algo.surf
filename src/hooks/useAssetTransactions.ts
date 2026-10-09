import { useInfiniteQuery } from "@tanstack/react-query";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";

/** With `round`, only the transactions up to it. */
export function useAssetTransactions(id: number, round?: number) {
  return useInfiniteQuery({
    queryKey: round === undefined ? ["asset-transactions", id] : ["asset-transactions", id, { round }],
    queryFn: ({ pageParam }) =>
      new AssetClient(explorer.network).getAssetTransactions(id, pageParam, round),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!id,
  });
}
