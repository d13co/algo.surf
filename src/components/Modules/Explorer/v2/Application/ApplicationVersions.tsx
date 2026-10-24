import React, { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { cn } from "src/lib/utils";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import { useAppVersions, useSearchBatchSize } from "src/hooks/useTimeTravel";
import { useRound, withRound } from "src/hooks/useRound";
import { withTxnRound } from "src/hooks/useTxnRound";
import { useRangeRounds, useVersionFilter, useVersionPin, useVersionRange, useVersionsOrder } from "src/hooks/useVersionFilter";
import { TTAppStateVersion } from "src/utils/timeTravel";
import { withVersionFilter, withVersionRange, withVersionsOrder } from "src/utils/versionFilter";
import { appVersionTouches, BaselineContext, displayTealKey, objKindLabel, ObjRef } from "src/utils/versionDelta";
import Link from "../Links/Link";
import { ObjectLabel, StateHref, TxnsLink } from "../Versions/VersionChanges";
import VersionRangeBar from "../Versions/VersionRangeBar";
import VersionsList from "../Versions/VersionsList";

/** Where the app page shows a box (by its base64 name). */
function boxHref(appId: number, name: string): string {
  return `/application/${appId}/boxes/${encodeURIComponent(name)}`;
}

function ApplicationVersions(): JSX.Element {
  const { id } = useParams();
  const appId = Number(id);
  // On a page at a past round, the versions up to it.
  const { round } = useRound();
  const range = useVersionRange();
  const { bounds: rangeBounds, isLoading: boundsLoading, error: boundsError } = useRangeRounds(range, round);
  // Off by default: an app that writes boxes on every call would have its
  // params' versions buried among its boxes'. Remembered, so a reload of a
  // filtered list still shows the box changes beside what it picks.
  const [includeBoxesChecked, setIncludeBoxesChecked] = usePersistenBooleanState("app-versions-include-boxes", false);
  const [order, setOrder] = useVersionsOrder();
  const { bounds, pinned, unpin } = useVersionPin(rangeBounds, order);
  const filter = useVersionFilter("app");
  const object = filter?.object;
  // A link to a box's versions (or a reload of it) must list them, whatever the box says.
  const boxFiltered = /^box:/.test(object ?? "");
  const includeBoxes = includeBoxesChecked || boxFiltered;
  const listKey = `${includeBoxes}-${order}-${pinned ?? ""}-${withVersionFilter(withVersionRange("", range), filter)}`;
  const [batchSize, keepSearching] = useSearchBatchSize(listKey, filter);

  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAppVersions(appId, bounds, order, batchSize, includeBoxes, object);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(() => ({ kind: "app", appId, includeBoxes }), [appId, includeBoxes]);
  // Filtered to an object, only its touches (see useAppVersions).
  const touchesOf = useCallback(
    (v: TTAppStateVersion) => {
      const touches = appVersionTouches(v);
      return object ? touches.filter((t) => t.key === object) : touches;
    },
    [object],
  );
  // Without boxes, the app is all a version touches: nothing to name.
  const label = useMemo<ObjectLabel>(
    () =>
      includeBoxes
        ? (ref: ObjRef) =>
            ref.kind === "box" ? (
              <span>
                {objKindLabel.box}{" "}
                <Link href={withVersionsOrder(`${boxHref(appId, String(ref.id))}?view=history`, order)} title="This box's history">
                  <span className="font-mono inline-block max-w-[24ch] truncate align-bottom">{displayTealKey(String(ref.id))}</span>
                </Link>
              </span>
            ) : (
              objKindLabel[ref.kind]
            )
        : null,
    [includeBoxes, appId, order],
  );
  const stateHref = useCallback<StateHref>(
    (at, ref) => withRound(ref?.kind === "box" ? boxHref(appId, String(ref.id)) : `/application/${appId}`, at),
    [appId],
  );
  const txnsLink = useCallback<TxnsLink>(
    (at) => ({ href: withTxnRound(`/application/${appId}/transactions`, at), title: "The app's transactions in this block" }),
    [appId],
  );

  return (
    <>
      <VersionRangeBar />
      <VersionsList
        key={listKey}
        filter={filter}
        onKeepSearching={keepSearching}
        ctx={ctx}
        versions={versions}
        touchesOf={touchesOf}
        order={order}
        onOrderChange={setOrder}
        isLoading={isLoading || boundsLoading}
        error={boundsError ?? (data ? null : error)}
        hasMore={!!hasNextPage}
        fetchMore={fetchNextPage}
        isFetchingMore={isFetchingNextPage}
        fetchMoreFailed={isFetchNextPageError}
        label={label}
        stateHref={stateHref}
        txnsLink={txnsLink}
        filenamePrefix={`app-${appId}`}
        emptyLabel={range ? "No versions in this date range" : "No versions"}
        minRound={bounds?.min}
        pin={pinned === undefined ? undefined : { round: pinned, onUnpin: unpin }}
        toolbar={
          <label className={cn("flex items-center gap-2 text-sm text-muted-foreground", boxFiltered ? "opacity-60" : "cursor-pointer")}>
            <input
              type="checkbox"
              className="accent-primary"
              checked={includeBoxes}
              disabled={boxFiltered}
              onChange={(e) => setIncludeBoxesChecked(e.target.checked)}
            />
            Include box changes
          </label>
        }
      />
    </>
  );
}

export default ApplicationVersions;
