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
import { indexerModels } from "algosdk";
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
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import { SkeletonRows, SkeletonCards } from "src/components/v2/ui/table-skeleton";
import { useStableHeight } from "src/hooks/useStableHeight";

const ALL_FIELDS: TransactionColumnId[] = [
  "id",
  "age",
  "from",
  "to",
  "amount",
  "fee",
  "type",
];

interface TransactionsListProps {
  transactions: indexerModels.Transaction[];
  loading?: boolean;
  initialLoading?: boolean;
  hasMore?: boolean;
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
  hasMore = true,
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

  // Single pass: collect addresses + compute group positions
  const { allAddresses, groupPositions } = useMemo(() => {
    const addrs = new Set<string>();
    const positions = new Map<number, GroupPosition>();
    const groups = transactions.map((t) => new CoreTransaction(t).getGroup());

    for (let i = 0; i < transactions.length; i++) {
      const txn = new CoreTransaction(transactions[i]);
      const from = txn.getFrom();
      const to = txn.getTo();
      const closeTo = txn.getCloseTo();
      if (from) addrs.add(from);
      if (to) addrs.add(to);
      if (closeTo) addrs.add(closeTo);

      const group = groups[i];
      if (!group || record === "group") {
        positions.set(i, "none");
        continue;
      }
      const prevGroup = groups[i - 1] ?? null;
      const nextGroup = groups[i + 1] ?? null;
      const matchPrev = prevGroup === group;
      const matchNext = nextGroup === group;
      if (matchPrev && matchNext) positions.set(i, "middle");
      else if (matchPrev) positions.set(i, "last");
      else if (matchNext) positions.set(i, "first");
      else positions.set(i, "only");
    }

    return { allAddresses: Array.from(addrs), groupPositions: positions };
  }, [transactions, record]);

  useEscrowBatch(allAddresses);

  const meta: TransactionTableMeta = useMemo(
    () => ({ record, recordId, recordDef, groupPositions }),
    [record, recordId, recordDef, groupPositions]
  );

  const table = useReactTable({
    data: transactions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    state: { columnVisibility, pagination: { pageIndex, pageSize } },
    onPaginationChange: (updater) => {
      const next = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
    },
    meta,
  });

  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = hasMore ? Math.max(0, pageSize - currentRowCount) : 0;

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  function handlePageChange(newPage: number) {
    if (newPage === pageCount - 1) {
      reachedLastPage();
    }
    table.setPageIndex(newPage);
  }

  const pagination = (
    <ListToolbar
      pageIndex={pageIndex}
      pageCount={pageCount}
      canPreviousPage={table.getCanPreviousPage()}
      canNextPage={table.getCanNextPage()}
      onFirst={() => handlePageChange(0)}
      onPrev={() => handlePageChange(pageIndex - 1)}
      onNext={() => handlePageChange(pageIndex + 1)}
      onLast={() => handlePageChange(pageCount - 1)}
      loading={loading}
      className="mt-3"
    />
  );

  return (
    <div>
      {/* Pagination */}
      {pagination}

      {/* Desktop table */}
      <div ref={tableRef} style={stableStyle} className="hidden md:block [&_button[aria-label=copy]]:hidden lg:[&_button[aria-label=copy]]:inline-flex">
        <Table className="table-fixed">
          <TableHeader className="[&_tr]:border-primary">
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
              <>
                {table.getRowModel().rows.map((row) => (
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
                ))}
                {padCount > 0 && loading ? <SkeletonRows rows={padCount} columns={table.getVisibleLeafColumns().length} animate /> : null}
              </>
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
      <div className="md:hidden space-y-2">
        {table.getRowModel().rows.length > 0 ? (
          <>
            {table.getRowModel().rows.map((row) => (
              <TransactionCard key={row.id} row={row} />
            ))}
            {padCount > 0 && loading ? <SkeletonCards rows={padCount} fields={fields.length} animate /> : null}
          </>
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

      {/* Bottom pagination (mobile only) */}
      <div className="md:hidden mt-4">
        <ListToolbar
          pageIndex={pageIndex}
          pageCount={pageCount}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          onFirst={() => handlePageChange(0)}
          onPrev={() => handlePageChange(pageIndex - 1)}
          onNext={() => handlePageChange(pageIndex + 1)}
          onLast={() => handlePageChange(pageCount - 1)}
          loading={loading}
        />
      </div>

    </div>
  );
}

export default TransactionsList;
