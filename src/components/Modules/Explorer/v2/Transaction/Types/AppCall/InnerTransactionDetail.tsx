import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { microalgosToAlgos } from "src/utils/common";
import AlgoIcon from "../../../../AlgoIcon/AlgoIcon";
import JsonViewer from "src/components/v2/JsonViewer";
import PaymentTransaction from "../PaymentTransaction";
import AssetTransferTransaction from "../AssetTransferTransaction";
import AssetConfigTransaction from "../AssetConfigTransaction";
import KeyRegTransaction from "../KeyRegTransaction";
import AppCallTransaction from "../AppCallTransaction";
import TransactionNote from "../../Sections/TransactionNote";
import TransactionRekey from "../../Sections/TransactionRekey";
import TransactionAdditionalDetails from "../../Sections/TransactionAdditionalDetails";

function InnerTransactionDetail({
  txn,
  asset,
  innerPath,
  txnId,
}: {
  txn: any;
  asset?: any;
  innerPath?: string;
  txnId?: string;
}): JSX.Element {
  const txnInstance = new CoreTransaction(txn);
  const pathLabel = innerPath ? innerPath.replace(/\//g, "-") : "";
  const title = innerPath ? `Inner transaction ${innerPath}` : "Inner transaction";
  const filename = txnId && pathLabel ? `${txnId}-inner-${pathLabel}.json` : "inner-txn.json";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center text-xs border rounded px-2.5 py-0.5 border-yellow-500 text-yellow-500">
          {txnInstance.getTypeDisplayValue()}
        </span>
        <JsonViewer
          obj={() => txnInstance.toJSON()}
          title={title}
          filename={filename}
          size="sm"
        />
      </div>

      <div className="rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-4">
            <div className="text-muted-foreground">Type</div>
            <div className="mt-2.5">
              {txnInstance.getTypeDisplayValue()}
            </div>
          </div>

          <div className="col-span-12 sm:col-span-4">
            <div className="text-muted-foreground">Fee</div>
            <div className="mt-2.5 inline-flex items-center gap-1">
              {microalgosToAlgos(txnInstance.getFee())}
              <AlgoIcon />
            </div>
          </div>

          {txnInstance.getGroup() ? (
            <div className="col-span-12 sm:col-span-4">
              <div className="text-muted-foreground">Group</div>
              <div className="mt-2.5 text-xs break-all">
                {txnInstance.getGroup()}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {txnInstance.getType() === TXN_TYPES.PAYMENT ? (
        <PaymentTransaction transaction={txn} />
      ) : null}
      {txnInstance.getType() === TXN_TYPES.ASSET_TRANSFER && asset ? (
        <AssetTransferTransaction transaction={txn} asset={asset} />
      ) : null}
      {txnInstance.getType() === TXN_TYPES.ASSET_CONFIG ? (
        <AssetConfigTransaction transaction={txn} />
      ) : null}
      {txnInstance.getType() === TXN_TYPES.KEY_REGISTRATION ? (
        <KeyRegTransaction transaction={txn} />
      ) : null}
      {txnInstance.getType() === TXN_TYPES.APP_CALL ? (
        <AppCallTransaction transaction={txn} hideInnerTxns />
      ) : null}

      <TransactionRekey transaction={txn} />
      <TransactionNote transaction={txn} />
      <TransactionAdditionalDetails transaction={txn} />
    </div>
  );
}

export default InnerTransactionDetail;
