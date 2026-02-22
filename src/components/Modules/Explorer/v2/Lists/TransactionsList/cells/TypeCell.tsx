import React from "react";
import { CellContext } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";

export default function TypeCell({
  row,
}: CellContext<A_SearchTransaction, unknown>) {
  const txn = new CoreTransaction(row.original);
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
