import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useControllingAccounts } from "src/hooks/useAccount";
import { A_SearchAccount } from "src/packages/core-sdk/types";
import { microalgosToAlgos } from "src/utils/common";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import LinkToAccount from "../Links/LinkToAccount";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import NumberFormat from "react-number-format";
import { Loader2 } from "lucide-react";
import { useStableHeight } from "src/hooks/useStableHeight";
import TablePagination from "src/components/v2/TablePagination";
import { DataTable } from "src/components/v2/DataTable";

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

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <DataTable
        table={table}
        columns={columns}
        columnLabels={columnLabels}
        emptyLabel="No accounts"
        padCount={padCount}
        isFetchingNextPage={isFetchingNextPage}
        tableRef={tableRef}
        tableStyle={stableStyle}
      />

      <TablePagination
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        className="flex items-center justify-end gap-2 pt-4 pb-0 md:py-4"
      />
    </div>
  );
}

export default AccountControllerTo;
