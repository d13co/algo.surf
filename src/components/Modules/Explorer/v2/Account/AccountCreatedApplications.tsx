import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { CoreAccount } from "src/packages/core-sdk/classes/core/CoreAccount";
import { indexerModels, modelsv2 } from "algosdk";
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
import LinkToApplication from "../Links/LinkToApplication";
import { Loader2 } from "lucide-react";
import TablePagination from "src/components/v2/TablePagination";
import { useApplication } from "src/hooks/useApplication";
import { useBlock } from "src/hooks/useBlock";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { AgeHeader } from "../Lists/TransactionsList/cells/AgeCell";

function findTxnByAppId(
  block: indexerModels.Block,
  appId: number,
): indexerModels.Transaction | undefined {
  const target = BigInt(appId);

  function matches(txn: indexerModels.Transaction): boolean {
    return (
      txn.applicationTransaction?.applicationId === target ||
      txn.createdApplicationIndex === target
    );
  }

  function search(txns: indexerModels.Transaction[] | undefined): indexerModels.Transaction | undefined {
    if (!txns) return undefined;
    for (const txn of txns) {
      if (matches(txn)) return txn;
      const inner = search(txn.innerTxns);
      if (inner) return inner;
    }
    return undefined;
  }

  return search(block.transactions);
}

function NameCell({ appId }: { appId: number }) {
  const { data: appInfo } = useApplication(appId);
  const createdAtRound = appInfo?.createdAtRound != null ? Number(appInfo.createdAtRound) : undefined;
  const { data: blockInfo } = useBlock(createdAtRound ?? 0);
  
  const appName = useMemo(() => {
    if (!appInfo) return null;
    const creationTxn = findTxnByAppId(blockInfo, appId);
    if (!creationTxn) return null;
    const { note } = creationTxn;
    if (!note) return null;
    const noteStr = new TextDecoder().decode(note);
    const prefix = 'ALGOKIT_DEPLOYER:j'
    if (noteStr.startsWith(prefix)) {
      try {
        const parsed = JSON.parse(noteStr.slice(prefix.length));
        return parsed.name;
      } catch(e) {
        return null;
      }
    }
    
  }, [appId, blockInfo])

  return appName ? <span>{appName}</span> : <span className="text-muted">&mdash;</span>;
}

function CreatedAtCell({ appId }: { appId: number }) {
  const { data: appInfo } = useApplication(appId);
  const createdAtRound = appInfo?.createdAtRound != null ? Number(appInfo.createdAtRound) : undefined;
  const { data: blockInfo } = useBlock(createdAtRound ?? 0);
  const timestamp = blockInfo ? new CoreBlock(blockInfo).getTimestamp() : undefined;
  
  if (!timestamp || !createdAtRound) return <span className="text-muted">&mdash;</span>;

  return <MultiDateViewer timestamp={timestamp} block={createdAtRound} variant="short" />;
}

const columns: ColumnDef<modelsv2.Application, any>[] = [
  {
    id: "id",
    header: "Application ID",
    cell: ({ row }) => (
      <LinkToApplication id={Number(row.original.id)} copy="left" />
    ),
  },
  {
    id: "created",
    header: AgeHeader,
    cell: ({ row }) => <CreatedAtCell appId={Number(row.original.id)} />,
  },
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => <NameCell appId={Number(row.original.id)} />,
  },
  {
    id: "version",
    header: "Version",
    cell: ({ row }) => row.original.params.version ?? 1,
  },
];

const columnLabels: Record<string, string> = {
  id: "Application ID",
  created: "Created",
  name: "Name",
  version: "Version",
};

function AppCard({ row }: { row: Row<modelsv2.Application> }) {
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

function AccountCreatedApplications(): JSX.Element {
  const { address } = useParams();
  const { data: accountInfo, isLoading } = useAccount(address);

  const createdApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getCreatedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [accountInfo]);

  const table = useReactTable({
    data: createdApplications,
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
                <AppCard key={row.id} row={row} />
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
  );
}

export default AccountCreatedApplications;
