import React, { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAccountVersions, useVersionsOrder } from "src/hooks/useTimeTravel";
import { useRound, withRound } from "src/hooks/useRound";
import { TTAccountVersion } from "src/utils/timeTravel";
import {
  accountVersionTouches,
  BaselineContext,
  objKindLabel,
  ObjRef,
} from "src/utils/versionDelta";
import LinkToAsset from "../Links/LinkToAsset";
import LinkToApplication from "../Links/LinkToApplication";
import VersionsList from "../Versions/VersionsList";

function objectLabel(ref: ObjRef): React.ReactNode {
  const id = Number(ref.id);
  switch (ref.kind) {
    case "asset":
    case "created-asset":
      return <span>{objKindLabel[ref.kind]} <LinkToAsset id={id} /></span>;
    case "local":
    case "created-app":
      return <span>{objKindLabel[ref.kind]} <LinkToApplication id={id} /></span>;
    default:
      return objKindLabel[ref.kind];
  }
}

/** Where the account page shows `ref` (or the whole account) as it was at `round`. */
function stateHrefFor(address: string) {
  return (round: number, ref?: ObjRef): string => {
    const account = `/account/${address}`;
    switch (ref?.kind) {
      case "asset":
        return withRound(`${account}/assets`, round);
      case "local":
        return withRound(`${account}/opted-applications/${ref.id}`, round);
      case "created-asset":
        return withRound(`${account}/created-assets`, round);
      case "created-app":
        return withRound(`/application/${ref.id}`, round);
      default:
        return withRound(account, round);
    }
  };
}

function AccountVersions(): JSX.Element {
  const { address } = useParams();
  // On a page at a past round, the versions up to it.
  const { round } = useRound();
  // Off by default: each global state change of an app this account created
  // would otherwise be a version of the account as well.
  const [includeCreatedParams, setIncludeCreatedParams] = useState(false);
  const [order, setOrder] = useVersionsOrder();

  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAccountVersions(address, includeCreatedParams, round, order);
  const stateHref = useMemo(() => stateHrefFor(address), [address]);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(
    () => ({ kind: "account", address, includeCreatedParams }),
    [address, includeCreatedParams],
  );
  const touchesOf = useCallback(
    (v: TTAccountVersion) => accountVersionTouches(v, includeCreatedParams),
    [includeCreatedParams],
  );

  return (
    <VersionsList
      key={`${includeCreatedParams}-${order}`}
      ctx={ctx}
      versions={versions}
      touchesOf={touchesOf}
      order={order}
      onOrderChange={setOrder}
      isLoading={isLoading}
      error={data ? null : error}
      hasMore={!!hasNextPage}
      fetchMore={fetchNextPage}
      isFetchingMore={isFetchingNextPage}
      fetchMoreFailed={isFetchNextPageError}
      label={objectLabel}
      stateHref={stateHref}
      filenamePrefix={`account-${address}`}
      emptyLabel="No versions"
      toolbar={
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary"
            checked={includeCreatedParams}
            onChange={(e) => setIncludeCreatedParams(e.target.checked)}
          />
          Include created app and asset params
        </label>
      }
    />
  );
}

export default AccountVersions;
