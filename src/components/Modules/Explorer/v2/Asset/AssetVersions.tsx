import React, { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAssetVersions, useSearchBatchSize } from "src/hooks/useTimeTravel";
import { useRound, withRound } from "src/hooks/useRound";
import { withTxnRound } from "src/hooks/useTxnRound";
import { useRangeRounds, useVersionFilter, useVersionPin, useVersionRange, useVersionsOrder } from "src/hooks/useVersionFilter";
import { withVersionFilter, withVersionRange } from "src/utils/versionFilter";
import { assetVersionTouches, BaselineContext } from "src/utils/versionDelta";
import { StateHref, TxnsLink } from "../Versions/VersionChanges";
import VersionRangeBar from "../Versions/VersionRangeBar";
import VersionsList from "../Versions/VersionsList";

function AssetVersions(): JSX.Element {
  const { id } = useParams();
  const assetId = Number(id);
  // On a page at a past round, the versions up to it.
  const { round } = useRound();
  const range = useVersionRange();
  const { bounds: rangeBounds, isLoading: boundsLoading, error: boundsError } = useRangeRounds(range, round);
  const [order, setOrder] = useVersionsOrder();
  const { bounds, pinned, unpin } = useVersionPin(rangeBounds, order);
  // One object: a filter names only fields of the asset's params.
  const filter = useVersionFilter();
  const listKey = `${assetId}-${order}-${pinned ?? ""}-${withVersionFilter(withVersionRange("", range), filter)}`;
  const [batchSize, keepSearching] = useSearchBatchSize(listKey, filter);

  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAssetVersions(assetId, bounds, order, batchSize);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(() => ({ kind: "asset", assetId }), [assetId]);
  const stateHref = useCallback<StateHref>((at) => withRound(`/asset/${assetId}`, at), [assetId]);
  const txnsLink = useCallback<TxnsLink>(
    (at) => ({ href: withTxnRound(`/asset/${assetId}/transactions`, at), title: "The asset's transactions in this block" }),
    [assetId],
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
        touchesOf={assetVersionTouches}
        order={order}
        onOrderChange={setOrder}
        isLoading={isLoading || boundsLoading}
        error={boundsError ?? (data ? null : error)}
        hasMore={!!hasNextPage}
        fetchMore={fetchNextPage}
        isFetchingMore={isFetchingNextPage}
        fetchMoreFailed={isFetchNextPageError}
        label={null}
        stateHref={stateHref}
        txnsLink={txnsLink}
        filenamePrefix={`asset-${assetId}`}
        emptyLabel={range ? "No versions in this date range" : "No versions"}
        minRound={bounds?.min}
        pin={pinned === undefined ? undefined : { round: pinned, onUnpin: unpin }}
      />
    </>
  );
}

export default AssetVersions;
