import { useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { KeyRound, Loader2 } from "lucide-react";
import { useAccount } from "src/hooks/useAccount";
import { cutNote, useAccountSummary } from "src/hooks/useAccountSummary";
import { RekeyPair, useAuthAddrsOf, useRekeys } from "src/hooks/useRekeys";
import { useRound } from "src/hooks/useRound";
import { surfIdxOffMessage, useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { useStableHeight } from "src/hooks/useStableHeight";
import TablePagination from "src/components/v2/TablePagination";
import { getAbelAt } from "src/packages/abel/abelAt";
import { DataTable } from "src/components/v2/DataTable";
import { Chip } from "src/components/v2/Chips";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToRekey from "../Links/LinkToRekey";

/** "to": the authorizers this account was rekeyed to. "from": the accounts rekeyed to it. */
type Side = "to" | "from";

type Row = RekeyPair & {
  /** The pair holds now (or at the page's round); undefined when that isn't known. */
  current: boolean | undefined;
  /** At a past round: the pair's txns and last round include rekeys after it (no per-txn history). */
  later: boolean;
};

const SIDE_LABELS: Record<Side, { title?: string; help: string; other: string; empty: string }> = {
  to: {
    title: "Summary of past authorizers",
    help: "The authorizers this account was rekeyed to. Its own key counts its rekeys back and its close-outs while rekeyed.",
    other: "Authorizer",
    empty: "Never rekeyed",
  },
  from: {
    help: "The accounts that were rekeyed to this address, which could then authorize their txns.",
    other: "Account",
    empty: "No account was rekeyed to it",
  },
};

const NOW_TITLE = "As of now: these pairs have no per-txn history, so this counts rekeys after this block too";

function columnsFor(side: Side, address: string, round: number | undefined): ColumnDef<Row, any>[] {
  // LinkToRekey wants the rekeyed account and its authorizer, whichever side this is.
  const pair = (r: Row) => (side === "to" ? { acct: address, auth: r.address } : { acct: r.address, auth: address });
  return [
    {
      id: "account",
      accessorFn: (r) => r.address,
      header: SIDE_LABELS[side].other,
      cell: ({ row }) =>
        row.original.address === address ? (
          <span
            className="inline-flex items-center gap-1.5"
            title="Its own key: rekeys back to the account itself, and close-outs while rekeyed, which clear the authorizer"
          >
            <KeyRound size={16} className="shrink-0" /> Own key
          </span>
        ) : (
          // Each links to the other account's side of the same history, an app escrow's too (not its app):
          // an authorizer's accounts rekeyed to it, a rekeyed account's authorizers.
          <LinkToAccount
            copy="left"
            copySize="s"
            address={row.original.address}
            strip={20}
            subPage={side === "to" ? "controller/history" : "rekeys"}
            noEscrow
          />
        ),
    },
    {
      id: "status",
      // Current, then past, then unknown when descending.
      accessorFn: (r) => (r.current === undefined ? 0 : r.current ? 2 : 1),
      header: "Status",
      cell: ({ row }) =>
        row.original.current ? (
          <span
            title={
              side === "to"
                ? `The account's authorizer${round === undefined ? "" : ` at block ${round}`}`
                : `This account is rekeyed to this address${round === undefined ? " now" : ` at block ${round}`}`
            }
          >
            <Chip variant="warning">Current</Chip>
          </span>
        ) : row.original.current === undefined ? (
          <span
            className="text-muted-foreground"
            title={
              side === "from" && round !== undefined && !getAbelAt()
                ? "Authorizers at a past round need a time-travel node"
                : "Not known yet"
            }
          >
            &mdash;
          </span>
        ) : (
          <span className="text-muted-foreground">Past</span>
        ),
    },
    {
      id: "txns",
      accessorFn: (r) => r.txns,
      header: "Txns",
      cell: ({ row }) => (
        <span title={row.original.later ? NOW_TITLE : "The txns that set this authorization, inner txns included"}>
          {row.original.txns.toLocaleString()}
          {row.original.later ? <span className="text-muted-foreground"> (now)</span> : null}
        </span>
      ),
    },
    {
      id: "first",
      accessorFn: (r) => r.firstRound,
      header: "First",
      cell: ({ row }) => <LinkToRekey {...pair(row.original)} round={row.original.firstRound} />,
    },
    {
      id: "last",
      accessorFn: (r) => r.lastRound,
      header: "Last",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5">
          <LinkToRekey {...pair(row.original)} round={row.original.lastRound} last />
          {row.original.later ? (
            <span className="text-muted-foreground" title={NOW_TITLE}>
              (now)
            </span>
          ) : null}
        </span>
      ),
    },
  ];
}

const columnLabels = (side: Side): Record<string, string> => ({
  account: SIDE_LABELS[side].other,
  status: "Status",
  txns: "Txns",
  first: "First",
  last: "Last",
});

/** One side of the history, with its own pager. */
function RekeyTable({
  side,
  address,
  rows,
  loaded,
  total,
  limit,
  round,
}: {
  side: Side;
  address: string;
  rows: Row[];
  /** The entries surf idx returned, before a past round's filter. */
  loaded: number;
  /** The summary's count of the whole list. */
  total: number | undefined;
  /** surf idx's RESULTS_LIMIT, which cuts the list. */
  limit: number;
  round: number | undefined;
}): JSX.Element {
  const columns = useMemo(() => columnsFor(side, address, round), [side, address, round]);
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.address,
    // Rows are rebuilt as the statuses load: keep the page. A new round remounts the table (keyed).
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize: 10 }, sorting: [{ id: "last", desc: true }] },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);
  const { title, help, empty } = SIDE_LABELS[side];

  // One line, never wrapped: the note gives way (truncated) to the pager.
  const cut = cutNote(loaded, total, limit);
  const note = title ? (
    <>
      {title} {cut ? <>&middot; {cut}</> : `(${rows.length.toLocaleString()})`}
    </>
  ) : (
    cut
  );

  return (
    <div>
      {/* As the other tabs' toolbars: flush left, on the pager's row. */}
      <div className="mt-3 mb-3 flex min-h-8 flex-nowrap items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm text-muted-foreground" title={help}>
          {note}
        </div>
        <TablePagination
          className="ml-auto flex shrink-0 items-center justify-end gap-2"
          compact
          pageIndex={pageIndex}
          pageCount={pageCount}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          onFirst={() => table.setPageIndex(0)}
          onPrev={() => table.previousPage()}
          onNext={() => table.nextPage()}
          onLast={() => table.setPageIndex(pageCount - 1)}
        />
      </div>
      <DataTable
        table={table}
        columns={columns}
        columnLabels={columnLabels(side)}
        emptyLabel={round === undefined ? empty : `None by block ${round}`}
        tableRef={tableRef}
        tableStyle={stableStyle}
      />
    </div>
  );
}

const EMPTY: Row[] = [];
const NO_ACCOUNTS: string[] = [];

/** At a past round, the pairs begun by then. */
const begun = (p: RekeyPair, round: number | undefined) => round === undefined || p.firstRound <= round;
/** At a past round, the pair's txns and last round include later rekeys. */
const later = (p: RekeyPair, round: number | undefined) => round !== undefined && p.lastRound > round;

/** One side of the account's rekey history, from surf idx. */
function RekeyHistory({ address, side }: { address: string; side: Side }): JSX.Element {
  const caps = useSurfIdxCaps();
  const { round } = useRound();
  // Both sides in one request, shared by the two tabs.
  const { data, isError, error } = useRekeys(address);
  const list = data?.[side];
  // The account page's summary, for the whole list's count.
  const { data: summary } = useAccountSummary(address);
  // "to": the account's authorizer at the page's round, from the account page's own query.
  const { data: accountInfo, isPlaceholderData } = useAccount(address, round);
  // Not while the previous round's record stands in for this one's.
  const authAddr = accountInfo && !isPlaceholderData ? accountInfo.authAddr?.toString() ?? address : undefined;
  // "from": the authorizer of each account at the page's round, from abel in bulk.
  const accounts = useMemo(() => (side === "from" && list ? list.map((e) => e.address) : NO_ACCOUNTS), [side, list]);
  const auths = useAuthAddrsOf(accounts, round);

  const rows = useMemo(
    (): Row[] =>
      list
        ? list.filter((p) => begun(p, round)).map((p) => ({
            ...p,
            current:
              side === "to"
                ? // The authorizer is algod's: two rekeys in one round aren't ordered in surf idx.
                  authAddr === undefined ? undefined : p.address === authAddr
                : auths.has(p.address) ? auths.get(p.address) === address : undefined,
            later: later(p, round),
          }))
        : EMPTY,
    [list, side, round, authAddr, auths, address],
  );

  if (caps && !caps.rekeys) return <div className="mt-6 text-muted-foreground">{surfIdxOffMessage(caps, "rekeys")}</div>;
  if (isError) return <div className="mt-6 text-muted-foreground">{(error as Error).message}</div>;
  if (!list || !caps) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="mt-6 text-muted-foreground">
        {round === undefined ? SIDE_LABELS[side].empty : `${SIDE_LABELS[side].empty} by block ${round}`}
      </div>
    );
  }
  return (
    <RekeyTable
      key={`${side}:${round}`}
      side={side}
      address={address}
      rows={rows}
      loaded={list.length}
      total={side === "to" ? summary?.rekeysTo : summary?.rekeysFrom}
      limit={caps.resultsLimit}
      round={round}
    />
  );
}

/**
 * "to" (the Rekey history tab): the authorizers this account was rekeyed to. "from" (Controlling
 * accounts' History): the accounts rekeyed to it. Keyed: a row's link opens another account's tab,
 * which starts fresh tables.
 */
function AccountRekeys({ side = "to" }: { side?: Side }): JSX.Element {
  const { address } = useParams();
  return <RekeyHistory key={address} address={address!} side={side} />;
}

export default AccountRekeys;
