import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { microalgosToAlgos } from "src/utils/common";
import AlgoIcon from "src/components/Modules/Explorer/AlgoIcon/AlgoIcon";
import NumberFormat from "react-number-format";

export default function FeeCell({
  row,
}: CellContext<indexerModels.Transaction, unknown>) {
  const fee = new CoreTransaction(row.original).getFee();
  return (
    <span className="inline-flex items-center gap-1">
      <AlgoIcon width={10} />
      <NumberFormat
        value={microalgosToAlgos(fee)}
        displayType="text"
        thousandSeparator
      />
    </span>
  );
}
