import { useMemo, useState, useEffect, useRef } from "react";
import { useAccounts, useEscrowBatch } from "src/hooks/useAccount";
import { A_SearchAccount } from "src/packages/core-sdk/types";
import { microalgosToAlgos } from "src/utils/common";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  Row,
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
import { Input } from "src/components/v2/ui/input";
import LinkToAccount from "../Links/LinkToAccount";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import NumberFormat from "react-number-format";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Loader2,
  X,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { SkeletonRows, SkeletonCards } from "src/components/v2/ui/table-skeleton";
import { useStableHeight } from "src/hooks/useStableHeight";
import { useDebounce } from "src/hooks/useDebounce";
import { isValidBase32Prefix, completeAddress } from "src/utils/completeAddress";

const columns: ColumnDef<A_SearchAccount, any>[] = [
  {
    id: "address",
    header: "Address",
    cell: ({ row }) => (
      <LinkToAccount
        copy="left"
        copySize="s"
        address={row.original.address}
        strip={30}
      />
    ),
  },
  {
    id: "balance",
    header: "Balance",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <AlgoIcon />
        <NumberFormat
          value={microalgosToAlgos(row.original.amount)}
          displayType="text"
          thousandSeparator
        />
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <span>{row.original.status}</span>,
  },
  {
    id: "created-assets",
    header: "Created assets",
    cell: ({ row }) => <span>{row.original["total-created-assets"]}</span>,
  },
  {
    id: "created-apps",
    header: "Created apps",
    cell: ({ row }) => <span>{row.original["total-created-apps"]}</span>,
  },
];

const columnLabels: Record<string, string> = {
  address: "Address",
  balance: "Balance",
  status: "Status",
  "created-assets": "Created assets",
  "created-apps": "Created apps",
};

function AccountCard({ row }: { row: Row<A_SearchAccount> }) {
  const visibleCells = row.getVisibleCells();
  return (
    <div className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
      {visibleCells.map((cell) => (
        <div key={cell.id} className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">
            {columnLabels[cell.column.id] || cell.column.id}
          </span>
          <span className="text-right min-w-0 overflow-hidden max-w-[80%]">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </span>
        </div>
      ))}
    </div>
  );
}

function Accounts(): JSX.Element {
  useTitle("Accounts");

  const [searchParams, setSearchParams] = useSearchParams();
  const [prefix, setPrefix] = useState(() => {
    const s = searchParams.get("s") ?? "";
    return s.toUpperCase().replace(/[^A-Z2-7]/g, "").slice(0, 52);
  });
  const [debouncedPrefix, flushPrefix] = useDebounce(prefix, 1500);
  const isDebouncing = prefix !== debouncedPrefix;

  // Sync debounced prefix → ?s= query param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedPrefix) {
        next.set("s", debouncedPrefix);
      } else {
        next.delete("s");
      }
      return next;
    }, { replace: true });
  }, [debouncedPrefix, setSearchParams]);

  const prefixToken = useMemo(() => {
    if (!debouncedPrefix) return undefined;
    if (!isValidBase32Prefix(debouncedPrefix)) return undefined;
    return completeAddress(debouncedPrefix);
  }, [debouncedPrefix]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAccounts(prefixToken);

  // Filter to only accounts whose address starts with the searched prefix.
  // The indexer returns accounts *from* a cursor onward, which includes
  // addresses past the prefix range — we trim those here.
  const accounts = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.accounts) ?? [];
    if (!debouncedPrefix) return all;
    return all.filter((a) => a.address.startsWith(debouncedPrefix));
  }, [data, debouncedPrefix]);

  // When filtering by prefix, stop pagination once the indexer returns
  // accounts that no longer match (we've left the prefix range).
  const effectiveHasNextPage = useMemo(() => {
    if (!hasNextPage) return false;
    if (!debouncedPrefix || !data) return hasNextPage;
    const lastPage = data.pages[data.pages.length - 1];
    if (!lastPage || lastPage.accounts.length === 0) return false;
    const lastAccount = lastPage.accounts[lastPage.accounts.length - 1];
    return lastAccount.address.startsWith(debouncedPrefix);
  }, [hasNextPage, debouncedPrefix, data]);

  const allAddresses = useMemo(
    () => accounts.map((a) => a.address),
    [accounts],
  );
  useEscrowBatch(allAddresses);

  const loading = !data;

  const table = useReactTable({
    data: accounts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.address,
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const prefixTokenRef = useRef(prefixToken);
  useEffect(() => {
    if (prefixTokenRef.current !== prefixToken) {
      prefixTokenRef.current = prefixToken;
      table.setPageIndex(0);
    }
  }, [prefixToken, table]);

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = effectiveHasNextPage && !debouncedPrefix ? pageSize - currentRowCount : 0;

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (newPage >= pageCount - 1 && effectiveHasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <div>
      {/* Search + Pagination toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-4 pb-2">
        {/* Filter by address prefix */}
        <div className="relative sm:max-w-[420px] w-full">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Filter by address"
            className="pl-9 pr-16 rounded-full"
            value={prefix}
            onChange={(e) => {
              const cleaned = e.target.value.toUpperCase().replace(/[^A-Z2-7]/g, "");
              setPrefix(cleaned.slice(0, 52));
            }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isDebouncing && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {prefix && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => { setPrefix(""); flushPrefix(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Pagination */}
        {pageCount > 1 ? (
          <div className="flex items-center justify-end gap-2 mt-2 sm:mt-0">
            {isFetchingNextPage ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <Button
              variant="muted"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="muted"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(pageIndex - 1)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="muted"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(pageIndex + 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="muted"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(pageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading accounts...</span>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div ref={tableRef} style={stableStyle} className="hidden md:block">
            <Table className="table-fixed">
              <TableHeader className="[&_tr]:border-primary">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
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
                          <TableCell key={cell.id} className="max-w-0">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {padCount > 0 ? <SkeletonRows rows={padCount} columns={columns.length} animate={isFetchingNextPage} /> : null}
                  </>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No accounts
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2 mt-3">
            {table.getRowModel().rows.length > 0 ? (
              <>
                {table.getRowModel().rows.map((row) => (
                  <AccountCard key={row.id} row={row} />
                ))}
                {padCount > 0 ? <SkeletonCards rows={padCount} fields={columns.length} animate={isFetchingNextPage} /> : null}
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No accounts
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Accounts;
