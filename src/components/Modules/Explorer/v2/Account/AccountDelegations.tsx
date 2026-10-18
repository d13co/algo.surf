import { useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { useAccount } from "src/hooks/useAccount";
import { DelegationRole, LsigUse, delegationLive, delegationRole, useDelegations } from "src/hooks/useLsig";
import { surfIdxOffMessage, useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { useStableHeight } from "src/hooks/useStableHeight";
import ListToolbar from "src/components/v2/ListToolbar";
import { DataTable } from "src/components/v2/DataTable";
import { Chip } from "src/components/v2/Chips";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/v2/ui/tooltip";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToLsigUse from "../Links/LinkToLsigUse";
import LinkToLsigTemplate from "../Links/LinkToLsigTemplate";
import WarningNotice from "../WarningNotice";

type Row = LsigUse & { role: DelegationRole; live: boolean | undefined };

const ROLE_LABELS: Record<DelegationRole, string> = {
  delegated: "Signed by this account",
  "delegated-for": "Signed for",
  "rekeyed-to-escrow": "Rekeyed to escrow",
  "rekeyed-to-delegator": "Rekeyed to delegator",
};

const ROLE_HELP: Record<DelegationRole, string> = {
  delegated: "This account's key signed the logic sig, which then authorized this account's txns.",
  "delegated-for": "This account's key signed the logic sig, which then authorized txns of an account rekeyed to it.",
  "rekeyed-to-escrow": "This account was rekeyed to the logic sig's own address, which then authorized its txns.",
  "rekeyed-to-delegator": "This account was rekeyed to an account that signed the logic sig, which then authorized its txns.",
};

function Status({ live }: { live: boolean | undefined }): JSX.Element {
  if (live === undefined) return <span className="text-muted-foreground">&mdash;</span>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            {live ? <Chip variant="warning">Live</Chip> : <Chip variant="success">Inactive</Chip>}
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border max-w-xs">
          <p>
            {live
              ? "The account is still authorized by this logic sig's signer (or its escrow address), so the logic sig can send any txn its program approves."
              : "The account is now authorized by another key, so this logic sig can't authorize its txns while that lasts."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const columns: ColumnDef<Row, any>[] = [
  {
    id: "lsig",
    accessorFn: (r) => r.lsig,
    header: "Logic sig",
    cell: ({ row }) => <LinkToAccount copy="left" copySize="s" address={row.original.lsig} strip={20} />,
  },
  {
    id: "template",
    accessorFn: (r) => r.template,
    header: "Template",
    cell: ({ row }) => <LinkToLsigTemplate template={row.original.template} />,
  },
  {
    id: "role",
    accessorFn: (r) => ROLE_LABELS[r.role],
    header: "Role",
    cell: ({ row }) => {
      const { role, sender, signer } = row.original;
      const other = role === "delegated-for" ? sender : role === "rekeyed-to-delegator" ? signer : null;
      return (
        <span className="inline-flex items-center gap-1.5 min-w-0" title={ROLE_HELP[role]}>
          {ROLE_LABELS[role]}
          {other ? <LinkToAccount address={other} strip={10} copy="none" /> : null}
        </span>
      );
    },
  },
  {
    id: "status",
    // Live, then inactive, then unknown (no account info) when descending.
    accessorFn: (r) => (r.live === undefined ? 0 : r.live ? 2 : 1),
    header: "Status",
    cell: ({ row }) => <Status live={row.original.live} />,
  },
  {
    id: "txns",
    accessorFn: (r) => r.txns,
    header: "Txns",
    cell: ({ row }) => <span>{row.original.txns.toLocaleString()}</span>,
  },
  {
    id: "first",
    accessorFn: (r) => r.firstRound,
    header: "First used",
    cell: ({ row }) => <LinkToLsigUse use={row.original} />,
  },
  {
    id: "last",
    accessorFn: (r) => r.lastRound,
    header: "Last used",
    cell: ({ row }) => <LinkToLsigUse use={row.original} last />,
  },
];

const columnLabels: Record<string, string> = {
  lsig: "Logic sig",
  template: "Template",
  role: "Role",
  status: "Status",
  txns: "Txns",
  first: "First used",
  last: "Last used",
};

/** Logic sigs this account delegated, or that moved it while rekeyed, from surf idx. */
function AccountDelegations(): JSX.Element {
  const { address } = useParams();
  const caps = useSurfIdxCaps();
  const { data: uses, isError, error } = useDelegations(address);
  const { data: accountInfo } = useAccount(address!);
  const hasAccount = !!accountInfo;
  const authAddr = accountInfo?.authAddr?.toString();

  // Not on accountInfo itself: a refetch (e.g. on window focus) is a new object, and new rows
  // would send the table back to its first page.
  const rows = useMemo<Row[]>(
    () =>
      (uses ?? []).map((u) => ({
        ...u,
        role: delegationRole(u, address!),
        live: hasAccount ? delegationLive(u, address!, authAddr) : undefined,
      })),
    [uses, address, hasAccount, authAddr],
  );
  // Delegations the account's own key signed that can still move it: the risky ones.
  const liveDelegations = rows.filter((r) => r.live && r.role === "delegated").length;

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Click a header to sort by it; starts most recently used first.
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => `${row.lsig}:${row.signer}:${row.sender}`,
    initialState: { pagination: { pageSize: 10 }, sorting: [{ id: "last", desc: true }] },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const currentRowCount = table.getRowModel().rows.length;
  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  if (caps && !caps.lsigs) return <div className="mt-6 text-muted-foreground">{surfIdxOffMessage(caps)}</div>;
  if (isError) return <div className="mt-6 text-muted-foreground">{(error as Error).message}</div>;
  if (!uses) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {liveDelegations ? (
        // mb-3: the toolbar below is an empty spacer when the list fits one page.
        <WarningNotice className="mt-3 mb-3">
          {liveDelegations === 1 ? "1 logic sig" : `${liveDelegations} logic sigs`} signed by this account can still send
          its txns: anyone with a copy can use one whenever its program approves. Rekeying the account to another key
          disables them while it stays rekeyed.
        </WarningNotice>
      ) : null}
      <ListToolbar
        className="mt-3"
        pageIndex={pageIndex}
        pageCount={table.getPageCount()}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => table.setPageIndex(0)}
        onPrev={() => table.previousPage()}
        onNext={() => table.nextPage()}
        onLast={() => table.setPageIndex(table.getPageCount() - 1)}
      />
      <DataTable
        table={table}
        columns={columns}
        columnLabels={columnLabels}
        emptyLabel="No delegations"
        tableRef={tableRef}
        tableStyle={stableStyle}
      />
    </div>
  );
}

export default AccountDelegations;
