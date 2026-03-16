import { useCallback, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { CoreAccount } from "src/packages/core-sdk/classes/core/CoreAccount";
import { indexerModels, modelsv2 } from "algosdk";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import LinkToApplication from "../Links/LinkToApplication";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import FilterInput from "src/components/v2/FilterInput";
import { useApplication } from "src/hooks/useApplication";
import { useBlock } from "src/hooks/useBlock";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { AgeHeader } from "../Lists/TransactionsList/cells/AgeCell";
import { DataTable } from "src/components/v2/DataTable";
import { useFilteredApplications } from "src/hooks/useFilteredApplications";

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

function resolveAppName(block: indexerModels.Block, appId: number): string | null {
  const creationTxn = findTxnByAppId(block, appId);
  if (!creationTxn) return null;
  const { note } = creationTxn;
  if (!note) return null;
  const noteStr = new TextDecoder().decode(note);
  const prefix = 'ALGOKIT_DEPLOYER:j';
  if (noteStr.startsWith(prefix)) {
    try {
      const parsed = JSON.parse(noteStr.slice(prefix.length));
      return parsed.name;
    } catch {
      return null;
    }
  }
  return null;
}

function NameCell({ appId, onNameResolved }: { appId: number; onNameResolved?: (id: number, name: string) => void }) {
  const { data: appInfo } = useApplication(appId);
  const createdAtRound = appInfo?.createdAtRound != null ? Number(appInfo.createdAtRound) : undefined;
  const { data: blockInfo } = useBlock(createdAtRound ?? 0);

  const appName = useMemo(() => {
    if (!appInfo || !blockInfo) return null;
    return resolveAppName(blockInfo, appId);
  }, [appId, appInfo, blockInfo]);

  const reportedRef = useRef(false);
  if (appName && onNameResolved && !reportedRef.current) {
    reportedRef.current = true;
    onNameResolved(appId, appName);
  }

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

const columnLabels: Record<string, string> = {
  id: "Application ID",
  created: "Created",
  name: "Name",
  version: "Version",
};

function AccountCreatedApplications(): JSX.Element {
  const { address } = useParams();
  const { data: accountInfo, isLoading } = useAccount(address);

  const [resolvedNames, setResolvedNames] = useState<Map<number, string>>(() => new Map());

  const onNameResolved = useCallback((id: number, name: string) => {
    setResolvedNames((prev) => {
      if (prev.get(id) === name) return prev;
      const next = new Map(prev);
      next.set(id, name);
      return next;
    });
  }, []);

  const columns: ColumnDef<modelsv2.Application, any>[] = useMemo(() => [
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
      cell: ({ row }) => <NameCell appId={Number(row.original.id)} onNameResolved={onNameResolved} />,
    },
    {
      id: "version",
      header: "Version",
      cell: ({ row }) => row.original.params.version ?? 1,
    },
  ], [onNameResolved]);

  const createdApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getCreatedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [accountInfo]);

  const { searchTerm, setSearchTerm, filtered, searchStatus } = useFilteredApplications(createdApplications, resolvedNames);

  const table = useReactTable({
    data: filtered,
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
            placeholder="Filter applications"
            className="w-[195px]"
          />
          <div className="text-sm text-muted-foreground whitespace-nowrap">{isLoading ? "Loading" : searchStatus}</div>
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
          emptyLabel="No applications"
        />
      )}
    </div>
  );
}

export default AccountCreatedApplications;
