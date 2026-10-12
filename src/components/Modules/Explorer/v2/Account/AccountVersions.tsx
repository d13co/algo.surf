import React, { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { cn } from "src/lib/utils";
import { useAccountVersions, useSearchBatchSize, useVersionsOrder } from "src/hooks/useTimeTravel";
import { useRound, withRound } from "src/hooks/useRound";
import { withTxnRound } from "src/hooks/useTxnRound";
import { useVersionFilter } from "src/hooks/useVersionFilter";
import { withVersionFilter } from "src/utils/versionFilter";
import { TTAccountVersion } from "src/utils/timeTravel";
import {
  accountVersionTouches,
  BaselineContext,
  objKindLabel,
  ObjRef,
} from "src/utils/versionDelta";
import LinkToAsset from "../Links/LinkToAsset";
import LinkToApplication from "../Links/LinkToApplication";
import { TxnsLink } from "../Versions/VersionChanges";
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

/**
 * Where the transactions in `round` that changed `ref` (or the account) are
 * listed: a created app's or asset's own, since changing one need not involve
 * the account, else the account's.
 */
function txnsLinkFor(address: string): TxnsLink {
  return (round, ref) => {
    switch (ref?.kind) {
      case "created-app":
        return { href: withTxnRound(`/application/${ref.id}/transactions`, round), title: "The app's transactions in this block" };
      case "created-asset":
        return { href: withTxnRound(`/asset/${ref.id}/transactions`, round), title: "The asset's transactions in this block" };
      default:
        return { href: withTxnRound(`/account/${address}`, round), title: "The account's transactions in this block" };
    }
  };
}

function AccountVersions(): JSX.Element {
  const { address } = useParams();
  // On a page at a past round, the versions up to it.
  const { round } = useRound();
  // Off by default: each global state change of an app this account created
  // would otherwise be a version of the account as well.
  const [includeParamsChecked, setIncludeParamsChecked] = useState(false);
  const [order, setOrder] = useVersionsOrder();
  const filter = useVersionFilter(true);
  const object = filter?.object;
  // A field of a created app or asset is in its params: a link to one (or a
  // reload of it) must read them, whatever the box says.
  const paramsFiltered = !!filter?.fields.length && /^created-/.test(object ?? "");
  const includeCreatedParams = includeParamsChecked || paramsFiltered;
  const listKey = `${includeCreatedParams}-${order}-${withVersionFilter("", filter)}`;
  const [batchSize, keepSearching] = useSearchBatchSize(listKey, filter);

  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAccountVersions(address, includeCreatedParams, round, order, object, batchSize);
  const stateHref = useMemo(() => stateHrefFor(address), [address]);
  const txnsLink = useMemo(() => txnsLinkFor(address), [address]);

  const versions = useMemo(() => data?.pages.flatMap((p) => p.versions) ?? [], [data]);
  const ctx = useMemo<BaselineContext>(
    () => ({ kind: "account", address, includeCreatedParams }),
    [address, includeCreatedParams],
  );
  // Filtered to an object, its list can hold another's versions too (see useAccountVersions).
  const touchesOf = useCallback(
    (v: TTAccountVersion) => {
      const touches = accountVersionTouches(v, includeCreatedParams);
      return object ? touches.filter((t) => t.key === object) : touches;
    },
    [includeCreatedParams, object],
  );

  return (
    <VersionsList
      key={listKey}
      filter={filter}
      onKeepSearching={keepSearching}
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
      txnsLink={txnsLink}
      filenamePrefix={`account-${address}`}
      emptyLabel="No versions"
      toolbar={
        <label className={cn("flex items-center gap-2 text-sm text-muted-foreground", paramsFiltered ? "opacity-60" : "cursor-pointer")}>
          <input
            type="checkbox"
            className="accent-primary"
            checked={includeCreatedParams}
            disabled={paramsFiltered}
            onChange={(e) => setIncludeParamsChecked(e.target.checked)}
          />
          Include created app and asset params
        </label>
      }
    />
  );
}

export default AccountVersions;
