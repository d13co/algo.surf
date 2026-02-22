import React from "react";
import { CellContext } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import MultiDateViewer from "src/components/v2/MultiDateViewer";

export default function AgeCell({
  row,
}: CellContext<A_SearchTransaction, unknown>) {
  const timestamp = new CoreTransaction(row.original).getTimestamp();
  return <MultiDateViewer timestamp={timestamp} variant="short" />;
}
