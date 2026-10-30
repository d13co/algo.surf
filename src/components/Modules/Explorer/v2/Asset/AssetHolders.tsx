import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ColumnDef, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { Loader2, ThermometerSnowflake, X } from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import { DataTable } from "src/components/v2/DataTable";
import ListToolbar from "src/components/v2/ListToolbar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/v2/ui/tooltip";
import { useAsset } from "src/hooks/useAsset";
import { useRound } from "src/hooks/useRound";
import { useAssetHolders } from "src/hooks/useTimeTravel";
import { formatUnits } from "src/utils/formatUnits";
import { TTAssetHolder } from "src/utils/timeTravel";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToBlock from "../Links/LinkToBlock";
import VersionsLink from "../Versions/VersionsLink";
import AssetHoldersExport from "./AssetHoldersExport";

const PAGE_SIZE = 25;

/**
 * Batches read in a row while the page stays short (hiding zero balances, a
 * batch can hold none to show) before waiting to be asked for more.
 */
const SCAN_BATCHES = 10;

const actionClassName = "border-border text-primary hover:bg-primary/10";

type AssetFormat = { decimals: number; unit?: string; total?: bigint };

/** `amount` as a percentage of `total`, to 4 decimals; "<0.0001%" for a smaller share. */
function share(amount: bigint, total: bigint): string {
  if (!amount || !total) return "0%";
  const bp = (amount * 1_000_000n) / total;
  if (!bp) return "<0.0001%";
  return `${(Number(bp) / 10_000).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
}

function FrozenIcon() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0 text-blue-400">
            <ThermometerSnowflake size={14} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          <p>Frozen for this account</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const columnsFor = (assetId: number, format: AssetFormat | undefined): ColumnDef<TTAssetHolder, any>[] => [
  {
    id: "address",
    header: "Account",
    cell: ({ row }) => (
      <span className="text-[13px] break-all">
        <LinkToAccount address={row.original.address} copySize="s" />
      </span>
    ),
  },
  {
    id: "balance",
    header: "Balance",
    meta: { width: "30%" },
    cell: ({ row }) => {
      const { address, amount, "is-frozen": frozen } = row.original;
      return (
        <span className="inline-flex items-center gap-1">
          {frozen ? <FrozenIcon /> : null}
          {format ? formatUnits(amount, format.decimals) : String(amount)}
          {format?.unit ? <span className="text-muted-foreground ml-0.5">{format.unit}</span> : null}
          <span className="ml-1 inline-flex">
            <VersionsLink
              path={`/account/${address}/versions`}
              filter={{ object: `asset:${assetId}`, fields: [] }}
              title="Versions of this holding"
            />
          </span>
        </span>
      );
    },
  },
  {
    id: "share",
    header: "Share of supply",
    meta: { width: "160px" },
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {format?.total === undefined ? "--" : share(BigInt(row.original.amount), format.total)}
      </span>
    ),
  },
];

const columnLabels: Record<string, string> = { address: "Account", balance: "Balance", share: "Share of supply" };

/**
 * The accounts holding an asset at the page's round (the latest without
 * one), from the time-travel node, in address order: the node lists them
 * no other way. Paging to the last loaded page reads the next batch.
 */
function AssetHolders(): JSX.Element {
  const { id } = useParams();
  const assetId = Number(id);
  const { round } = useRound();
  const { data: asset } = useAsset(assetId, round);
  const [hideZero, setHideZero] = usePersistenBooleanState("asset-holders-hide-zero", true);

  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError, reset } =
    useAssetHolders(assetId, round);

  const format = useMemo<AssetFormat | undefined>(
    () =>
      asset?.params
        ? {
            decimals: Number(asset.params.decimals ?? 0),
            unit: asset.params.unitName,
            // A destroyed asset's params can be cleared: no total to share.
            total: asset.params.total ? BigInt(asset.params.total) : undefined,
          }
        : undefined,
    [asset],
  );
  const columns = useMemo(() => columnsFor(assetId, format), [assetId, format]);

  const loaded = useMemo(() => data?.pages.flatMap((p) => p.holders) ?? [], [data]);
  const holders = useMemo(() => (hideZero ? loaded.filter((h) => BigInt(h.amount) > 0n) : loaded), [loaded, hideZero]);
  const listRound = data?.pages[0]?.round;

  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
  const table = useReactTable({
    data: holders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.address,
    autoResetPageIndex: false,
    state: { pagination },
    onPaginationChange: setPagination,
  });
  const { pageIndex } = pagination;
  const pageCount = table.getPageCount();
  // Never past the last page (the rows can shrink under it, as on reset).
  useEffect(() => {
    if (pageCount > 0) setPagination((p) => (p.pageIndex > pageCount - 1 ? { ...p, pageIndex: pageCount - 1 } : p));
  }, [pageIndex, pageCount]);

  // On the last loaded page, read the next batch, up to SCAN_BATCHES in a row
  // while the page stays short; paging, toggling or Keep searching asks again.
  const [scanBudget, setScanBudget] = useState(SCAN_BATCHES);
  const askForMore = useCallback(() => setScanBudget(SCAN_BATCHES), []);
  useEffect(askForMore, [hideZero, askForMore]);
  // Another asset or block (the page stays mounted): start at the first page.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
    askForMore();
  }, [assetId, round, askForMore]);
  const onLastPage = pageIndex >= pageCount - 1;
  const wantMore = onLastPage && !!hasNextPage && !isFetchNextPageError;
  const scanning = wantMore && scanBudget > 0;
  useEffect(() => {
    if (!scanning || isFetchingNextPage) return;
    setScanBudget((b) => b - 1);
    fetchNextPage();
    // The batches loaded too: should a fetch end before a render showed it, the next would still start.
  }, [scanning, isFetchingNextPage, fetchNextPage, data?.pages.length]);

  function goTo(page: number) {
    table.setPageIndex(page);
    askForMore();
    if (isFetchNextPageError && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return <div className="py-6 text-muted-foreground">Holders unavailable: {error.message}</div>;
  }

  const paused = wantMore && !scanning && !isFetchingNextPage;
  const count = holders.length.toLocaleString();
  const more = hasNextPage ? "+" : "";

  return (
    <div>
      <ListToolbar
        className="mt-3"
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => goTo(0)}
        onPrev={() => goTo(pageIndex - 1)}
        onNext={() => goTo(pageIndex + 1)}
        onLast={() => goTo(pageCount - 1)}
        loading={isFetchingNextPage}
        actions={
          listRound !== undefined && format ? (
            <AssetHoldersExport
              assetId={assetId}
              round={listRound}
              decimals={format.decimals}
              unit={format.unit}
              hideOptins={hideZero}
            />
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary"
              checked={hideZero}
              onChange={(e) => {
                // The rows change under the page: start over at the first.
                setPagination((p) => ({ ...p, pageIndex: 0 }));
                setHideZero(e.target.checked);
              }}
            />
            Hide optins
          </label>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {count}
            {more} {holders.length === 1 && !hasNextPage ? "holder" : "holders"}
            {hideZero ? ` of ${loaded.length.toLocaleString()}${more} opted in` : ""}
            {listRound !== undefined ? (
              <>
                {" "}
                at block <LinkToBlock id={listRound} />
              </>
            ) : null}
          </span>
          {/* At the latest block, the list stays at the block it was first read at: this reads it again. */}
          {round === undefined && listRound !== undefined ? (
            <button
              type="button"
              className="inline-flex shrink-0 -ml-2 text-muted-foreground hover:text-primary cursor-pointer"
              title="Reload at the latest block"
              aria-label="Reload at the latest block"
              onClick={() => {
                setPagination((p) => ({ ...p, pageIndex: 0 }));
                askForMore();
                reset();
              }}
            >
              <X size={14} />
            </button>
          ) : null}
          {isFetchNextPageError && !isFetchingNextPage ? (
            <Button variant="outline" size="sm" className={actionClassName} onClick={() => goTo(pageIndex)}>
              Retry
            </Button>
          ) : paused ? (
            <Button variant="outline" size="sm" className={actionClassName} onClick={askForMore}>
              Keep searching
            </Button>
          ) : null}
        </div>
      </ListToolbar>
      <DataTable
        table={table}
        columns={columns}
        columnLabels={columnLabels}
        emptyLabel={
          scanning || isFetchingNextPage
            ? "Searching…"
            : isFetchNextPageError
              ? "Could not load more holders"
              : hasNextPage
                ? `None in the ${loaded.length.toLocaleString()} accounts read so far`
                : hideZero
                  ? "No holders with a balance"
                  : "No holders"
        }
        isFetchingNextPage={isFetchingNextPage}
      />
    </div>
  );
}

export default AssetHolders;
