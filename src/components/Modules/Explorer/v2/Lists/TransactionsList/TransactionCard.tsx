import React from "react";
import { Row, flexRender } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";

import { useDateFormat } from "src/contexts/DateFormatContext";
import { AmountCellMain, AmountCellClose } from "./cells/AmountCell";
import { ToCellMain, ToCellClose } from "./cells/ToCell";
import type { TransactionTableMeta } from "./columns";

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

function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right min-w-0 overflow-hidden max-w-[80%] [&_button]:order-first">
        {children}
      </span>
    </div>
  );
}

export default function TransactionCard({
  row,
}: {
  row: Row<indexerModels.Transaction>;
}) {
  const visibleCells = row.getVisibleCells();
  const txn = React.useMemo(() => new CoreTransaction(row.original), [row.original]);
  const txnType = txn.getType();
  const { format } = useDateFormat();

  const hasCloseSplit =
    !!txn.getCloseTo() &&
    (txnType === TXN_TYPES.PAYMENT || txnType === TXN_TYPES.ASSET_TRANSFER);
  const meta = visibleCells[0]?.getContext().table.options.meta as TransactionTableMeta;

  const rows: React.ReactNode[] = [];

  visibleCells.forEach((cell) => {
    const id = cell.column.id;
    if (!cellHasContent(id, txnType)) return;
    const label = id === "age" ? getAgeLabel(format) : (columnLabels[id] || id);

    if (hasCloseSplit && id === "to") {
      rows.push(
        <CardRow key={cell.id} label="To">
          <ToCellMain txn={txn} meta={meta} />
        </CardRow>,
      );
      return;
    }

    if (hasCloseSplit && id === "amount") {
      rows.push(
        <CardRow key={cell.id} label="Amount">
          <AmountCellMain txn={txn} meta={meta} />
        </CardRow>,
        <CardRow key={cell.id + "-close-to"} label="Close To">
          <ToCellClose txn={txn} meta={meta} />
        </CardRow>,
        <CardRow key={cell.id + "-close-amount"} label="Close Amount">
          <AmountCellClose txn={txn} meta={meta} />
        </CardRow>,
      );
      return;
    }

    rows.push(
      <CardRow key={cell.id} label={label}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </CardRow>,
    );
  });

  return (
    <div className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
      {rows}
    </div>
  );
}
