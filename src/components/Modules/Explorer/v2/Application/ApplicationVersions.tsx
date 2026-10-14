import { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAppVersions, useSearchBatchSize, useVersionsOrder } from "src/hooks/useTimeTravel";
import { useRound, withRound } from "src/hooks/useRound";
import { withTxnRound } from "src/hooks/useTxnRound";
import { useRangeRounds, useVersionFilter, useVersionRange } from "src/hooks/useVersionFilter";
import { withVersionFilter, withVersionRange } from "src/utils/versionFilter";
import { appVersionTouches, BaselineContext } from "src/utils/versionDelta";
import { TxnsLink } from "../Versions/VersionChanges";
import VersionRangeBar from "../Versions/VersionRangeBar";
import VersionsList from "../Versions/VersionsList";

function ApplicationVersions(): JSX.Element {
  const { id } = useParams();
  const appId = Number(id);
  // On a page at a past round, the versions up to it.
  const { round } = useRound();
  const range = useVersionRange();
  const { bounds, isLoading: boundsLoading, error: boundsError } = useRangeRounds(range, round);
  const [order, setOrder] = useVersionsOrder();
  const filter = useVersionFilter(false);
  const listKey = `${order}-${withVersionFilter(withVersionRange("", range), filter)}`;
  const [batchSize, keepSearching] = useSearchBatchSize(listKey, filter);

  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAppVersions(appId, bounds, order, batchSize);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(() => ({ kind: "app", appId }), [appId]);
  const stateHref = useCallback((at: number) => withRound(`/application/${appId}`, at), [appId]);
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
        touchesOf={appVersionTouches}
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
        filenamePrefix={`app-${appId}`}
        emptyLabel={range ? "No versions in this date range" : "No versions"}
        minRound={bounds?.min}
      />
    </>
  );
}

export default ApplicationVersions;
