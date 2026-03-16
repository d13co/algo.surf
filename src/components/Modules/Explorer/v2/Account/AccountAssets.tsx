import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import { A_AssetHoldingTiny } from "src/packages/core-sdk/types";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import LinkToAsset from "../Links/LinkToAsset";
import Copyable from "src/components/v2/Copyable";
import NumberFormat from "react-number-format";
import { Loader2, ThermometerSnowflake } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import FilterInput from "src/components/v2/FilterInput";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import { DataTable } from "src/components/v2/DataTable";
import { useFilteredAssets } from "src/hooks/useFilteredAssets";

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

function AccountAssets(): JSX.Element {
  const { address } = useParams();
  const { data: accountInfo } = useAccount(address);

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

  const assetHoldings: A_AssetHoldingTiny[] = useMemo(() => {
    if (!optedAssets) return [];
    return optedAssets.map((a) => {
      const holding = optedAssetAmounts.get(a.index);
      return {
        ...a,
        amount: holding ? holding.amount : 0,
        frozen: holding ? holding["is-frozen"] : false,
      };
    });
  }, [optedAssets, optedAssetAmounts]);

  const { searchTerm, setSearchTerm, filtered, searchStatus } = useFilteredAssets(assetHoldings);

  const table = useReactTable({
    data: filtered,
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
      <ListToolbar
        className="mt-3"
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => table.setPageIndex(0)}
        onPrev={() => table.previousPage()}
        onNext={() => table.nextPage()}
        onLast={() => table.setPageIndex(pageCount - 1)}
        loading={isLoading}
      >
        <div className="flex items-center gap-3">
          <FilterInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Filter assets"
            className="w-[175px]"
          />
          <div className="text-sm text-muted-foreground whitespace-nowrap">{searchStatus}</div>
        </div>
      </ListToolbar>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          table={table}
          columns={columns}
          columnLabels={columnLabels}
          emptyLabel="No assets"
        />
      )}
    </div>
  );
}

export default AccountAssets;
