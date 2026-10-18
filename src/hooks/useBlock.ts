import { useQuery } from "@tanstack/react-query";
import { BlockClient } from "src/packages/core-sdk/clients/blockClient";
import explorer from "src/utils/dappflow";

/** The block query, for fetchQuery outside a component's render (shares useBlock's cache). */
export function blockQuery(id: number) {
  return {
    queryKey: ["block", id],
    queryFn: () => new BlockClient(explorer.network).get(id),
    // A block never changes once it exists: don't refetch a cached one.
    staleTime: Infinity,
  };
}

export function useBlock(id: number) {
  return useQuery({
    ...blockQuery(id),
    enabled: !!id,
  });
}

export function useBlockHash(id: number) {
  return useQuery({
    queryKey: ["block-hash", id],
    queryFn: () => new BlockClient(explorer.network).getBlockHash(id),
    enabled: !!id,
  });
}
