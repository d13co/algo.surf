import { useQuery } from "@tanstack/react-query";
import { getFullDeltasSupport, getStateChangesSupport, getTimeTravelNode, getTxnStateChanges } from "src/utils/timeTravel";
import { useTimeTravelStatus } from "./useTimeTravel";

const meta = { noPersist: true };

/**
 * Whether the configured time-travel node serves per-transaction state
 * changes (`state-changes` in its capabilities); undefined while checking.
 * False without a node, or one that serves no time travel for this network.
 */
export function useStateChangesSupport(): boolean | undefined {
  const status = useTimeTravelStatus();
  const tt = status === "supported";
  const node = getTimeTravelNode();
  const { data, isLoading } = useQuery({
    queryKey: ["state-changes-support", node?.baseUrl],
    queryFn: async () => {
      try {
        return await getStateChangesSupport();
      } catch (e) {
        console.warn(`${node?.baseUrl}: no state changes: ${(e as Error).message}`);
        return false;
      }
    },
    enabled: tt,
    staleTime: Infinity,
    retry: false,
    meta,
  });
  if (status === "checking") return undefined;
  if (!tt) return false;
  return isLoading ? undefined : data;
}

/**
 * Whether the node serves per-transaction state changes, and full deltas
 * (what each group changed besides app state); each undefined while checking.
 */
export function useStateChangesCaps(): { supported: boolean | undefined; full: boolean | undefined } {
  const supported = useStateChangesSupport();
  const node = getTimeTravelNode();
  const { data, isLoading } = useQuery({
    queryKey: ["full-deltas-support", node?.baseUrl],
    queryFn: async () => {
      try {
        return await getFullDeltasSupport();
      } catch (e) {
        console.warn(`${node?.baseUrl}: no full deltas: ${(e as Error).message}`);
        return false;
      }
    },
    enabled: !!supported,
    staleTime: Infinity,
    retry: false,
    meta,
  });
  if (!supported) return { supported, full: supported === false ? false : undefined };
  return { supported, full: isLoading ? undefined : data };
}

/**
 * The state changes of top-level transactions `txids` of `round`, with their
 * inner transactions; with the node's full deltas where it serves them, so a
 * page's cards share one request. Waits until both capabilities are known. A
 * past round's answer never changes.
 */
export function useTxnStateChanges(round: number, txids: string[], caps: { supported?: boolean; full?: boolean }) {
  const sorted = [...txids].sort();
  const full = !!caps.full;
  return useQuery({
    queryKey: ["txn-state-changes", getTimeTravelNode()?.baseUrl, round, sorted, full],
    queryFn: ({ signal }) => getTxnStateChanges(round, sorted, signal, full),
    enabled: !!caps.supported && caps.full !== undefined && round > 0 && sorted.length > 0,
    staleTime: Infinity,
    // 400 (too large) and 404 (block not stored) won't change on a retry.
    retry: false,
    meta,
  });
}
