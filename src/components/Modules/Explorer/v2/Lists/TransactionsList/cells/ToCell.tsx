import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import LinkToAccount from "../../../Links/LinkToAccount";
import LinkToApplication from "../../../Links/LinkToApplication";
import { DisplayAccount } from "src/components/Common/DisplayAccount";
import type { TransactionTableMeta } from "../columns";

function AddressPart({
  address,
  meta,
}: {
  address: string;
  meta: TransactionTableMeta;
}) {
  const showLink = !(meta.record === "account" && meta.recordId === address);
  return (
    <span className="truncate">
      {showLink ? (
        <LinkToAccount copySize="s" address={address} />
      ) : (
        <DisplayAccount address={address} />
      )}
    </span>
  );
}

export function ToCellMain({
  txn,
  meta,
}: {
  txn: CoreTransaction;
  meta: TransactionTableMeta;
}) {
  const type = txn.getType();

  if (type === TXN_TYPES.PAYMENT || type === TXN_TYPES.ASSET_TRANSFER) {
    return <AddressPart address={txn.getTo()} meta={meta} />;
  }

  if (type === TXN_TYPES.APP_CALL) {
    const appId = txn.getAppId();
    return <LinkToApplication id={appId} name={"App " + appId} copySize="m" />;
  }

  return null;
}

export function ToCellClose({
  txn,
  meta,
}: {
  txn: CoreTransaction;
  meta: TransactionTableMeta;
}) {
  const closeTo = txn.getCloseTo();
  if (!closeTo) return null;
  return <AddressPart address={closeTo} meta={meta} />;
}

export default function ToCell({
  row,
  table,
}: CellContext<indexerModels.Transaction, unknown>) {
  const meta = table.options.meta as TransactionTableMeta;
  const txn = React.useMemo(() => new CoreTransaction(row.original), [row.original]);
  const closeTo = txn.getCloseTo();
  const type = txn.getType();

  if (type === TXN_TYPES.PAYMENT || type === TXN_TYPES.ASSET_TRANSFER) {
    return (
      <div className="flex flex-col gap-0.5 min-w-0">
        <ToCellMain txn={txn} meta={meta} />
        {closeTo ? <ToCellClose txn={txn} meta={meta} /> : null}
      </div>
    );
  }

  if (type === TXN_TYPES.APP_CALL) {
    return <ToCellMain txn={txn} meta={meta} />;
  }

  return null;
}
