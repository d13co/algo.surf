import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import {
  ArrowDownWideNarrow,
  ArrowLeftRight,
  ArrowUpNarrowWide,
  EllipsisVertical,
  History,
  Loader2,
  Maximize2,
} from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";
import { DataTable } from "src/components/v2/DataTable";
import ListToolbar from "src/components/v2/ListToolbar";
import Copyable from "src/components/v2/Copyable";
import MultiDateViewer, { formatDate } from "src/components/v2/MultiDateViewer";
import { DateFormat, useDateFormat } from "src/contexts/DateFormatContext";
import { cn } from "src/lib/utils";
import { useStableHeight } from "src/hooks/useStableHeight";
import { readsWholeVersions, useVersionRows, useVersionsAt } from "src/hooks/useTimeTravel";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useVersionFilterHref, useVersionRange } from "src/hooks/useVersionFilter";
import { getSearchDelayMs, VERSIONS_PAGE_SIZE, VersionsOrder } from "src/utils/timeTravel";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import {
  BaselineContext,
  FieldPath,
  Gaps,
  ObjectSummary,
  summarizeObject,
  summarizeOthers,
  Touch,
  VersionRow,
} from "src/utils/versionDelta";
import { VersionFilter, versionMatches } from "src/utils/versionFilter";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";
import { AgeHeader, ageLabel, shownFormat } from "../Lists/TransactionsList/cells/AgeCell";
import {
  ActiveFilter,
  ChangedKeys,
  DeltaCell,
  FieldHref,
  ObjectLabel,
  StateHref,
  TxnsLink,
  versionTxnsLink,
} from "./VersionChanges";
import VersionDetailsDialog from "./VersionDetailsDialog";
import {
  actionButtonClass,
  menuContentClass,
  menuItemClass,
  toolbarButtonClass,
  VersionOption,
  VersionOptionsMenu,
  VersionRangeChip,
  VersionRangeMenu,
} from "./VersionsToolbar";

export type SummarizedRow<V> = VersionRow<V> & { summaries: ObjectSummary[] };

type Row<V> = SummarizedRow<V> & { index: number };

/** Versions a filtered list reads on its own before waiting to be asked for more. */
const SCAN_STEP = 500;

/** How long a click on a delta waits for a second one (a double click selects a word) before opening it. */
const DOUBLE_CLICK_MS = 250;

/** A text button in the status row under the toolbar. */
const statusButtonClass = cn(actionButtonClass, "h-7");

/** The round column's header: the round, over its time in the chosen date format. */
const roundLabel = (format: DateFormat) => `Block / ${ageLabel(format)}`;

/**
 * A version's round, a link to its block, over its time in the chosen date
 * format (see AgeHeader); each copyable. Just the round where the time is unknown.
 */
export function RoundCell({ round, timestamp }: { round: number; timestamp: number | undefined }) {
  const { format: chosen } = useDateFormat();
  const format = shownFormat(chosen, true);
  // "3 days ago" is no use pasted elsewhere: copy the date.
  const copyValue = timestamp === undefined ? "" : formatDate(timestamp, format === "relative" ? "local" : format);
  return (
    <div className="flex flex-col">
      <span className="group inline-flex items-center gap-0.5">
        <Copyable className="opacity-60 group-hover:opacity-100" value={round} />
        <LinkToBlock id={round} />
      </span>
      {timestamp === undefined ? null : (
        <span className="group inline-flex items-center gap-0.5 text-muted-foreground">
          <Copyable className="opacity-60 group-hover:opacity-100" value={copyValue} />
          <MultiDateViewer timestamp={timestamp} variant="short" noBlock />
        </span>
      )}
    </div>
  );
}

/** Toggles a version list between newest first and oldest first. */
export function OrderButton({ order, onChange }: { order: VersionsOrder; onChange: (order: VersionsOrder) => void }) {
  const desc = order === "desc";
  const Icon = desc ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  return (
    <Button
      variant="outline"
      size="sm"
      className={toolbarButtonClass()}
      onClick={() => onChange(desc ? "asc" : "desc")}
      title={desc ? "Showing newest first. Click to show oldest first" : "Showing oldest first. Click to show newest first"}
    >
      <Icon />
      <span className="max-sm:sr-only">{desc ? "Newest first" : "Oldest first"}</span>
    </Button>
  );
}

/** A list pinned to a round (see useVersionPin): which part of the history it holds, and a way to list it all. */
function PinnedNotice({ round, order, onUnpin }: { round: number; order: VersionsOrder; onUnpin: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className="whitespace-nowrap">
        Block <LinkToBlock id={round} /> and {order === "desc" ? "older" : "newer"}
      </span>
      <Button variant="outline" size="sm" className={statusButtonClass} onClick={onUnpin} title="List every version">
        Show all
      </Button>
    </span>
  );
}

type VersionsListProps<V> = {
  ctx: BaselineContext;
  /** Loaded versions, in `order`. */
  versions: V[];
  /** The objects a version changed; stable. */
  touchesOf: (v: V) => Touch[];
  order: VersionsOrder;
  onOrderChange: (order: VersionsOrder) => void;
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  fetchMore: () => void;
  isFetchingMore: boolean;
  fetchMoreFailed: boolean;
  /** Names each touched object; null where there is only ever one. */
  label: ObjectLabel;
  /** The page showing the state at `round` (see useRound), or the part of it showing `ref`. */
  stateHref: StateHref;
  /** The transactions in `round` that changed `ref`, or the record. */
  txnsLink: TxnsLink;
  filenamePrefix: string;
  emptyLabel: string;
  /** The page's switches, in the Options menu (VersionsList adds its own). */
  options?: VersionOption[];
  /**
   * From the URL (useVersionFilter). `touchesOf` gives only its object's
   * touches, so a version needs at most one previous state read.
   */
  filter?: VersionFilter;
  /** Filtered, the reader told the list to keep searching (see useSearchBatchSize). */
  onKeepSearching?: () => void;
  /**
   * The node filtered `versions` to the filter's state key (filterStateKey),
   * so there are gaps between them: each is diffed against the state just
   * before its round (see buildRows), read for the rows up to the next page.
   */
  gapped?: boolean;
  /** The first round `versions` can be of (a date range's), if not the first ever. */
  minRound?: number;
  /** The round the list is pinned to (see useVersionPin), and how to list them all. */
  pin?: { round: number; onUnpin: () => void };
};

/** Which of the toolbar's menus is open. */
type ToolbarMenu = "dates" | "options" | null;

/**
 * A version history, in `order`: what changed at each round, as chips and as
 * a JSON delta, with the whole version a click away. Paging to the last
 * loaded page fetches the next batch. With a `filter`, only the versions that
 * changed what it names, and only those changes; the chips and delta keys
 * link to the list filtered to them.
 */
export default function VersionsList<V extends { round: number; timestamp: number }>({
  listKey,
  ...props
}: VersionsListProps<V> & {
  /**
   * Remounts the list, its pages and scans, where it changes (a new
   * range, order, filter or page option).
   */
  listKey: string;
}) {
  // Out here, the open menu stays open when the list under it remounts:
  // toggling an option that is part of the key, say.
  const [menu, setMenu] = useState<ToolbarMenu>(null);
  return <VersionsListBody key={listKey} {...props} menu={menu} onMenuChange={setMenu} />;
}

function VersionsListBody<V extends { round: number; timestamp: number }>({
  ctx,
  versions,
  touchesOf,
  order,
  onOrderChange,
  isLoading,
  error,
  hasMore,
  fetchMore,
  isFetchingMore,
  fetchMoreFailed,
  label,
  stateHref,
  txnsLink,
  filenamePrefix,
  emptyLabel,
  options,
  filter,
  onKeepSearching,
  gapped = false,
  minRound,
  pin,
  menu,
  onMenuChange,
}: VersionsListProps<V> & { menu: ToolbarMenu; onMenuChange: (menu: ToolbarMenu) => void }) {
  // The version open in the dialog is in the route (`versions/<round>`), so
  // it can be linked to and survives a reload; the query stays as it is.
  const { "*": openSplat } = useParams();
  const openRound = openSplat && /^\d+$/.test(openSplat) ? Number(openSplat) : null;
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const detailsHref = useCallback(
    (round: number | null) => `${pathname.replace(/\/versions(\/.*)?$/, "/versions")}${round === null ? "" : `/${round}`}${search}`,
    [pathname, search],
  );
  const openVersion = openRound === null ? -1 : versions.findIndex((v) => v.round === openRound);
  const { format } = useDateFormat();
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: VERSIONS_PAGE_SIZE });

  // Filtered, a batch can hold few matches or none: fetch on while the page
  // is short, up to SCAN_STEP versions past where the reader last asked for
  // more - or, searching on, until told to stop.
  const [scanUntil, setScanUntil] = useState(() => versions.length + SCAN_STEP);
  // Searching on, the number of matches then: one more stops the search.
  const [searchFrom, setSearchFrom] = useState<number | null>(null);
  const searching = searchFrom !== null;
  const scanPaused = !!filter && !searching && versions.length >= scanUntil;

  // Newest first, previous states are read for the rows on the current page
  // and the one open in the dialog - but not while the next batch is on its
  // way (see the effect below), since it supplies most of them. Filtered, the
  // one there can be (of the oldest loaded version) holds back only the rows
  // after it, so it is read only once no more batches are coming. Oldest
  // first (from minRound), no batch supplies any, so none waits.
  const batchesSupply = order === "desc";
  const loadedPages = Math.max(1, Math.ceil(versions.length / pagination.pageSize));
  const batchComing =
    hasMore && !fetchMoreFailed && (isFetchingMore || pagination.pageIndex >= loadedPages - 1);
  const moreComing = hasMore && !fetchMoreFailed && !scanPaused;

  // Filtered, what else each version did, for the rows on the page: filtered
  // to an object, the list holds only its part, so the rest is read whole.
  const [showOthersChecked, setShowOthers] = usePersistenBooleanState("versions-show-other-changes", true);
  const showOthers = !!filter && showOthersChecked;
  const allOptions = useMemo<VersionOption[]>(
    () => [
      ...(options ?? []),
      ...(filter
        ? [
            {
              id: "show-others",
              group: "Filtered",
              label: "Show other changes",
              note: "dimmed",
              checked: showOthersChecked,
              defaultChecked: true,
              onChange: setShowOthers,
            },
          ]
        : []),
    ],
    [options, filter, showOthersChecked, setShowOthers],
  );
  const range = useVersionRange();
  // Gapped, the rest of each version's object changed in the gap before it
  // too: shown, every row reads its previous state (see Gaps).
  const gaps: Gaps | undefined = gapped ? (showOthers ? "whole" : "key") : undefined;
  // Gapped, a row shows once those before it are in, so the next page's are
  // read too, for it to be there to go to. With `key`, only the oldest loaded
  // version reads its own: the next batch would supply it, but the next
  // version that changed the key can be any number of batches away.
  const shown = useCallback(
    (row: number) =>
      gaps
        ? row < (pagination.pageIndex + 2) * pagination.pageSize || row === openVersion
        : filter
          ? !(batchesSupply && moreComing)
          : !(batchesSupply && batchComing) &&
            (Math.floor(row / pagination.pageSize) === pagination.pageIndex || row === openVersion),
    [gaps, filter, batchesSupply, moreComing, batchComing, pagination, openVersion],
  );
  const rows = useVersionRows(ctx, versions, touchesOf, hasMore, shown, order, minRound, gaps);

  // `settled`: how many of `rows` are known to match or not; the rest wait on a previous state.
  const { data, settled } = useMemo(() => {
    const out: Row<V>[] = [];
    let settled = 0;
    for (const row of rows) {
      const summaries = row.objects.map((o) => summarizeObject(o, filter?.fields));
      if (filter) {
        const match = versionMatches(summaries, filter.fields);
        // Until its previous state is in, the versions after it wait too.
        if (match === undefined) break;
        settled++;
        if (!match) continue;
      } else {
        settled++;
      }
      out.push({ ...row, index: out.length, summaries });
    }
    return { data: out, settled };
  }, [rows, filter]);

  // The open version's row: -1 while it is not (or not yet) in the list.
  const detailsIndex = openRound === null ? null : data.findIndex((r) => r.round === openRound);
  // The list holds no version at that round: it reached past it, or never had
  // it, or holds it but it is not one the filter picks.
  const lastRound = versions.length ? versions[versions.length - 1].round : undefined;
  const passedOpen =
    openRound !== null &&
    ((minRound !== undefined && openRound < minRound) ||
      openVersion >= 0 ||
      (lastRound !== undefined && (order === "desc" ? lastRound < openRound : lastRound > openRound)));
  const openMissing =
    detailsIndex === -1 &&
    ((passedOpen && (openVersion < 0 || openVersion < settled)) || (!hasMore && !isLoading && openVersion < 0));
  // Linked to a version not loaded yet, read on until it is (or is passed) -
  // or, loaded but not yet known to match, until its previous state is in.
  const seekingOpen =
    detailsIndex === -1 && hasMore && !fetchMoreFailed && (!passedOpen || (openVersion >= 0 && openVersion >= settled));

  const setDetailsIndex = useCallback(
    (index: number | null, replace = false) => {
      const round = index === null ? null : data[index]?.round;
      if (round === undefined) return;
      navigate(detailsHref(round), { replace });
    },
    [data, navigate, detailsHref],
  );

  const readWhole = showOthers && !!filter?.object && readsWholeVersions(ctx);
  const { pageIndex: shownPage, pageSize: shownPageSize } = pagination;
  const pageRounds = useMemo(
    () => (readWhole ? data.slice(shownPage * shownPageSize, (shownPage + 1) * shownPageSize).map((r) => r.round) : []),
    [readWhole, data, shownPage, shownPageSize],
  );
  const whole = useVersionsAt(ctx, pageRounds, filter?.object);
  const othersOf = useCallback(
    (row: Row<V>) => {
      if (!showOthers) return undefined;
      const rest = readWhole ? whole.byRound.get(row.round) : [];
      const error = whole.errors.get(row.round);
      return { summaries: summarizeOthers(row.objects, filter.fields, rest ?? []), pending: !rest && !error, error };
    },
    [showOthers, readWhole, whole.byRound, whole.errors, filter],
  );

  // Searching on lifts the limit until stopped or a match is found, and
  // retries a failed batch (the effect below does not).
  const searchOn = useCallback(() => {
    setSearchFrom(data.length);
    onKeepSearching?.();
    if (fetchMoreFailed && !isFetchingMore) fetchMore();
  }, [data.length, onKeepSearching, fetchMoreFailed, isFetchingMore, fetchMore]);
  // A batch on its way still comes in.
  const searchOff = useCallback(() => {
    setSearchFrom(null);
    setScanUntil(versions.length);
  }, [versions.length]);
  useEffect(() => {
    if (searchFrom !== null && data.length > searchFrom) searchOff();
  }, [searchFrom, data.length, searchOff]);

  const filterHref = useVersionFilterHref();
  const fieldHref = useCallback<FieldHref>(
    (key: string, path?: FieldPath) => filterHref({ object: label ? key : undefined, fields: path ? [path] : [] }),
    [filterHref, label],
  );

  // A click on a version's delta opens it in full - but not one on a link,
  // button or in-place toggle inside it, or in a popup portalled out of it.
  // It waits out a double click, which selects text: a selection in the delta
  // when it is due (that or a drag) keeps it shut. Ctrl/Cmd-click opens it
  // in a new tab.
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(openTimer.current), []);
  const openFromDelta = useCallback(
    (e: React.MouseEvent<HTMLElement>, round: number) => {
      const cell = e.currentTarget;
      const target = e.target as Element;
      if (!cell.contains(target) || target.closest("a,button,input,label,[data-inline-toggle]")) return;
      clearTimeout(openTimer.current);
      if (e.detail > 1 || e.shiftKey || e.altKey) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(detailsHref(round), "_blank", "noopener");
        return;
      }
      openTimer.current = setTimeout(() => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && cell.contains(selection.anchorNode)) return;
        navigate(detailsHref(round));
      }, DOUBLE_CLICK_MS);
    },
    [navigate, detailsHref],
  );

  const columns = useMemo<ColumnDef<Row<V>, any>[]>(
    () => [
      {
        id: "round",
        header: () => <AgeHeader switcherSide="left" noBlock label={roundLabel} />,
        meta: { width: "170px" },
        cell: ({ row }) => <RoundCell round={row.original.round} timestamp={row.original.timestamp} />,
      },
      {
        id: "changed",
        header: "Changed",
        meta: { width: "25%" },
        cell: ({ row }) => (
          <ChangedKeys summaries={row.original.summaries} label={label} fieldHref={fieldHref} others={othersOf(row.original)} />
        ),
      },
      {
        id: "delta",
        header: "Delta",
        cell: ({ row }) => (
          // Keyboard users open it from the row's menu.
          <div
            className="group/delta relative -m-1.5 cursor-pointer rounded-md p-1.5 hover:bg-primary/5 hover:ring-1 hover:ring-primary/40"
            onClick={(e) => openFromDelta(e, row.original.round)}
          >
            <DeltaCell summaries={row.original.summaries} label={label} fieldHref={fieldHref} others={othersOf(row.original)} />
            <span className="pointer-events-none absolute right-1.5 top-1.5 hidden items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary group-hover/delta:inline-flex">
              <Maximize2 size={11} />
              Details
            </span>
          </div>
        ),
      },
      {
        id: "details",
        header: "",
        meta: { width: "56px" },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:bg-primary/10 hover:text-primary data-[state=open]:bg-primary/15 data-[state=open]:text-primary"
                  data-version-actions={row.original.round}
                  aria-label="Version actions"
                  title="Version actions"
                >
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={cn(menuContentClass, "min-w-48")}>
                <DropdownMenuItem asChild className={menuItemClass}>
                  <Link noStyle href={detailsHref(row.original.round)} title="This version in full">
                    <Maximize2 />
                    Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className={menuItemClass}>
                  <Link noStyle href={stateHref(row.original.round)} title="This page as it was at this block">
                    <History />
                    Rewind to this block
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className={menuItemClass}>
                  <Link noStyle {...versionTxnsLink(txnsLink, row.original)}>
                    <ArrowLeftRight />
                    Find txns
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [label, stateHref, txnsLink, fieldHref, othersOf, detailsHref, openFromDelta],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.round),
    autoResetPageIndex: false,
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = hasMore ? pageSize - currentRowCount : 0;

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  // When the last batch came in (or the list mounted), for spacing out a search.
  const lastFetchEnd = useRef(Date.now());
  useEffect(() => {
    if (!isFetchingMore) lastFetchEnd.current = Date.now();
  }, [isFetchingMore]);

  // On the last loaded page, fetch the next batch: without it there would be
  // no next page to go to; searching on, getSearchDelayMs() after the last. A
  // failed batch is not retried until the next page change.
  // Gapped, every loaded version matches, but shows only once its previous
  // state is in: count the loaded ones, or this would fetch on meanwhile.
  const loadedPageCount = gapped ? Math.ceil(versions.length / pageSize) : pageCount;
  const scanning = pageIndex >= loadedPageCount - 1 && hasMore && !fetchMoreFailed && !scanPaused;
  useEffect(() => {
    if (!scanning || isFetchingMore) return;
    const delay = searching ? lastFetchEnd.current + getSearchDelayMs() - Date.now() : 0;
    if (delay <= 0) {
      fetchMore();
      return;
    }
    const timer = setTimeout(fetchMore, delay);
    return () => clearTimeout(timer);
  }, [scanning, isFetchingMore, searching, fetchMore]);
  // Linked to a version not loaded yet, read on until it is (or is passed),
  // where the effect above does not already; spaced out like a search.
  useEffect(() => {
    if (!seekingOpen || scanning || isFetchingMore) return;
    const timer = setTimeout(fetchMore, Math.max(0, lastFetchEnd.current + getSearchDelayMs() - Date.now()));
    return () => clearTimeout(timer);
  }, [seekingOpen, scanning, isFetchingMore, fetchMore]);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (newPage >= pageCount - 1) {
      if (filter) setScanUntil((until) => Math.max(until, versions.length + SCAN_STEP));
      if (fetchMoreFailed && hasMore && !isFetchingMore) fetchMore();
    }
  }

  // The dialog stepping past the last match asks for more: past the scan
  // limit, that lifts it, and the effect above fetches.
  const fetchMoreForDialog = useCallback(() => {
    if (scanPaused || fetchMoreFailed) searchOn();
    else fetchMore();
  }, [scanPaused, fetchMoreFailed, searchOn, fetchMore]);

  // Filtered from a link (each filter mounts a new list), scroll the list to
  // the top of the screen unless it is there already. It is at least a screen
  // tall, so it fills the screen even when short.
  const rootRef = useRef<HTMLDivElement>(null);
  const fillScreen = filter ? "min-h-svh" : undefined;
  useEffect(() => {
    const el = rootRef.current;
    if (!filter || !el) return;
    const { top } = el.getBoundingClientRect();
    if (top < 0 || top > window.innerHeight * 0.1) el.scrollIntoView({ behavior: "smooth", block: "start" });
    // On mount only.
  }, []);

  // Stepping from version to version replaces the route; opening and closing add to the history.
  const onDetailsIndexChange = useCallback(
    (index: number | null) => {
      if (index === null) navigate(detailsHref(null));
      else setDetailsIndex(index, detailsIndex !== null);
    },
    [navigate, detailsHref, setDetailsIndex, detailsIndex],
  );
  // Closing the dialog, focus goes to the actions menu of the version it last
  // showed (where it was opened from that menu, the item it was opened from is
  // gone) - on whichever of the table and the cards shows.
  const lastOpenRound = useRef<number | null>(null);
  useEffect(() => {
    if (openRound !== null) lastOpenRound.current = openRound;
  }, [openRound]);
  const focusOpenRowActions = useCallback((e: Event) => {
    const round = lastOpenRound.current;
    if (round === null) return;
    const trigger = Array.from(document.querySelectorAll<HTMLElement>(`[data-version-actions="${round}"]`)).find(
      (el) => el.offsetParent !== null,
    );
    if (!trigger) return;
    e.preventDefault();
    trigger.focus();
  }, []);
  // Keep the table on the page of the version open in the dialog, however it was opened.
  useEffect(() => {
    if (detailsIndex !== null && detailsIndex >= 0) table.setPageIndex(Math.floor(detailsIndex / pageSize));
  }, [detailsIndex, table, pageSize]);

  // The controls row: the same at every width, and there while the list loads
  // or has failed, so an option or range that broke it can be changed.
  const menuState = (which: Exclude<ToolbarMenu, null>) => ({
    open: menu === which,
    onOpenChange: (open: boolean) => onMenuChange(open ? which : menu === which ? null : menu),
  });
  const controls = (
    <div className="flex items-center gap-2">
      <OrderButton order={order} onChange={onOrderChange} />
      <VersionRangeMenu {...menuState("dates")} />
      <VersionOptionsMenu options={allOptions} {...menuState("options")} />
    </div>
  );
  // What the list is narrowed to, each removable.
  const narrowedTo =
    pin || range || filter ? (
      <>
        {pin ? <PinnedNotice round={pin.round} order={order} onUnpin={pin.onUnpin} /> : null}
        <VersionRangeChip />
        {filter ? <ActiveFilter filter={filter} label={label} filterHref={filterHref} /> : null}
      </>
    ) : null;
  const statusRow = (children: React.ReactNode) =>
    children ? <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">{children}</div> : null;

  // Loading or failed, there is nothing to count or search on.
  const loaded = !isLoading && !error;
  const progress = !loaded ? null : filter ? (
    <>
      <span className="text-muted-foreground whitespace-nowrap">
        {/* Gapped, the node sent only matches: all of them are. */}
        {gapped ? null : `${data.length.toLocaleString()} of `}
        {versions.length.toLocaleString()}
        {hasMore ? "+" : ""} {versions.length === 1 && !hasMore ? "version" : "versions"}
      </span>
      {searching && scanning ? (
        <Button variant="outline" size="sm" className={statusButtonClass} onClick={searchOff}>
          Stop searching
        </Button>
      ) : hasMore && (fetchMoreFailed ? !isFetchingMore : scanPaused) ? (
        <Button variant="outline" size="sm" className={statusButtonClass} onClick={searchOn}>
          {fetchMoreFailed ? "Retry" : "Keep searching"}
        </Button>
      ) : null}
    </>
  ) : hasMore && fetchMoreFailed && !isFetchingMore ? (
    <Button variant="outline" size="sm" className={statusButtonClass} onClick={fetchMore}>
      Retry
    </Button>
  ) : null;

  // One tree whether loading, failed or loaded, so the controls row (and a
  // menu open in it) stays mounted as the list comes in.
  return (
    <div ref={rootRef} className={fillScreen}>
      <ListToolbar
        className="mt-3"
        pageIndex={pageIndex}
        pageCount={pageCount}
        hasMore={hasMore}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        loading={isFetchingMore || scanning}
        compactPagination
      >
        {controls}
      </ListToolbar>
      {statusRow(
        narrowedTo || progress ? (
          <>
            {narrowedTo}
            {progress}
          </>
        ) : null,
      )}
      {error ? (
        <div className="py-6 text-muted-foreground">Version history unavailable: {error.message}</div>
      ) : isLoading ? (
        <div className="flex items-start justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
      <DataTable
        table={table}
        columns={columns}
        columnLabels={{ round: roundLabel(shownFormat(format, true)), changed: "Changed", delta: "Delta", details: "" }}
        emptyLabel={
          !filter
            ? emptyLabel
            : hasMore && fetchMoreFailed
              ? "Could not load more versions"
              : moreComing
                ? "Searching…"
                : hasMore
                  ? `None in the ${versions.length.toLocaleString()} versions searched so far`
                  : "No versions changed this"
        }
        padCount={padCount}
        isFetchingNextPage={isFetchingMore || scanning}
        tableRef={tableRef}
        tableStyle={stableStyle}
        cardsBelow="lg"
        cardActions="details"
      />
      <VersionDetailsDialog
        ctx={ctx}
        filter={filter}
        showOthers={showOthers}
        rows={data}
        index={detailsIndex === -1 ? null : detailsIndex}
        openRound={openRound}
        openMissing={openMissing}
        onIndexChange={onDetailsIndexChange}
        hasMore={hasMore}
        fetchMore={fetchMoreForDialog}
        searchPaused={scanPaused && hasMore && !isFetchingMore}
        isFetchingMore={isFetchingMore}
        fetchMoreFailed={fetchMoreFailed}
        order={order}
        label={label}
        stateHref={stateHref}
        txnsLink={txnsLink}
        fieldHref={fieldHref}
        filenamePrefix={filenamePrefix}
        onCloseAutoFocus={focusOpenRowActions}
      />
        </>
      )}
    </div>
  );
}
