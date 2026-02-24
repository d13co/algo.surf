import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { CoreAsset } from "src/packages/core-sdk/classes/core/CoreAsset";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToAsset from "../../Links/LinkToAsset";

function AssetTransferTransaction({
  transaction,
  asset,
}: {
  transaction: any;
  asset: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const assetInstance = new CoreAsset(asset);

  return (
    <div className="mt-7">
      <div className="rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">Sender</div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">Receiver</div>
          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
            <LinkToAccount copySize="m" address={txnInstance.getTo()} />
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">Asset</div>
          <div className="mt-2.5">
            <LinkToAsset
              id={txnInstance.getAssetId()}
              name={txnInstance.getAssetId() + "(" + assetInstance.getName() + ")"}
            />
          </div>
        </div>

        <div className="col-span-12 sm:col-span-6">
          <div className="text-muted-foreground">Amount</div>
          <div className="mt-2.5 inline-flex items-center gap-1">
            <NumberFormatCopy
              value={assetInstance.getAmountInDecimals(txnInstance.getAmount())}
              copyPosition="left"
              displayType="text"
              thousandSeparator
            />
            <span>{assetInstance.getUnitName()}</span>
          </div>
        </div>

        {txnInstance.getCloseTo() ? (
          <div className="col-span-12">
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
                value={assetInstance.getAmountInDecimals(
                  txnInstance.getCloseAmount(),
                )}
                copyPosition="left"
                displayType="text"
                thousandSeparator
              />
              <span>{assetInstance.getUnitName()}</span>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}

export default AssetTransferTransaction;
