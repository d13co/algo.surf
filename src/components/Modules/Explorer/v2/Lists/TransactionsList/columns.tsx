import { ColumnDef } from "@tanstack/react-table";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import TxnIdCell from "./cells/TxnIdCell";
import BlockCell from "./cells/BlockCell";
import AgeCell from "./cells/AgeCell";
import FromCell from "./cells/FromCell";
import ToCell from "./cells/ToCell";
import AmountCell from "./cells/AmountCell";
import FeeCell from "./cells/FeeCell";
import TypeCell from "./cells/TypeCell";

export type TransactionColumnId =
  | "id"
  | "block"
  | "age"
  | "from"
  | "to"
  | "amount"
  | "fee"
  | "type";

export type GroupPosition = "first" | "middle" | "last" | "only" | "none";

export interface TransactionTableMeta {
  record: string;
  recordId: string;
  recordDef: any;
  groupPositions?: Map<number, GroupPosition>;
}

export const columnClassName: Partial<Record<TransactionColumnId, string>> = {
  id: "pl-2",
  from: "w-[15%]",
  to: "w-[15%]",
};

export const columns: ColumnDef<A_SearchTransaction, any>[] = [
  {
    id: "id",
    header: "Txn ID",
    cell: TxnIdCell,
  },
  {
    id: "block",
    header: "Block",
    cell: BlockCell,
  },
  {
    id: "age",
    header: "Age",
    cell: AgeCell,
  },
  {
    id: "from",
    header: "From",
    cell: FromCell,
  },
  {
    id: "to",
    header: "To",
    cell: ToCell,
  },
  {
    id: "amount",
    header: "Amount",
    cell: AmountCell,
  },
  {
    id: "fee",
    header: "Fee",
    cell: FeeCell,
  },
  {
    id: "type",
    header: "Type",
    cell: TypeCell,
  },
];
