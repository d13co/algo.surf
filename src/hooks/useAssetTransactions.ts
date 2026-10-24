import { useInfiniteQuery } from "@tanstack/react-query";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";
import { isEmptyTxnRound } from "src/hooks/useTxnRound";

/** With `round`, only the transactions up to it; with `txnRound`, only those in it (see useTxnRound). */
export function useAssetTransactions(id: number, round?: number, txnRound?: number) {
  return useInfiniteQuery({
    queryKey: [
      "asset-transactions",
      id,
      ...(txnRound === undefined ? [] : [{ txnRound }]),
      ...(round === undefined ? [] : [{ round }]),
    ],
    queryFn: ({ pageParam }) =>
      new AssetClient(explorer.network).getAssetTransactions(id, pageParam, round, txnRound),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!id && !isEmptyTxnRound(txnRound, round),
  });
}
