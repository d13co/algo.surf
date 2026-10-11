import { useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAppVersions, useVersionsOrder } from "src/hooks/useTimeTravel";
import { useRound, withRound } from "src/hooks/useRound";
import { withTxnRound } from "src/hooks/useTxnRound";
import { useVersionFilter } from "src/hooks/useVersionFilter";
import { withVersionFilter } from "src/utils/versionFilter";
import { appVersionTouches, BaselineContext } from "src/utils/versionDelta";
import { TxnsLink } from "../Versions/VersionChanges";
import VersionsList from "../Versions/VersionsList";

function ApplicationVersions(): JSX.Element {
  const { id } = useParams();
  const appId = Number(id);
  // On a page at a past round, the versions up to it.
  const { round } = useRound();
  const [order, setOrder] = useVersionsOrder();
  const filter = useVersionFilter(false);

  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAppVersions(appId, round, order);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(() => ({ kind: "app", appId }), [appId]);
  const stateHref = useCallback((at: number) => withRound(`/application/${appId}`, at), [appId]);
  const txnsLink = useCallback<TxnsLink>(
    (at) => ({ href: withTxnRound(`/application/${appId}/transactions`, at), title: "The app's transactions in this block" }),
    [appId],
  );

  return (
    <VersionsList
      key={`${order}-${withVersionFilter("", filter)}`}
      filter={filter}
      ctx={ctx}
      versions={versions}
      touchesOf={appVersionTouches}
      order={order}
      onOrderChange={setOrder}
      isLoading={isLoading}
      error={data ? null : error}
      hasMore={!!hasNextPage}
      fetchMore={fetchNextPage}
      isFetchingMore={isFetchingNextPage}
      fetchMoreFailed={isFetchNextPageError}
      label={null}
      stateHref={stateHref}
      txnsLink={txnsLink}
      filenamePrefix={`app-${appId}`}
      emptyLabel="No versions"
    />
  );
}

export default ApplicationVersions;
