import { useMemo } from "react";
import { useApplications } from "src/hooks/useApplication";
import { A_Application } from "src/packages/core-sdk/types";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import LinkToApplication from "../Links/LinkToApplication";
import LinkToAccount from "../Links/LinkToAccount";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { useStableHeight } from "src/hooks/useStableHeight";
import { DataTable } from "src/components/v2/DataTable";

const columns: ColumnDef<A_Application, any>[] = [
  {
    id: "id",
    header: "Application ID",
    meta: { width: "20%" },
    cell: ({ row }) => (
      <LinkToApplication copy="left" id={row.original.id} />
    ),
  },
  {
    id: "escrow",
    header: "Application Escrow",
    cell: ({ row }) => {
      const addr = new CoreApplication(row.original).getApplicationAddress();
      return (
        <LinkToAccount
          copy="left"
          copySize="s"
          noEscrow
          address={addr}
          strip={30}
        />
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
  id: "Application ID",
  escrow: "Application Escrow",
  creator: "Creator",
};

function Applications(): JSX.Element {
  useTitle("Applications");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useApplications();

  const applications = useMemo(
    () => data?.pages.flatMap((p) => p.applications) ?? [],
    [data],
  );

  const initialLoading = !data;

  const table = useReactTable({
    data: applications,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.id),
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
        <span>Loading applications...</span>
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
        emptyLabel="No applications"
        padCount={padCount}
        isFetchingNextPage={isFetchingNextPage}
        tableRef={tableRef}
        tableStyle={stableStyle}
      />
    </div>
  );
}

export default Applications;
