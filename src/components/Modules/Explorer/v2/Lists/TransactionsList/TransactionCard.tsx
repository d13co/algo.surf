import React from "react";
import { Row, flexRender } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";

const columnLabels: Record<string, string> = {
  id: "Txn ID",
  block: "Block",
  age: "Age",
  from: "From",
  to: "To",
  amount: "Amount",
  fee: "Fee",
  type: "Type",
};

function cellHasContent(columnId: string, txnType: string): boolean {
  if (columnId === "amount") {
    return txnType === TXN_TYPES.PAYMENT || txnType === TXN_TYPES.ASSET_TRANSFER;
  }
  if (columnId === "to") {
    return txnType === TXN_TYPES.PAYMENT || txnType === TXN_TYPES.ASSET_TRANSFER || txnType === TXN_TYPES.APP_CALL;
  }
  return true;
}

export default function TransactionCard({
  row,
}: {
  row: Row<A_SearchTransaction>;
}) {
  const visibleCells = row.getVisibleCells();
  const txnType = new CoreTransaction(row.original).getType();

  return (
    <div className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
      {visibleCells.map((cell) => {
        if (!cellHasContent(cell.column.id, txnType)) return null;
        return (
          <div key={cell.id} className="flex justify-between gap-2">
            <span className="text-muted-foreground shrink-0">
              {columnLabels[cell.column.id] || cell.column.id}
            </span>
            <span className="text-right min-w-0 overflow-hidden max-w-[80%] [&_button]:order-first">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          </div>
        );
      })}
    </div>
  );
}
