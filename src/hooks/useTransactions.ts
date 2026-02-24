import { useInfiniteQuery } from "@tanstack/react-query";
import { TransactionClient } from "src/packages/core-sdk/clients/transactionClient";
import explorer from "src/utils/dappflow";

export function useTransactions() {
  return useInfiniteQuery({
    queryKey: ["transactions"],
    queryFn: ({ pageParam }) =>
      new TransactionClient(explorer.network).getTransactions(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
  });
}
