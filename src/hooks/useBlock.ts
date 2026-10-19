import { useQuery } from "@tanstack/react-query";
import { BlockClient } from "src/packages/core-sdk/clients/blockClient";
import explorer from "src/utils/dappflow";

/** The full block query, also for fetchQuery/ensureQueryData outside a render (shares useBlock's cache). */
export const blockQuery = (id: number) => ({
  queryKey: ["block", id],
  queryFn: () => new BlockClient(explorer.network).get(id),
  // A block never changes once it exists: don't refetch a cached one.
  staleTime: Infinity,
  // Every txn in the block: by far the heaviest entries. Callers after the header use useBlockHeader.
  meta: { noPersist: true },
});

export function useBlock(id: number) {
  return useQuery({ ...blockQuery(id), enabled: !!id });
}

export function useBlockHeader(id: number) {
  return useQuery({
    queryKey: ["block-header", id],
    queryFn: () => new BlockClient(explorer.network).getHeader(id),
    enabled: !!id,
    staleTime: Infinity,
  });
}

export function useBlockHash(id: number) {
  return useQuery({
    queryKey: ["block-hash", id],
    queryFn: () => new BlockClient(explorer.network).getBlockHash(id),
    enabled: !!id,
  });
}
