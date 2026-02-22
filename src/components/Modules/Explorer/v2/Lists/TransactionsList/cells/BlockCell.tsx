import React from "react";
import { CellContext } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import LinkToBlock from "../../../Links/LinkToBlock";

export default function BlockCell({
  row,
}: CellContext<A_SearchTransaction, unknown>) {
  const block = new CoreTransaction(row.original).getBlock();
  return <LinkToBlock id={block} />;
}
