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
import { useAccount, useControllingAccounts } from "src/hooks/useAccount";
import { cutNote, useAccountSummary } from "src/hooks/useAccountSummary";
import { RekeyPair, useRekeys } from "src/hooks/useRekeys";
import { useRound } from "src/hooks/useRound";
import { surfIdxOffMessage, useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { useStableHeight } from "src/hooks/useStableHeight";
import ListToolbar from "src/components/v2/ListToolbar";
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

const SIDE_LABELS: Record<Side, { title: string; help: string; other: string; empty: string }> = {
  to: {
    title: "Rekeyed to",
    help: "The authorizers this account was rekeyed to. Its own key counts its rekeys back and its close-outs while rekeyed.",
    other: "Authorizer",
    empty: "Never rekeyed",
  },
  from: {
    title: "Accounts rekeyed to this one",
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
          // Each links to the other account's own rekey history, an app escrow's too (not its app).
          <LinkToAccount copy="left" copySize="s" address={row.original.address} strip={20} subPage="rekeys" noEscrow />
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
                : "This account is rekeyed to this address now"
            }
          >
            <Chip variant="warning">Current</Chip>
          </span>
        ) : row.original.current === undefined ? (
          <span className="text-muted-foreground" title="The indexer only knows which accounts are rekeyed to it now">
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
  fetched,
  total,
  round,
}: {
  side: Side;
  address: string;
  rows: Row[];
  /** The rows surf idx returned, before a past round's filter: the list is cut at LIST_LIMIT of them. */
  fetched: number;
  /** The summary's count, for the note when the list is cut. */
  total: number | undefined;
  round: number | undefined;
}): JSX.Element {
  const columns = useMemo(() => columnsFor(side, address, round), [side, address, round]);
  const note = cutNote(fetched, total);
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
  const currentRowCount = table.getRowModel().rows.length;
  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);
  const { title, help, empty } = SIDE_LABELS[side];

  return (
    <div className="mt-5">
      <div className="text-base font-semibold" title={help}>
        {title} <span className="text-muted-foreground font-normal">({rows.length.toLocaleString()})</span>
      </div>
      {note ? <div className="mt-1 text-sm text-muted-foreground">{note}</div> : null}
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
        columnLabels={columnLabels(side)}
        emptyLabel={round === undefined ? empty : `None by block ${round}`}
        tableRef={tableRef}
        tableStyle={stableStyle}
      />
    </div>
  );
}

const EMPTY: Row[] = [];

/** At a past round, the pairs begun by then. */
const begun = (p: RekeyPair, round: number | undefined) => round === undefined || p.firstRound <= round;
/** At a past round, the pair's txns and last round include later rekeys. */
const later = (p: RekeyPair, round: number | undefined) => round !== undefined && p.lastRound > round;

/** Both sides of the account's rekey history, from surf idx. */
function RekeyHistory({ address }: { address: string }): JSX.Element {
  const caps = useSurfIdxCaps();
  const { round } = useRound();
  const { data: rekeys, isError, error } = useRekeys(address);
  // The account page's summary, for the totals when a list is cut.
  const { data: summary } = useAccountSummary(address);
  // The account page's own queries, no new requests: its authorizer at the page's round, and the
  // accounts rekeyed to it now (the indexer has no history), which the page pages to the end.
  const { data: accountInfo, isPlaceholderData } = useAccount(address, round);
  // Not while the previous round's record stands in for this one's.
  const authAddr = accountInfo && !isPlaceholderData ? accountInfo.authAddr?.toString() ?? address : undefined;
  const {
    data: controllerData,
    hasNextPage,
    isFetchingNextPage,
    isError: controllerError,
  } = useControllingAccounts(address, round === undefined);
  // Only the whole list says an account isn't rekeyed to this one: until the last page, unknown.
  const controllerComplete = !!controllerData && !hasNextPage && !isFetchingNextPage && !controllerError;
  const controlled = useMemo(
    () =>
      controllerComplete ? new Set(controllerData!.pages.flatMap((p) => p.accounts.map((a) => a.address))) : undefined,
    [controllerComplete, controllerData],
  );

  // One memo per side, on that side's inputs: controller pages arriving rebuild only `from`.
  const to = useMemo(
    (): Row[] =>
      rekeys
        ? rekeys.to.filter((p) => begun(p, round)).map((p) => ({
            ...p,
            // The authorizer is algod's: two rekeys in one round aren't ordered in surf idx.
            current: authAddr === undefined ? undefined : p.address === authAddr,
            later: later(p, round),
          }))
        : EMPTY,
    [rekeys, round, authAddr],
  );
  const from = useMemo(
    (): Row[] =>
      rekeys
        ? rekeys.from.filter((p) => begun(p, round)).map((p) => ({
            ...p,
            current: round === undefined && controlled ? controlled.has(p.address) : undefined,
            later: later(p, round),
          }))
        : EMPTY,
    [rekeys, round, controlled],
  );

  if (caps && !caps.rekeys) return <div className="mt-6 text-muted-foreground">{surfIdxOffMessage(caps, "rekeys")}</div>;
  if (isError) return <div className="mt-6 text-muted-foreground">{(error as Error).message}</div>;
  if (!rekeys) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const neither = !to.length && !from.length;
  return (
    <div>
      {neither ? (
        <div className="mt-6 text-muted-foreground">
          {round === undefined ? "No rekeys" : `No rekeys by block ${round}`}
        </div>
      ) : (
        <>
          {to.length ? <RekeyTable key={`to:${round}`} side="to" address={address} rows={to} fetched={rekeys.to.length} total={summary?.rekeysTo} round={round} /> : null}
          {from.length ? (
            <RekeyTable key={`from:${round}`} side="from" address={address} rows={from} fetched={rekeys.from.length} total={summary?.rekeysFrom} round={round} />
          ) : null}
        </>
      )}
    </div>
  );
}

/** Keyed: a row's link opens another account's tab on this same route, which starts fresh tables. */
function AccountRekeys(): JSX.Element {
  const { address } = useParams();
  return <RekeyHistory key={address} address={address!} />;
}

export default AccountRekeys;
