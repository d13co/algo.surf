import { useQuery } from "@tanstack/react-query";
import { TransactionClient } from "src/packages/core-sdk/clients/transactionClient";
import { AssetClient } from "src/packages/core-sdk/clients/assetClient";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import explorer from "src/utils/dappflow";
import { indexerModels } from "algosdk";
import { ONE_WEEK } from "src/db/query-client";

export function useTransaction(id: string) {
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: () => new TransactionClient(explorer.network).get(id),
    enabled: !!id,
    gcTime: ONE_WEEK,
  });
}

export function useTransactionAsset(txn: indexerModels.Transaction | undefined) {
  const txnInstance = txn ? new CoreTransaction(txn) : null;
  const type = txnInstance?.getType();
  const assetId = txnInstance?.getAssetId();
  const needsAsset =
    (type === TXN_TYPES.ASSET_TRANSFER || type === TXN_TYPES.ASSET_FREEZE || type === TXN_TYPES.ASSET_CONFIG) &&
    assetId > 0;

  return useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => new AssetClient(explorer.network).get(assetId),
    enabled: needsAsset,
    gcTime: ONE_WEEK,
  });
}
