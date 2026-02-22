import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useControllingAccounts } from "src/hooks/useAccount";
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
import LinkToAccount from "../Links/LinkToAccount";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import NumberFormat from "react-number-format";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";

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
    id: "assets",
    header: "Assets",
    cell: ({ row }) => <span>{row.original["total-assets-opted-in"]}</span>,
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
  assets: "Assets",
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

function AccountControllerTo(): JSX.Element {
  const { address } = useParams();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useControllingAccounts(address);

  const accounts = useMemo(
    () => data?.pages.flatMap((p) => p.accounts) ?? [],
    [data]
  );

  const table = useReactTable({
    data: accounts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.address,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (newPage >= pageCount - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
                    <TableCell key={cell.id} className="max-w-0">
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
          table.getRowModel().rows.map((row) => (
            <AccountCard key={row.id} row={row} />
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No accounts
          </div>
        )}
      </div>

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 py-4">
          <span className="text-sm text-muted-foreground">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              table.previousPage();
            }}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(pageIndex + 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
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
  );
}

export default AccountControllerTo;
