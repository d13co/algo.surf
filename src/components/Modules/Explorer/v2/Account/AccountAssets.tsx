import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import { A_AssetHoldingTiny } from "src/packages/core-sdk/types";
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
import LinkToAsset from "../Links/LinkToAsset";
import Copyable from "src/components/v2/Copyable";
import NumberFormat from "react-number-format";
import { Filter, Loader2, ThermometerSnowflake } from "lucide-react";
import TablePagination from "src/components/v2/TablePagination";
import { Input } from "src/components/v2/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const columns: ColumnDef<A_AssetHoldingTiny, any>[] = [
  {
    id: "index",
    header: "ID",
    cell: ({ row }) => (
      <span className="inline-flex items-center min-w-0">
        <Copyable size="s" value={row.original.index} />
        <LinkToAsset id={row.original.index} />
      </span>
    ),
  },
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <LinkToAsset
        id={row.original.index}
        name={row.original.params.name || String(row.original.index)}
      />
    ),
  },
  {
    id: "balance",
    header: "Balance",
    cell: ({ row }) => {
      const { amount, frozen, params } = row.original;
      const displayAmount = amount / 10 ** (params.decimals || 0);
      return (
        <span className="inline-flex items-center gap-1">
          {frozen ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 text-blue-400">
                    <ThermometerSnowflake size={14} />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white border-border">
                  <p>This asset is frozen for this account</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <NumberFormat
            value={displayAmount}
            displayType="text"
            thousandSeparator
          />
          {params["unit-name"] ? (
            <span className="text-muted-foreground ml-0.5">
              {params["unit-name"]}
            </span>
          ) : null}
        </span>
      );
    },
  },
];

const columnLabels: Record<string, string> = {
  index: "ID",
  name: "Name",
  balance: "Balance",
};

function AssetCard({ row }: { row: Row<A_AssetHoldingTiny> }) {
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

function AccountAssets(): JSX.Element {
  const { address } = useParams();
  const { data: accountInfo } = useAccount(address);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [searchStatus, setSearchStatus] = useState("");

  const optedAssetIds = useMemo(() => {
    return (accountInfo?.assets ?? []).map((a) => Number(a.assetId));
  }, [accountInfo?.assets]);

  const optedAssetAmounts: Map<
    number,
    { amount: number; "is-frozen": boolean }
  > = useMemo(() => {
    const map = new Map();
    (accountInfo?.assets ?? []).forEach((a) => {
      map.set(Number(a.assetId), { amount: Number(a.amount), "is-frozen": a.isFrozen });
    });
    return map;
  }, [accountInfo?.assets]);

  const { data: optedAssets, isLoading } = useTinyAssets(optedAssetIds);

  const handleChangeSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 100);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filteredAssetHoldings: A_AssetHoldingTiny[] = useMemo(() => {
    if (!optedAssets) return [];

    const search = debouncedSearchTerm.toLocaleLowerCase();

    if (!debouncedSearchTerm.trim().length) {
      setSearchStatus(`${optedAssets.length} assets`);
      return optedAssets.map((a) => {
        const holding = optedAssetAmounts.get(a.index);
        return {
          ...a,
          amount: holding ? holding.amount : 0,
          frozen: holding ? holding["is-frozen"] : false,
        };
      });
    }

    const matching = optedAssets
      .filter((a) => {
        const { name, "unit-name": unitName } = a.params;
        return (
          name?.toLocaleLowerCase()?.includes(search) ||
          unitName?.toLocaleLowerCase()?.includes(search)
        );
      })
      .map((a) => {
        const holding = optedAssetAmounts.get(a.index);
        return {
          ...a,
          amount: holding ? holding.amount : 0,
          frozen: holding ? holding["is-frozen"] : false,
        };
      });

    if (matching.length === 0)
      setSearchStatus(`No assets matching "${debouncedSearchTerm}"`);
    else setSearchStatus(`Showing ${matching.length} of ${optedAssets.length}`);

    return matching;
  }, [debouncedSearchTerm, optedAssets, optedAssetAmounts]);

  const table = useReactTable({
    data: filteredAssetHoldings,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.index),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div>
      <div className="flex items-center gap-3 mt-3 mb-2">
        <div className="relative w-[175px] sm:w-[250px] md:w-[350px]">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            onChange={handleChangeSearch}
            placeholder="Filter assets"
            className="pl-9"
          />
        </div>
        <div className="text-sm text-muted-foreground">{searchStatus}</div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
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
                      No assets
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <AssetCard key={row.id} row={row} />
              ))
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No assets
              </div>
            )}
          </div>

          {/* Pagination */}
          <TablePagination
            pageIndex={pageIndex}
            pageCount={pageCount}
            canPreviousPage={table.getCanPreviousPage()}
            canNextPage={table.getCanNextPage()}
            onFirst={() => table.setPageIndex(0)}
            onPrev={() => table.previousPage()}
            onNext={() => table.nextPage()}
            onLast={() => table.setPageIndex(pageCount - 1)}
          />
        </>
      )}
    </div>
  );
}

export default AccountAssets;
