import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";

export default function TypeCell({
  row,
}: CellContext<indexerModels.Transaction, unknown>) {
  const txn = React.useMemo(() => new CoreTransaction(row.original), [row.original]);
  const type = txn.getTypeDisplayValue();
  const closeTo = txn.getCloseTo();

  if (closeTo) {
    return (
      <div className="flex flex-col">
        <span>{type}</span>
        <span>Close</span>
      </div>
    );
  }

  return <span>{type}</span>;
}
