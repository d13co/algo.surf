import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import LinkToBlock from "../../../Links/LinkToBlock";

export default function BlockCell({
  row,
}: CellContext<indexerModels.Transaction, unknown>) {
  const block = new CoreTransaction(row.original).getBlock();
  return <LinkToBlock id={block} />;
}
