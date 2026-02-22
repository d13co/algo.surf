import React from "react";
import { CellContext } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { microalgosToAlgos } from "src/utils/common";
import AlgoIcon from "src/components/Modules/Explorer/AlgoIcon/AlgoIcon";
import AssetBalance from "src/components/Modules/Explorer/Common/AssetBalance/AssetBalance";
import NumberFormat from "react-number-format";
import type { TransactionTableMeta } from "../columns";

export default function AmountCell({
  row,
  table,
}: CellContext<A_SearchTransaction, unknown>) {
  const meta = table.options.meta as TransactionTableMeta;
  const txn = new CoreTransaction(row.original);
  const amount = txn.getAmount();
  const closeTo = !!txn.getCloseTo();
  const closeAmount = txn.getCloseAmount();
  const type = txn.getType();

  if (type === TXN_TYPES.PAYMENT) {
    return (
      <div>
        <span className="inline-flex items-center gap-1">
          <AlgoIcon width={10} />
          <NumberFormat
            value={microalgosToAlgos(amount)}
            displayType="text"
            thousandSeparator
          />
        </span>
        {closeTo ? (
          <>
            <br />
            <span className="inline-flex items-center gap-1">
              <AlgoIcon width={10} />
              <NumberFormat
                value={microalgosToAlgos(closeAmount)}
                displayType="text"
                thousandSeparator
              />
            </span>
          </>
        ) : null}
      </div>
    );
  }

  if (type === TXN_TYPES.ASSET_TRANSFER) {
    const assetId = txn.getAssetId();
    const isAssetRecord = meta.record === "asset";
    return (
      <div>
        {isAssetRecord ? (
          <AssetBalance by="asset" assetDef={meta.recordDef} id={assetId} balance={amount} />
        ) : (
          <AssetBalance id={assetId} balance={amount} />
        )}
        {closeTo ? (
          isAssetRecord ? (
            <AssetBalance by="asset" assetDef={meta.recordDef} id={assetId} balance={closeAmount} />
          ) : (
            <AssetBalance id={assetId} balance={closeAmount} />
          )
        ) : null}
      </div>
    );
  }

  return null;
}
