import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { History, Loader2, Search } from "lucide-react";
import { useGlobalUI } from "src/contexts/GlobalUIContext";
import coreSearch from "src/components/Modules/Explorer/Search/CoreSearch";
import { useNfdHistory, useNfdHistorySupport } from "src/hooks/useNfdHistory";
import { useRound, useRoundNavigate, withRound } from "src/hooks/useRound";
import { useStableHeight } from "src/hooks/useStableHeight";
import type { NfdHistoryStats, NfdPeriod, NfdPeriodEnd, NfdRole } from "src/utils/nfdHistory";
import ListToolbar from "src/components/v2/ListToolbar";
import { DataTable } from "src/components/v2/DataTable";
import { Chip } from "src/components/v2/Chips";
import LinkToApplication from "../Links/LinkToApplication";
import Link from "../Links/Link";
import { RoundCell } from "../Versions/VersionsList";
import WarningNotice from "../WarningNotice";

const roleLabels: Record<NfdRole, string> = {
  owner: "Owner",
  primary: "Verified address (primary)",
  linked: "Verified address",
};

const endLabels: Record<NfdPeriodEnd, string> = {
  removed: "Address removed",
  expired: "Expired",
  forSale: "Put up for sale",
  deleted: "Deleted",
  transferred: "Transferred",
  primaryChanged: "Primary changed",
};

type Row = NfdPeriod & { key: string };

/** Both stages merged, as the table shows them. */
type Shown = {
  periods: NfdPeriod[];
  latestRound: number;
  timestamps: Map<number, number>;
  notes: string[];
  stats: NfdHistoryStats;
  /** Stage 2's progress while it loads */
  checkingAssets?: string;
};

/** Searches for an NFD by name, as the search box does: to the account it resolves to now. */
function NfdSearchButton({ name }: { name: string }): JSX.Element {
  const navigate = useRoundNavigate();
  const { showLoader, hideLoader, showSnack } = useGlobalUI();
  const search = async () => {
    showLoader("Searching");
    try {
      navigate(await coreSearch(name));
    } catch (e) {
      showSnack({ severity: "error", message: (e as Error).message });
    } finally {
      hideLoader();
    }
  };
  return (
    <button
      type="button"
      onClick={search}
      title={`Search for ${name}`}
      aria-label={`Search for ${name}`}
      className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
    >
      <Search size={14} />
    </button>
  );
}

function columnsFor(address: string, history: Shown, round: number | undefined): ColumnDef<Row, any>[] {
  const ts = (r: number) => history.timestamps.get(r);
  const active = (p: Row) => round !== undefined && p.from <= round && (p.to === undefined || round < p.to);
  return [
    {
      id: "nfd",
      accessorFn: (r) => r.name,
      header: "NFD",
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="inline-flex items-center gap-2 min-w-0">
            <NfdSearchButton name={row.original.name} />
            <LinkToApplication id={row.original.appId} name={row.original.name} title={`NFD app ${row.original.appId}`} />
          </span>
          {active(row.original) ? (
            <Chip variant="success" className="whitespace-nowrap">
              at block {round}
            </Chip>
          ) : null}
        </span>
      ),
    },
    {
      id: "role",
      accessorFn: (r) => r.role,
      header: "Role",
      cell: ({ row }) => roleLabels[row.original.role],
    },
    {
      id: "from",
      accessorFn: (r) => r.from,
      header: "From",
      cell: ({ row }) => (
        <span className="inline-flex items-start gap-1.5">
          <RoundCell round={row.original.from} timestamp={ts(row.original.from)} />
          <Link
            href={withRound(`/account/${address}`, row.original.from)}
            keepRound={false}
            title="The account as it was at this block"
          >
            <History size={14} className="mt-1" />
          </Link>
        </span>
      ),
    },
    {
      id: "to",
      accessorFn: (r) => r.to ?? Number.MAX_SAFE_INTEGER,
      header: "Until",
      cell: ({ row }) =>
        row.original.to === undefined ? (
          <span className="text-muted-foreground">Now</span>
        ) : (
          <RoundCell round={row.original.to} timestamp={ts(row.original.to)} />
        ),
    },
    {
      id: "end",
      accessorFn: (r) => r.end ?? "",
      header: "Ended",
      cell: ({ row }) => (row.original.end ? endLabels[row.original.end] : null),
    },
  ];
}

const columnLabels = { nfd: "NFD", role: "Role", from: "From", to: "Until", end: "Ended" };

function NfdHistoryTable({ address, history }: { address: string; history: Shown }): JSX.Element {
  const { round } = useRound();
  // At a past round, the periods that held then come first; else the latest first (the table's sort).
  const rows = useMemo<Row[]>(() => {
    const list = history.periods.map((p) => ({ ...p, key: `${p.role}:${p.appId}:${p.from}` }));
    if (round === undefined) return list;
    const held = (p: Row) => (p.from <= round && (p.to === undefined || round < p.to) ? 1 : 0);
    return list.sort((a, b) => held(b) - held(a) || b.from - a.from);
  }, [history, round]);
  const columns = useMemo(() => columnsFor(address, history, round), [address, history, round]);
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.key,
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize: 10 }, sorting: round === undefined ? [{ id: "from", desc: true }] : [] },
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const { ref: tableRef, style: stableStyle } = useStableHeight(table.getRowModel().rows.length === pageSize);
  const { stats } = history;

  return (
    <div>
      {history.notes.map((note) => (
        <WarningNotice key={note} className="mt-3 mb-3">
          {note}
        </WarningNotice>
      ))}
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
        emptyLabel={
          history.checkingAssets
            ? "No NFD has listed or been owned by this account so far"
            : "No NFD has listed or been owned by this account"
        }
        tableRef={tableRef}
        tableStyle={stableStyle}
        cardsBelow="lg"
      />
      {history.checkingAssets ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {history.checkingAssets}…
        </div>
      ) : null}
      <div className="mt-3 text-xs text-muted-foreground">
        As of block {history.latestRound}. Checked {stats.ownerCandidates} NFD{stats.ownerCandidates === 1 ? "" : "s"}:
        verified addresses at {stats.linkRounds} block{stats.linkRounds === 1 ? "" : "s"}, ownership at{" "}
        {stats.recordPairs} NFD-blocks; {stats.requests} history requests, {(stats.ms / 1000).toFixed(1)} s.
      </div>
    </div>
  );
}

const sumStats = (a: NfdHistoryStats, b: NfdHistoryStats | undefined): NfdHistoryStats =>
  b
    ? {
        requests: a.requests + b.requests,
        linkCandidates: a.linkCandidates + b.linkCandidates,
        ownerCandidates: a.ownerCandidates + b.ownerCandidates,
        linkRounds: a.linkRounds + b.linkRounds,
        recordPairs: a.recordPairs + b.recordPairs,
        ms: a.ms + b.ms,
      }
    : a;

/** The NFDs that listed this account as a verified address, and those it owned, over time. */
function AccountNfdHistory(): JSX.Element {
  const { address } = useParams();
  const { round } = useRound();
  const supported = useNfdHistorySupport();
  const { links, assets, progress, assetProgress } = useNfdHistory(address, supported);
  const stage1 = links.data;
  const stage2 = assets.data;

  const shown = useMemo<Shown | undefined>(() => {
    if (!stage1) return undefined;
    const notes = [...stage1.notes, ...(stage2?.notes ?? [])];
    if (assets.isError) {
      notes.push(
        `Older NFDs could not be checked (${(assets.error as Error).message}): NFDs the account owned before owner boxes may be missing.`,
      );
    }
    return {
      periods: [...stage1.periods, ...(stage2?.periods ?? [])],
      latestRound: stage1.latestRound,
      timestamps: new Map([...stage1.timestamps, ...(stage2?.timestamps ?? [])]),
      notes,
      stats: sumStats(stage1.stats, stage2?.stats),
      checkingAssets: assets.isPending && !assets.isError ? assetProgress ?? "Checking older NFDs (asset holdings)" : undefined,
    };
  }, [stage1, stage2, assets.isError, assets.error, assets.isPending, assetProgress]);

  if (!supported) {
    return <div className="mt-6 text-muted-foreground">NFD history needs a time-travel node that runs read-only queries.</div>;
  }
  if (links.isError) return <div className="mt-6 text-muted-foreground">{(links.error as Error).message}</div>;
  if (!shown || !address) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        {progress ? <span>{progress}…</span> : null}
      </div>
    );
  }
  // Keyed by the round too: the table's initial sort depends on it.
  return <NfdHistoryTable key={`${address}:${round ?? ""}`} address={address} history={shown} />;
}

export default AccountNfdHistory;
