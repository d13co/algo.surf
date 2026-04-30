import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { microalgosToAlgos } from "src/utils/common";
import AlgoIcon from "src/components/Modules/Explorer/AlgoIcon/AlgoIcon";
import AssetBalance from "src/components/Modules/Explorer/v2/AssetBalance";
import NumberFormat from "react-number-format";
import type { TransactionTableMeta } from "../columns";

interface AmountPartProps {
  txn: CoreTransaction;
  meta: TransactionTableMeta;
  amount: number;
}

function AmountPart({ txn, meta, amount }: AmountPartProps) {
  const type = txn.getType();

  if (type === TXN_TYPES.PAYMENT) {
    return (
      <span className="inline-flex items-center gap-1">
        <AlgoIcon width={10} />
        <NumberFormat
          value={microalgosToAlgos(amount)}
          displayType="text"
          thousandSeparator
        />
      </span>
    );
  }

  if (type === TXN_TYPES.ASSET_TRANSFER) {
    const assetId = txn.getAssetId();
    const isAssetRecord = meta.record === "asset";
    return isAssetRecord ? (
      <AssetBalance by="asset" assetDef={meta.recordDef} id={assetId} balance={amount} />
    ) : (
      <AssetBalance id={assetId} balance={amount} />
    );
  }

  return null;
}

export function AmountCellMain({
  txn,
  meta,
}: {
  txn: CoreTransaction;
  meta: TransactionTableMeta;
}) {
  return <AmountPart txn={txn} meta={meta} amount={txn.getAmount()} />;
}

export function AmountCellClose({
  txn,
  meta,
}: {
  txn: CoreTransaction;
  meta: TransactionTableMeta;
}) {
  return <AmountPart txn={txn} meta={meta} amount={txn.getCloseAmount()} />;
}

export default function AmountCell({
  row,
  table,
}: CellContext<indexerModels.Transaction, unknown>) {
  const meta = table.options.meta as TransactionTableMeta;
  const txn = React.useMemo(() => new CoreTransaction(row.original), [row.original]);
  const closeTo = !!txn.getCloseTo();
  const type = txn.getType();

  if (type !== TXN_TYPES.PAYMENT && type !== TXN_TYPES.ASSET_TRANSFER) {
    return null;
  }

  return (
    <div className="flex flex-col items-start">
      <AmountCellMain txn={txn} meta={meta} />
      {closeTo ? <AmountCellClose txn={txn} meta={meta} /> : null}
    </div>
  );
}
