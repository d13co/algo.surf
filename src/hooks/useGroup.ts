import { useQuery } from "@tanstack/react-query";
import { GroupClient } from "src/packages/core-sdk/clients/groupClient";
import explorer from "src/utils/dappflow";

export function useGroup(id: string, blockId: number) {
  return useQuery({
    queryKey: ["group", id, blockId],
    queryFn: () => new GroupClient(explorer.network).get(id, blockId),
    enabled: !!id && !!blockId,
  });
}
