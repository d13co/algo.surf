import React, { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  VisibilityState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/v2/ui/table";
import { Button } from "src/components/v2/ui/button";
import { A_SearchTransaction } from "src/packages/core-sdk/types";
import {
  columns,
  columnClassName,
  TransactionColumnId,
  TransactionTableMeta,
  GroupPosition,
} from "./columns";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { TXN_TYPES } from "src/packages/core-sdk/constants";
import { useEscrowBatch } from "src/hooks/useAccount";
import TransactionCard from "./TransactionCard";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";

const ALL_FIELDS: TransactionColumnId[] = [
  "id",
  "block",
  "age",
  "from",
  "to",
  "amount",
  "fee",
  "type",
];

interface TransactionsListProps {
  transactions: A_SearchTransaction[];
  loading?: boolean;
  initialLoading?: boolean;
  reachedLastPage?: Function;
  fields?: TransactionColumnId[];
  record?: string;
  recordId?: string;
  recordDef?: any;
}

function TransactionsList({
  transactions = [],
  loading = false,
  initialLoading = false,
  reachedLastPage = () => {},
  fields = ALL_FIELDS,
  record = "",
  recordId = "",
  recordDef = {},
}: TransactionsListProps): JSX.Element {
  const [pageIndex, setPageIndex] = React.useState(0);
  const pageSize = 10;

  const columnVisibility: VisibilityState = useMemo(() => {
    const vis: VisibilityState = {};
    for (const col of ALL_FIELDS) {
      vis[col] = fields.includes(col);
    }

    // Auto-hide columns where no row on the current page has a value
    const start = pageIndex * pageSize;
    const pageTxns = transactions.slice(start, start + pageSize);
    const types = pageTxns.map((t) => new CoreTransaction(t).getType());

    if (vis["amount"]) {
      vis["amount"] = types.some(
        (t) => t === TXN_TYPES.PAYMENT || t === TXN_TYPES.ASSET_TRANSFER,
      );
    }
    if (vis["to"]) {
      vis["to"] = types.some(
        (t) =>
          t === TXN_TYPES.PAYMENT ||
          t === TXN_TYPES.ASSET_TRANSFER ||
          t === TXN_TYPES.APP_CALL,
      );
    }

    return vis;
  }, [fields, transactions, pageIndex]);

  // Collect all addresses from transactions and batch-prefetch escrow lookups
  const allAddresses = useMemo(() => {
    const addrs = new Set<string>();
    for (const t of transactions) {
      const txn = new CoreTransaction(t);
      const from = txn.getFrom();
      const to = txn.getTo();
      const closeTo = txn.getCloseTo();
      if (from) addrs.add(from);
      if (to) addrs.add(to);
      if (closeTo) addrs.add(closeTo);
    }
    return Array.from(addrs);
  }, [transactions]);

  useEscrowBatch(allAddresses);

  const groupPositions = useMemo(() => {
    const positions = new Map<number, GroupPosition>();
    for (let i = 0; i < transactions.length; i++) {
      const group = new CoreTransaction(transactions[i]).getGroup();
      if (!group || record === "group") {
        positions.set(i, "none");
        continue;
      }
      const prevGroup = i > 0 ? new CoreTransaction(transactions[i - 1]).getGroup() : null;
      const nextGroup = i < transactions.length - 1 ? new CoreTransaction(transactions[i + 1]).getGroup() : null;
      const matchPrev = prevGroup === group;
      const matchNext = nextGroup === group;
      if (matchPrev && matchNext) positions.set(i, "middle");
      else if (matchPrev) positions.set(i, "last");
      else if (matchNext) positions.set(i, "first");
      else positions.set(i, "only");
    }
    return positions;
  }, [transactions, record]);

  const meta: TransactionTableMeta = useMemo(
    () => ({ record, recordId, recordDef, groupPositions }),
    [record, recordId, recordDef, groupPositions]
  );

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { columnVisibility, pagination: { pageIndex, pageSize } },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
    },
    meta,
  });

  const pageCount = table.getPageCount();

  function handlePageChange(newPage: number) {
    if (newPage === pageCount - 1) {
      reachedLastPage();
    }
    table.setPageIndex(newPage);
  }

  const pagination = pageCount > 1 ? (
    <div className="flex items-center justify-end gap-2 py-4">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : null}
      <span className="text-sm text-muted-foreground">
        Page {pageIndex + 1} of {pageCount}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => handlePageChange(0)}
        disabled={!table.getCanPreviousPage()}
      >
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => handlePageChange(pageIndex - 1)}
        disabled={!table.getCanPreviousPage()}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => handlePageChange(pageIndex + 1)}
        disabled={!table.getCanNextPage()}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => handlePageChange(pageCount - 1)}
        disabled={!table.getCanNextPage()}
      >
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  ) : null;

  return (
    <div>
      {/* Pagination */}
      {pagination}

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={columnClassName[header.id as TransactionColumnId]}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`max-w-0${cell.column.id === "id" ? " pl-2" : ""}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleLeafColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {initialLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading transactions...
                    </span>
                  ) : "No transactions"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2 mt-3">
        {table.getRowModel().rows.length > 0 ? (
          table.getRowModel().rows.map((row) => (
            <TransactionCard key={row.id} row={row} />
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            {initialLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading transactions...
              </span>
            ) : "No transactions"}
          </div>
        )}
      </div>

    </div>
  );
}

export default TransactionsList;
