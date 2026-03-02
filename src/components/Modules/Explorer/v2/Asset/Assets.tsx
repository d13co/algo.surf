import { useMemo } from "react";
import { useAssets } from "src/hooks/useAssets";
import { A_Asset } from "src/packages/core-sdk/types";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import LinkToAsset from "../Links/LinkToAsset";
import LinkToAccount from "../Links/LinkToAccount";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { useStableHeight } from "src/hooks/useStableHeight";
import { DataTable } from "src/components/v2/DataTable";

const columns: ColumnDef<A_Asset, any>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <LinkToAsset id={row.original.index} name={row.original.params.name} />
    ),
  },
  {
    id: "index",
    header: "ID",
    cell: ({ row }) => <LinkToAsset id={row.original.index} />,
  },
  {
    id: "unit",
    header: "Unit",
    cell: ({ row }) => <span>{row.original.params["unit-name"]}</span>,
  },
  {
    id: "url",
    header: "Url",
    cell: ({ row }) => {
      const url = row.original.params.url;
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline truncate block"
        >
          {url}
        </a>
      ) : (
        <span className="text-muted-foreground">--None--</span>
      );
    },
  },
  {
    id: "creator",
    header: "Creator",
    cell: ({ row }) => (
      <LinkToAccount
        copy="left"
        copySize="s"
        address={row.original.params.creator}
        strip={30}
      />
    ),
  },
];

const columnLabels: Record<string, string> = {
  name: "Name",
  index: "ID",
  unit: "Unit",
  url: "Url",
  creator: "Creator",
};

function Assets(): JSX.Element {
  useTitle("Assets");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useAssets();

  const assets = useMemo(
    () => data?.pages.flatMap((p) => p.assets) ?? [],
    [data],
  );

  const initialLoading = !data;

  const table = useReactTable({
    data: assets,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.index),
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = hasNextPage ? pageSize - currentRowCount : 0;

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (newPage >= pageCount - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading assets...</span>
      </div>
    );
  }

  return (
    <div>
      <ListToolbar
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        loading={isFetchingNextPage}
      />

      <DataTable
        table={table}
        columns={columns}
        columnLabels={columnLabels}
        emptyLabel="No assets"
        padCount={padCount}
        isFetchingNextPage={isFetchingNextPage}
        tableRef={tableRef}
        tableStyle={stableStyle}
      />
    </div>
  );
}

export default Assets;
