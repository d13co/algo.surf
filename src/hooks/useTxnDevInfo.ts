import { useQuery } from "@tanstack/react-query";
import { getDevIncludes, getTimeTravelNode, getTxnDevInfo } from "src/utils/timeTravel";
import type { DevInclude } from "src/utils/txnDevInfo";
import { useStateChangesSupport } from "./useTxnStateChanges";

const meta = { noPersist: true };

/** The developer include values the node serves; undefined while checking, [] without state changes. */
export function useDevIncludes(): DevInclude[] | undefined {
  const supported = useStateChangesSupport();
  const node = getTimeTravelNode();
  const { data, isLoading } = useQuery({
    queryKey: ["dev-includes", node?.baseUrl],
    queryFn: async () => {
      try {
        return await getDevIncludes();
      } catch (e) {
        console.warn(`${node?.baseUrl}: no developer info: ${(e as Error).message}`);
        return [];
      }
    },
    enabled: !!supported,
    staleTime: Infinity,
    retry: false,
    meta,
  });
  if (supported === undefined) return undefined;
  if (!supported) return [];
  return isLoading ? undefined : data;
}

/** `include` for top-level transactions `txids` of `round`; a past round's answer never changes. */
export function useTxnDevInfo(round: number, txids: string[], include: DevInclude[], enabled: boolean) {
  const sorted = [...txids].sort();
  return useQuery({
    queryKey: ["txn-dev-info", getTimeTravelNode()?.baseUrl, round, sorted, include],
    queryFn: ({ signal }) => getTxnDevInfo(round, sorted, include, signal),
    enabled: enabled && include.length > 0 && round > 0 && sorted.length > 0,
    staleTime: Infinity,
    retry: false,
    meta,
  });
}
