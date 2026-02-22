import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ApplicationClient } from "src/packages/core-sdk/clients/applicationClient";
import { BoxClient } from "src/packages/core-sdk/clients/boxClient";
import { getProgramHashes } from "src/redux/explorer/actions/application";
import explorer from "src/utils/dappflow";

export function useApplication(id: number) {
  return useQuery({
    queryKey: ["application", id],
    queryFn: () => new ApplicationClient(explorer.network).get(id),
    enabled: !!id,
  });
}

export function useApplicationTransactions(id: number) {
  return useInfiniteQuery({
    queryKey: ["application-transactions", id],
    queryFn: ({ pageParam }) =>
      new ApplicationClient(explorer.network).getApplicationTransactions(
        id,
        pageParam,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!id,
  });
}

export function useApplicationBoxNames(id: number) {
  return useQuery({
    queryKey: ["application-box-names", id],
    queryFn: () => new BoxClient(explorer.network).getBoxNames(id),
    enabled: !!id,
    retry: false,
  });
}

export function useApplicationHashes(appInfo: any) {
  return useQuery({
    queryKey: [
      "application-hashes",
      appInfo?.params?.["approval-program"],
      appInfo?.params?.["clear-state-program"],
    ],
    queryFn: () => getProgramHashes(appInfo),
    enabled:
      !!appInfo?.params?.["approval-program"] &&
      !!appInfo?.params?.["clear-state-program"],
  });
}
