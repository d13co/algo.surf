import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { CoreAsset } from "src/packages/core-sdk/classes/core/CoreAsset";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import Copyable from "src/components/v2/Copyable";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToAsset from "../../Links/LinkToAsset";
import XChainOwnerField from "../Sections/XChainOwner";
import WarningNotice from "../../WarningNotice";

function AssetTransferTransaction({
  transaction,
  asset,
}: {
  transaction: any;
  // null when the asset id resolves to nothing on the indexer — the AVM
  // accepts zero-amount transfers of any asset id, existent or not.
  asset: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const assetInstance = asset ? new CoreAsset(asset) : null;

  return (
    <div className="mt-7">
      {!assetInstance ? (
        <WarningNotice>
          Asset {txnInstance.getAssetId()} does not exist. The network permits
          zero-amount transfers of any asset ID, even one that was never
          created.
        </WarningNotice>
      ) : null}
      <div className="rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6">
          <div className="text-muted-foreground">Sender</div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
          </div>
        </div>

        <XChainOwnerField transaction={transaction} />

        <div className="col-span-12 md:col-span-6">
          <div className="text-muted-foreground">Receiver</div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount copySize="m" address={txnInstance.getTo()} />
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6 min-w-0">
          <div className="text-muted-foreground">Asset</div>
          <div className="mt-2.5 min-w-0">
            {assetInstance ? (
              <LinkToAsset
                id={txnInstance.getAssetId()}
                name={assetInstance.getTransactionLabel()}
              />
            ) : (
              // Nothing to link to — the id resolves to no asset.
              <span className="inline-flex items-center gap-1">
                {txnInstance.getAssetId()}
                <Copyable value={txnInstance.getAssetId()} />
              </span>
            )}
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">Amount</div>
          <div className="mt-2.5 inline-flex items-center gap-1">
            <NumberFormatCopy
              value={
                assetInstance
                  ? assetInstance.getAmountInDecimals(txnInstance.getAmount())
                  : txnInstance.getAmount()
              }
              copyPosition="right"
              displayType="text"
              thousandSeparator
            />
            <span>{assetInstance?.getUnitName()}</span>
          </div>
        </div>

        {txnInstance.getCloseTo() ? (
          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">Close account</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              <LinkToAccount copySize="m" address={txnInstance.getCloseTo()} />
            </div>
          </div>
        ) : null}

        {txnInstance.getCloseTo() ? (
          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <div className="text-muted-foreground">Close amount</div>
            <div className="mt-2.5 inline-flex items-center gap-1">
              <NumberFormatCopy
                value={
                  assetInstance
                    ? assetInstance.getAmountInDecimals(
                        txnInstance.getCloseAmount(),
                      )
                    : txnInstance.getCloseAmount()
                }
                copyPosition="right"
                displayType="text"
                thousandSeparator
              />
              <span>{assetInstance?.getUnitName()}</span>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

export default AssetTransferTransaction;
