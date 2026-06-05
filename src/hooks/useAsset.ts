import { useQuery } from "@tanstack/react-query";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";
import { ONE_WEEK } from "src/db/query-client";

// Back-fills params from the asset-creation transaction when the asset has been
// deleted (the indexer clears its info). Cheap for live assets — the fallback
// short-circuits right after the initial lookup. Single ["asset", id] key so
// every consumer (asset page, balances, transaction views) shares one entry.
export function useAsset(id: number) {
  return useQuery({
    queryKey: ["asset", id],
    queryFn: () => new AssetClient(explorer.network).getWithCreationFallback(id),
    enabled: !!id,
    gcTime: ONE_WEEK,
  });
}
