import { useQuery } from "@tanstack/react-query";
import { BlockClient } from "src/packages/core-sdk/clients/blockClient";
import explorer from "src/utils/dappflow";
import { ONE_WEEK } from "src/db/query-client";

export function useBlock(id: number) {
  return useQuery({
    queryKey: ["block", id],
    queryFn: () => new BlockClient(explorer.network).get(id),
    enabled: !!id,
    gcTime: ONE_WEEK,
  });
}

export function useBlockHash(id: number) {
  return useQuery({
    queryKey: ["block-hash", id],
    queryFn: () => new BlockClient(explorer.network).getBlockHash(id),
    enabled: !!id,
    gcTime: ONE_WEEK,
  });
}
