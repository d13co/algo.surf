import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { CoreAccount } from "src/packages/core-sdk/classes/core/CoreAccount";
import { modelsv2 } from "algosdk";
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
import LinkToApplication from "../Links/LinkToApplication";
import LinkToAccount from "../Links/LinkToAccount";
import ApplicationLocalState from "../Application/ApplicationLocalState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";
import { Loader2 } from "lucide-react";
import TablePagination from "src/components/v2/TablePagination";

const columnLabels: Record<string, string> = {
  id: "Application ID",
  state: "",
};

function AppCard({
  row,
  address,
}: {
  row: Row<modelsv2.ApplicationLocalState>;
  address: string;
}) {
  const visibleCells = row.getVisibleCells();
  return (
    <div className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
      {visibleCells.map((cell) => (
        <div key={cell.id} className="flex justify-between gap-2 items-center">
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

function AccountOptedApplications(): JSX.Element {
  const { address, id } = useParams();
  const navigate = useNavigate();
  const { data: accountInfo, isLoading } = useAccount(address);

  const optedApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getOptedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [accountInfo]);

  const columns: ColumnDef<modelsv2.ApplicationLocalState, any>[] = useMemo(
    () => [
      {
        id: "id",
        header: "Application ID",
        cell: ({ row }) => (
          <LinkToApplication id={Number(row.original.id)} copy="left" />
        ),
      },
      {
        id: "state",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="muted"
              className="h-7 px-2.5 text-xs -my-1 border-primary text-primary hover:bg-primary hover:text-background"
              onClick={() =>
                navigate(
                  `/account/${address}/opted-applications/${Number(row.original.id)}`
                )
              }
            >
              View State
            </Button>
          </div>
        ),
      },
    ],
    [address, navigate]
  );

  const handleClose = () => {
    navigate(`/account/${address}/opted-applications`);
  };

  const localState = useMemo(() => {
    return accountInfo?.appsLocalState?.find(
      ({ id: i }) => Number(i) === Number(id)
    );
  }, [id, accountInfo]);

  const table = useReactTable({
    data: optedApplications,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.id),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <>
      <div>
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
                        No applications
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
                  <AppCard key={row.id} row={row} address={address} />
                ))
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No applications
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

      <Dialog open={!!id} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              App <LinkToApplication id={Number(id)} /> Local State
            </DialogTitle>
          </DialogHeader>
          <div>
            <div className="mb-3 text-sm">
              Account:{" "}
              <LinkToAccount
                address={address}
                copy="none"
                copySize="m"
              />
            </div>
            <ApplicationLocalState state={localState} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AccountOptedApplications;
