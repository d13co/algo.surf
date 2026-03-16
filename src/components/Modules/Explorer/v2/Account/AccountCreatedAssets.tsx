import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import { A_AssetTiny } from "src/packages/core-sdk/types";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import LinkToAsset from "../Links/LinkToAsset";
import Copyable from "src/components/v2/Copyable";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import FilterInput from "src/components/v2/FilterInput";
import { DataTable } from "src/components/v2/DataTable";
import { useFilteredAssets } from "src/hooks/useFilteredAssets";

const columns: ColumnDef<A_AssetTiny, any>[] = [
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
    id: "unit",
    header: "Unit",
    cell: ({ row }) => (
      <span>{row.original.params["unit-name"] || ""}</span>
    ),
  },
];

const columnLabels: Record<string, string> = {
  index: "ID",
  name: "Name",
  unit: "Unit",
};

function AccountCreatedAssets(): JSX.Element {
  const { address } = useParams();
  const { data: accountInfo } = useAccount(address);

  const createdAssetIds = useMemo(
    () =>
      (accountInfo?.createdAssets ?? []).map((a) => Number(a.index)),
    [accountInfo?.createdAssets]
  );

  const { data: createdAssets, isLoading } = useTinyAssets(createdAssetIds);

  const { searchTerm, setSearchTerm, filtered, searchStatus } = useFilteredAssets(createdAssets);

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

export default AccountCreatedAssets;
