import React from "react";
import { Row, flexRender } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";

import { useDateFormat } from "src/contexts/DateFormatContext";

const columnLabels: Record<string, string> = {
  id: "Txn ID",
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

function getAgeLabel(format: string): string {
  if (format === "block") return "Block";
  if (format === "relative") return "Age";
  return "Date";
}

export default function TransactionCard({
  row,
}: {
  row: Row<indexerModels.Transaction>;
}) {
  const visibleCells = row.getVisibleCells();
  const txnType = new CoreTransaction(row.original).getType();
  const { format } = useDateFormat();

  return (
    <div className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
      {visibleCells.map((cell) => {
        if (!cellHasContent(cell.column.id, txnType)) return null;
        const label = cell.column.id === "age"
          ? getAgeLabel(format)
          : (columnLabels[cell.column.id] || cell.column.id);
        return (
          <div key={cell.id} className="flex justify-between gap-2">
            <span className="text-muted-foreground shrink-0">
              {label}
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
