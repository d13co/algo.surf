import { useQuery } from "@tanstack/react-query";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";
import { ONE_WEEK } from "src/db/query-client";

export function useAsset(id: number) {
  return useQuery({
    queryKey: ["asset", id],
    queryFn: () => new AssetClient(explorer.network).get(id),
    enabled: !!id,
    gcTime: ONE_WEEK,
  });
}
