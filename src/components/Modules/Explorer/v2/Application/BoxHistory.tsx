import React, { useMemo } from "react";
import { History, Loader2 } from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { useBoxVersions, useVersionRows } from "src/hooks/useTimeTravel";
import { useVersionsOrder } from "src/hooks/useVersionFilter";
import { withRound } from "src/hooks/useRound";
import { withTxnRound } from "src/hooks/useTxnRound";
import type { TTBoxVersion } from "src/utils/timeTravel";
import {
  BaselineContext,
  boxVersionTouches,
  BytesLeaf,
  Snapshot,
  summarizeObject,
  VersionRow,
} from "src/utils/versionDelta";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";
import { OrderButton } from "../Versions/VersionsList";
import { FindTxnsLink, StatusChip } from "../Versions/VersionChanges";
import { BoxValueDiff, SizeNote } from "./BoxValueDiff";

// Every version is shown, so every one needs the value before it.
const allRows = () => true;

/** A box value (base64); null where the box did not exist, undefined while unknown. */
function valueOf(snapshot: Snapshot | undefined): string | null | undefined {
  if (snapshot === undefined) return undefined;
  if (snapshot === null) return null;
  return (snapshot.value as BytesLeaf).$bytes;
}

function BoxVersionItem({ row, appId, name, types }: { row: VersionRow<TTBoxVersion>; appId: number; name: string; types?: string[] }) {
  const object = row.objects[0];
  const summary = useMemo(() => summarizeObject(object), [object]);
  const before = valueOf(object.before);
  const after = valueOf(object.after);

  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5 text-sm">
        <span>
          Block <LinkToBlock id={row.round} />
        </span>
        <span className="text-muted-foreground">
          <MultiDateViewer timestamp={row.timestamp} block={row.round} variant="short" />
        </span>
        <StatusChip summary={summary} />
        {before !== undefined ? <SizeNote before={before} after={after} /> : null}
        <span className="ml-auto flex gap-3">
          <FindTxnsLink
            href={withTxnRound(`/application/${appId}/transactions`, row.round)}
            title="The app's transactions in this block"
          />
          {after !== null ? (
            <Link
              href={withRound(`/application/${appId}/boxes/${encodeURIComponent(name)}`, row.round)}
              className="text-xs"
              title="This box as it was at this block"
            >
              <History size={12} className="inline -mt-0.5 mr-1" />
              rewind
            </Link>
          ) : null}
        </span>
      </div>
      {summary.status === "pending" ? (
        <div className="h-4 w-40 my-0.5 rounded bg-muted animate-pulse" />
      ) : summary.status === "error" ? (
        <span className="text-red-400 text-xs">Previous value unavailable: {summary.error}</span>
      ) : (
        <BoxValueDiff before={before} after={after} types={types} />
      )}
    </div>
  );
}

/**
 * A box's versions from the time-travel node, up to `round` where the page
 * shows one: each with what it did to the value. `types` are the ARC-4 types
 * set for the app's box values, to compare them decoded.
 */
export default function BoxHistory({ appId, name, round, types }: { appId: number; name: string; round?: number; types?: string[] }) {
  const [order, setOrder] = useVersionsOrder();
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage, isFetchNextPageError } =
    useBoxVersions(appId, name, round, order);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(() => ({ kind: "box", appId, name }), [appId, name]);
  const rows = useVersionRows(ctx, versions, boxVersionTouches, !!hasNextPage, allRows, order);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-muted-foreground">Version history unavailable: {(error as Error)?.message}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <OrderButton order={order} onChange={setOrder} />
        <span className="text-sm text-muted-foreground">
          {rows.length.toLocaleString()}
          {hasNextPage ? "+" : ""} {rows.length === 1 && !hasNextPage ? "version" : "versions"}
        </span>
      </div>
      {rows.length ? (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <BoxVersionItem key={row.round} row={row} appId={appId} name={name} types={types} />
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground">No versions</div>
      )}
      {isFetchNextPageError ? (
        <div className="text-red-400 text-xs">Could not load more versions: {(error as Error)?.message}</div>
      ) : null}
      {hasNextPage ? (
        <div>
          <Button variant="outline" size="sm" className="border-border text-primary hover:bg-primary/10" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
            {order === "desc" ? "Load older versions" : "Load newer versions"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
