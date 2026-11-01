import { useCallback, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AtRoundRead,
  getAssetHoldersPage,
  getHoldersSupport,
  getTimeTravelNode,
  getTimeTravelSupport,
  getVersionsPage,
  nameBytes,
  readAtRound,
  readVersionAsOf,
  TTAccountVersion,
  TTAppStateVersion,
  TTAppVersion,
  TTAssetHoldersPage,
  TTAssetVersion,
  TTBoxesVersion,
  TTBoxVersion,
  TTVersionsPage,
  BOX_VERSIONS_BATCH_SIZE,
  VERSIONS_BATCH_SIZE,
  VERSIONS_FIRST_BATCH_SIZE,
  VERSIONS_SEARCH_BATCH_SIZE,
  RoundBounds,
  VersionsOrder,
  VersionsQuery,
  VersionsSource,
} from "src/utils/timeTravel";
import {
  accountVersionTouches,
  appVersionTouches,
  assetVersionTouches,
  BaselineContext,
  BaselineNeed,
  Baselines,
  baselineId,
  baselineRequest,
  boxVersionTouches,
  buildRows,
  extractBaseline,
  Gaps,
  ObjRef,
  RowObject,
  Snapshot,
  Touch,
  VersionRow,
} from "src/utils/versionDelta";
import { parseObjKey, VersionFilter } from "src/utils/versionFilter";
import { FeedReader, MergedCursor, MergedPage, readMergedPage } from "src/utils/mergeVersionFeeds";

// History is append-only, but kept in memory only: it is experimental, and big.
const meta = { noPersist: true };

/** What the configured time-travel node offers: "none" without one, "checking" until known. */
export type TimeTravelStatus = "none" | "checking" | "supported" | "unsupported";

/**
 * Whether the configured time-travel node serves past state and version
 * histories, for this network. Sends nothing when no node is configured (see
 * getTimeTravelNode); a node that cannot be reached counts as unsupported.
 */
export function useTimeTravelStatus(): TimeTravelStatus {
  const node = getTimeTravelNode();
  const { data } = useQuery({
    queryKey: ["timetravel-support", node?.baseUrl],
    queryFn: async () => {
      try {
        const support = await getTimeTravelSupport();
        if ("reason" in support) console.warn(`${node.baseUrl} does not serve version histories: ${support.reason}`);
        return support.supported;
      } catch (e) {
        // Resolved rather than thrown: a failed query would be retried by
        // every component that mounts next.
        console.warn(`${node.baseUrl} is unreachable: ${(e as Error).message}`);
        return false;
      }
    },
    enabled: !!node,
    staleTime: Infinity,
    retry: false,
    meta,
  });
  if (!node) return "none";
  if (data === undefined) return "checking";
  return data ? "supported" : "unsupported";
}

/** Whether the configured time-travel node serves version histories, for this network. */
export function useTimeTravelSupport(): boolean {
  return useTimeTravelStatus() === "supported";
}

/**
 * Whether the configured time-travel node lists asset holders (see
 * getHoldersSupport); asked only of a node that serves this network's
 * histories. A node whose holders index is still being built says yes, and
 * its holders read fails with why.
 */
export function useHoldersSupport(): boolean {
  const supported = useTimeTravelSupport();
  const { data } = useQuery({
    queryKey: ["timetravel-holders-support", getTimeTravelNode()?.baseUrl],
    queryFn: async () => {
      try {
        return await getHoldersSupport();
      } catch (e) {
        // Resolved rather than thrown, as for useTimeTravelStatus.
        console.warn(`Asset holders unavailable: ${(e as Error).message}`);
        return false;
      }
    },
    enabled: supported,
    // A no from a failed read can be a passing one (a network blip): asked again after a minute.
    staleTime: (query) => (query.state.data ? Infinity : 60_000),
    retry: false,
    meta,
  });
  return supported && !!data;
}

/**
 * An asset's holders at `round` (default: the latest), in address order, a
 * batch at a time. Every batch is read at the first one's round, so paging on
 * while new blocks come in still lists one round's holders.
 */
export function useAssetHolders(id: number, round: number | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["timetravel-asset-holders", getTimeTravelNode()?.baseUrl, id, round ?? null];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: { round } as { round?: number; next?: string },
    getNextPageParam: (last: TTAssetHoldersPage): { round?: number; next?: string } | undefined =>
      last.nextToken ? { round: last.round, next: last.nextToken } : undefined,
    queryFn: ({ pageParam }) => getAssetHoldersPage(id, pageParam),
    // Refetching would re-read every loaded batch; the latest round shows on reload, or on reset.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
    meta,
    enabled: !!id,
  });
  /** Drops the loaded batches and reads the first again: without `round`, at the latest block. */
  const reset = useCallback(() => queryClient.resetQueries({ queryKey, exact: true }), [queryClient, queryKey.join("|")]);
  return { ...query, reset };
}

/** A page of `source`'s versions, with their values: the first batch, else `batchSize`, unless `query` says. */
function readVersions<V>(source: VersionsSource, query: VersionsQuery, batchSize = VERSIONS_BATCH_SIZE) {
  return getVersionsPage<V>(source, {
    values: true,
    limit: query.next === undefined ? VERSIONS_FIRST_BATCH_SIZE : batchSize,
    ...query,
  });
}

const versionsQueryOptions = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage: TTVersionsPage<unknown>) => lastPage["next-token"] || undefined,
  // Refetching would re-read every loaded batch; new versions show on reload.
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  meta,
};

/**
 * `bounds` in a query key. Without bounds there is nothing to read: a key of
 * its own, so the list does not show (or fetch on) the unbounded one's.
 */
function boundsKey(bounds: RoundBounds | undefined) {
  return bounds ? [bounds.min ?? null, bounds.max ?? null] : "none";
}

/**
 * `batchSize` as of the latest render, for a queryFn to read: Keep searching
 * fetches from the list's effects, before the query's observer is given the
 * queryFn of that render.
 */
function useLatestBatchSize(batchSize: number | undefined) {
  const ref = useRef(batchSize);
  ref.current = batchSize;
  return ref;
}

/**
 * The batch size for a version list filtered to fields, once the reader tells
 * it to keep searching (the callback): the node's maximum, so the search takes
 * fewer requests. Undefined (the usual sizes) before that, and again once the
 * list (`listKey`, its VersionsList key) changes.
 */
export function useSearchBatchSize(
  listKey: string,
  filter: VersionFilter | undefined,
): [number | undefined, () => void] {
  const [searchedOn, setSearchedOn] = useState<string>();
  const batchSize = searchedOn === listKey && filter?.fields.length ? VERSIONS_SEARCH_BATCH_SIZE : undefined;
  const keepSearching = useCallback(() => setSearchedOn(listKey), [listKey]);
  return [batchSize, keepSearching];
}

/**
 * A version feed of an app's: its params (those that changed global state
 * key `key` alone, where set), the changes of all its boxes, or one box's
 * versions.
 */
type AppFeed = { kind: "params"; key?: string } | { kind: "boxes" } | { kind: "box"; name: string };

/**
 * The feeds an app's version list reads: of `object` (an objKey) alone where
 * it names one, else the params, and with `includeBoxes` the box changes too.
 * `key`: the params' versions that changed that global state key (base64), for
 * a list of the app's alone.
 */
function appFeeds(includeBoxes: boolean, object: string | undefined, key?: string): AppFeed[] {
  const ref = object ? parseObjKey(object) : undefined;
  if (ref?.kind === "box") return [{ kind: "box", name: String(ref.id) }];
  if (ref?.kind === "app" || !includeBoxes) return [key === undefined ? { kind: "params" } : { kind: "params", key }];
  return [{ kind: "params" }, { kind: "boxes" }];
}

/** A page of one feed, its versions as TTAppStateVersions. */
async function getAppFeedPage(
  appId: number,
  feed: AppFeed,
  query: VersionsQuery,
  batchSize: number | undefined,
): Promise<TTVersionsPage<TTAppStateVersion>> {
  switch (feed.kind) {
    case "params": {
      const { key } = feed;
      return readVersions<TTAppVersion>(
        (algod) => (key === undefined ? algod.getApplicationVersions(appId) : algod.getApplicationVersions(appId).key(nameBytes(key))),
        query,
        batchSize,
      );
    }
    case "boxes":
      return readVersions<TTBoxesVersion>((algod) => algod.getApplicationBoxesVersions(appId), query, batchSize);
    case "box": {
      const name = nameBytes(feed.name);
      const page = await readVersions<TTBoxVersion>((algod) => algod.getApplicationBoxVersions(appId, name), query, batchSize);
      return {
        ...page,
        versions: page.versions.map(({ round, timestamp, deleted, value }) => ({
          round,
          timestamp,
          boxes: [{ name: feed.name, deleted, value }],
        })),
      };
    }
  }
}

type AppVersionsCursor = MergedCursor<TTAppStateVersion>;

/**
 * An application's versions in the rounds of `bounds` (default: all of them;
 * none while undefined), in `order`, a batch at a time; after the first,
 * `batchSize` (default: the usual). With `includeBoxes`, each version holds
 * the box changes of its round too, and rounds that changed only boxes are
 * versions as well; with `object` (an objKey: `app`, or `box:<name>`), only
 * that object's versions. With `key` (base64; see filterStateKey), on a
 * list of the app's alone, only the versions that changed that global state
 * key: with gaps between them (see buildRows).
 */
export function useAppVersions(
  id: number,
  bounds: RoundBounds | undefined,
  order: VersionsOrder,
  batchSize?: number,
  includeBoxes = false,
  object?: string,
  key?: string,
) {
  const batchSizeRef = useLatestBatchSize(batchSize);
  const feeds = appFeeds(includeBoxes, object, key);
  return useInfiniteQuery({
    ...versionsQueryOptions,
    initialPageParam: undefined as AppVersionsCursor | undefined,
    getNextPageParam: (lastPage: MergedPage<TTAppStateVersion>) => (lastPage.more ? lastPage.cursor : undefined),
    queryKey: ["timetravel-app-versions", getTimeTravelNode()?.baseUrl, id, boundsKey(bounds), order, feeds],
    queryFn: ({ pageParam }) =>
      readMergedPage(
        feeds.length,
        (feed, query) => getAppFeedPage(id, feeds[feed], query, batchSizeRef.current),
        bounds!,
        order,
        pageParam,
      ),
    enabled: !!id && !!bounds,
  });
}

/**
 * An asset's versions (its params' changes, creation and destruction) in the
 * rounds of `bounds` (default: all of them; none while undefined), in
 * `order`, a batch at a time; after the first, `batchSize` (default: the usual).
 */
export function useAssetVersions(id: number, bounds: RoundBounds | undefined, order: VersionsOrder, batchSize?: number) {
  const batchSizeRef = useLatestBatchSize(batchSize);
  return useInfiniteQuery({
    ...versionsQueryOptions,
    queryKey: ["timetravel-asset-versions", getTimeTravelNode()?.baseUrl, id, boundsKey(bounds), order],
    queryFn: ({ pageParam }) =>
      readVersions<TTAssetVersion>((algod) => algod.getAssetVersions(id), {
        next: pageParam,
        minRound: bounds?.min,
        maxRound: bounds?.max,
        order,
      }, batchSizeRef.current),
    enabled: !!id && !!bounds,
  });
}

/** A box's versions (`name` in base64) up to `maxRound` (default: the latest), in `order`, a batch at a time. */
export function useBoxVersions(appId: number, name: string | undefined, maxRound: number | undefined, order: VersionsOrder) {
  return useInfiniteQuery({
    ...versionsQueryOptions,
    queryKey: ["timetravel-box-versions", getTimeTravelNode()?.baseUrl, appId, name, maxRound, order],
    queryFn: ({ pageParam }) =>
      readVersions<TTBoxVersion>((algod) => algod.getApplicationBoxVersions(appId, nameBytes(name!)), {
        limit: BOX_VERSIONS_BATCH_SIZE,
        next: pageParam,
        maxRound,
        order,
      }),
    enabled: !!appId && !!name,
  });
}

/**
 * Where an account's versions are listed, and what to leave out: all of it,
 * or of `object` (an objKey) alone. A holding and the asset's params (where
 * the account created it) share a list, as do local state and app params;
 * neither list leaves anything out. `key`: of a local state, the versions
 * that changed that key (base64) alone, which list the local state only.
 * `id` names the list, for query keys.
 */
function accountVersionsRequest(
  address: string,
  includeCreatedParams: boolean,
  object: string | undefined,
  key?: string,
): { id: string; source: VersionsSource } {
  const ref = object ? parseObjKey(object) : undefined;
  switch (ref?.kind) {
    case "base":
      return { id: `${address}:base`, source: (algod) => algod.accountVersions(address).exclude("all") };
    case "asset":
    case "created-asset": {
      const assetId = Number(ref.id);
      return { id: `${address}:asset:${assetId}`, source: (algod) => algod.accountAssetVersions(address, assetId) };
    }
    case "local":
    case "created-app": {
      const appId = Number(ref.id);
      if (ref.kind === "local" && key !== undefined) {
        return {
          id: `${address}:app:${appId}:key:${key}`,
          source: (algod) => algod.accountApplicationVersions(address, appId).key(nameBytes(key)),
        };
      }
      return { id: `${address}:app:${appId}`, source: (algod) => algod.accountApplicationVersions(address, appId) };
    }
    default:
      return includeCreatedParams
        ? { id: address, source: (algod) => algod.accountVersions(address) }
        : {
            id: `${address}:no-created-params`,
            source: (algod) => algod.accountVersions(address).exclude("created-apps-params", "created-assets-params"),
          };
  }
}

/**
 * An account's versions in the rounds of `bounds` (default: all of them; none
 * while undefined), in `order`, a batch at a time; with `object` (an objKey),
 * the versions of the lists that object is in (see accountVersionsRequest).
 * Without `includeCreatedParams`, every global state change of an app the
 * account created would be a version of the account too. After the first
 * batch, `batchSize` at a time (default: the usual). With `key` (base64; see
 * filterStateKey) and a local state `object`, only the versions that changed
 * that key: with gaps between them (see buildRows).
 */
export function useAccountVersions(
  address: string,
  includeCreatedParams: boolean,
  bounds: RoundBounds | undefined,
  order: VersionsOrder,
  object?: string,
  batchSize?: number,
  key?: string,
) {
  const batchSizeRef = useLatestBatchSize(batchSize);
  // Keyed by the request: objects sharing a list share its versions.
  const { id, source } = accountVersionsRequest(address, includeCreatedParams, object, key);
  return useInfiniteQuery({
    ...versionsQueryOptions,
    queryKey: ["timetravel-account-versions", getTimeTravelNode()?.baseUrl, id, boundsKey(bounds), order],
    queryFn: ({ pageParam }) =>
      readVersions<TTAccountVersion>(source, {
        next: pageParam,
        minRound: bounds?.min,
        maxRound: bounds?.max,
        order,
      }, batchSizeRef.current),
    enabled: !!address && !!bounds,
  });
}

/** Reads a baselineRequest; useBaselines and useObjectAt share what it caches. */
function atRoundQuery(baseUrl: string | undefined, req: AtRoundRead) {
  return {
    queryKey: ["timetravel-at-round", baseUrl, req],
    queryFn: () => readAtRound(req),
    // State at a past round never changes.
    staleTime: Infinity,
    meta,
  };
}

/** `ref`'s state at `round`; nothing is read while `round` is undefined. */
export function useObjectAt(ctx: BaselineContext, ref: ObjRef, round: number | undefined) {
  const baseUrl = getTimeTravelNode()?.baseUrl;
  const { data, error, status } = useQuery({
    ...atRoundQuery(baseUrl, baselineRequest(ctx, ref, round ?? 0)),
    enabled: round !== undefined,
  });
  const state = useMemo(() => (status === "success" ? extractBaseline(ctx, ref, data) : undefined), [status, data, ctx, ref]);
  return { state, error };
}

const everyRow = () => true;

/**
 * Whether a version list of `ctx` can read the whole of a version, for one
 * filtered to an object: an account's, or an app's with its boxes (without
 * them, the app is all there is).
 */
export function readsWholeVersions(ctx: BaselineContext): boolean {
  return ctx.kind === "account" || (ctx.kind === "app" && ctx.includeBoxes);
}

/** Reads every object `ctx`'s version at `round` touched; none where it has no version then. */
function versionAtQuery(ctx: BaselineContext, baseUrl: string | undefined, round: number) {
  const common = { staleTime: Infinity, meta };
  if (ctx.kind === "account") {
    const { id, source } = accountVersionsRequest(ctx.address, ctx.includeCreatedParams, undefined);
    return {
      ...common,
      queryKey: ["timetravel-account-version-at", baseUrl, id, round],
      queryFn: async (): Promise<Touch[]> => {
        const page = await readVersions<TTAccountVersion>(source, { minRound: round, maxRound: round });
        const version = page.versions.find((v) => v.round === round);
        return version ? accountVersionTouches(version, ctx.includeCreatedParams) : [];
      },
    };
  }
  const appId = ctx.kind === "app" ? ctx.appId : 0;
  const feeds = appFeeds(true, undefined);
  return {
    ...common,
    queryKey: ["timetravel-app-version-at", baseUrl, appId, round],
    queryFn: async (): Promise<Touch[]> => {
      const read = (feed: number, query: Parameters<FeedReader<TTAppStateVersion>>[1]) =>
        getAppFeedPage(appId, feeds[feed], query, undefined);
      const page = await readMergedPage(feeds.length, read, { min: round, max: round }, "desc", undefined);
      const version = page.versions.find((v) => v.round === round);
      return version ? appVersionTouches(version) : [];
    },
  };
}

/**
 * The whole of a record's versions at `rounds`, besides `object` (an
 * objKey): what each did to every other object, with their previous states.
 * For a list of one object's versions, which hold only its part. A round is
 * in `byRound` once its version is; each object's previous state is read on
 * its own, since the versions between them are not loaded. Reads nothing
 * where `ctx` has no whole versions to read (see readsWholeVersions).
 */
export function useVersionsAt(
  ctx: BaselineContext,
  rounds: number[],
  object: string | undefined,
): { byRound: Map<number, RowObject[]>; errors: Map<number, Error> } {
  const baseUrl = getTimeTravelNode()?.baseUrl;
  const results = useQueries({
    queries: (readsWholeVersions(ctx) ? rounds : []).map((round) => versionAtQuery(ctx, baseUrl, round)),
  });
  const signature = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join(",");

  // Each fetched round's touches, and what they need: `row` indexes `touched`.
  const { touched, errors, needs } = useMemo(() => {
    const touched: { round: number; touches: Touch[] }[] = [];
    const errors = new Map<number, Error>();
    results.forEach((r, i) => {
      const round = rounds[i];
      if (r.status === "error") errors.set(round, r.error as Error);
      if (r.status !== "success") return;
      touched.push({ round, touches: r.data.filter((t) => t.key !== object) });
    });
    const needs = touched.flatMap(({ round, touches }, row) =>
      touches.map((t) => ({ key: t.key, ref: t.ref, round: round - 1, row })),
    );
    return { touched, errors, needs };
    // results is a new array every render; signature captures what matters.
  }, [signature, rounds.join(","), object]);

  const baselines = useBaselines(ctx, needs, everyRow, true);
  const byRound = useMemo(() => {
    const byRound = new Map<number, RowObject[]>();
    for (const { round, touches } of touched) {
      byRound.set(
        round,
        touches.map((touch) => {
          const need = { key: touch.key, ref: touch.ref, round: round - 1, row: 0 };
          const baseline = baselines.get(baselineId(need));
          return baseline instanceof Error
            ? { ...touch, before: undefined, baseline: need, baselineError: baseline.message }
            : { ...touch, before: baseline, baseline: need };
        }),
      );
    }
    return byRound;
  }, [touched, baselines]);
  return { byRound, errors };
}

/**
 * The version list `ctx`'s object `key` (an objKey) is in, to read it as of
 * a round (see readVersionAsOf), and the touches of an entry of it. `id`
 * names the list, for query keys.
 */
function asOfList(
  ctx: BaselineContext,
  key: string,
): { id: string; source: VersionsSource; touches: (entry: any) => Touch[] } {
  if (ctx.kind === "account") {
    const { id, source } = accountVersionsRequest(ctx.address, ctx.includeCreatedParams, key);
    return { id, source, touches: (v: TTAccountVersion) => accountVersionTouches(v, ctx.includeCreatedParams) };
  }
  if (ctx.kind === "asset") {
    const { assetId } = ctx;
    return { id: `asset:${assetId}`, source: (algod) => algod.getAssetVersions(assetId), touches: assetVersionTouches };
  }
  const { appId } = ctx;
  const ref = parseObjKey(key);
  const name = ctx.kind === "box" ? ctx.name : ref?.kind === "box" ? String(ref.id) : undefined;
  if (name === undefined) {
    return { id: `app:${appId}`, source: (algod) => algod.getApplicationVersions(appId), touches: appVersionTouches };
  }
  return {
    id: `app:${appId}:box:${name}`,
    source: (algod) => algod.getApplicationBoxVersions(appId, nameBytes(name)),
    touches:
      ctx.kind === "box"
        ? boxVersionTouches
        : ({ round, timestamp, deleted, value }: TTBoxVersion) =>
            appVersionTouches({ round, timestamp, boxes: [{ name, deleted, value }] }),
  };
}

/**
 * A need's state as of its round, from its object's version list: the needs
 * of a render on the same list go as one request.
 */
function asOfQuery(ctx: BaselineContext, baseUrl: string | undefined, need: BaselineNeed) {
  const { id, source } = asOfList(ctx, need.key);
  return {
    queryKey: ["timetravel-as-of", baseUrl, id, need.round],
    queryFn: () => readVersionAsOf<unknown>(`${baseUrl}|${id}`, source, need.round),
    staleTime: Infinity,
    meta,
  };
}

/** In an as-of entry, the need's object's state; none where it did not exist then. */
function asOfBaseline(ctx: BaselineContext, need: BaselineNeed, entry: unknown): Snapshot {
  return (
    asOfList(ctx, need.key)
      .touches(entry)
      .find((t) => t.key === need.key)?.after ?? null
  );
}

/**
 * Reads each needed object's state at its round, for the `shown` rows; the
 * same request is sent once. The others get any state an earlier read left in
 * the cache, so a row that stops being shown keeps what it had. `batched`:
 * read from each object's version list as of the rounds, one request for all
 * a render needs of it - for rows that each need their own.
 */
function useBaselines(
  ctx: BaselineContext,
  needs: BaselineNeed[],
  shown: (row: number) => boolean,
  batched: boolean,
): Baselines {
  const queryClient = useQueryClient();
  const baseUrl = getTimeTravelNode()?.baseUrl;

  const requests = useMemo(() => {
    type Query = ReturnType<typeof asOfQuery> | ReturnType<typeof atRoundQuery>;
    const byKey = new Map<string, { query: Query; wanted: boolean }>();
    const keyOf = new Map<string, string>();
    for (const need of needs) {
      const query = batched
        ? asOfQuery(ctx, baseUrl, need)
        : atRoundQuery(baseUrl, baselineRequest(ctx, need.ref, need.round));
      const key = JSON.stringify(query.queryKey);
      byKey.set(key, { query, wanted: !!byKey.get(key)?.wanted || shown(need.row) });
      keyOf.set(baselineId(need), key);
    }
    return { byKey, keyOf, wanted: [...byKey.entries()].filter(([, req]) => req.wanted) };
  }, [ctx, needs, shown, batched, baseUrl]);

  const results = useQueries({
    queries: requests.wanted.map(([, { query }]) => query),
  });

  const signature = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join(",");

  return useMemo(() => {
    const fetched = new Map(requests.wanted.map(([key], i) => [key, results[i]]));
    const baselines: Baselines = new Map();
    for (const need of needs) {
      const key = requests.keyOf.get(baselineId(need));
      const result = fetched.get(key) ?? queryClient.getQueryState(requests.byKey.get(key).query.queryKey);
      if (result?.status === "success") {
        baselines.set(
          baselineId(need),
          batched ? asOfBaseline(ctx, need, result.data) : extractBaseline(ctx, need.ref, result.data),
        );
      } else if (result?.status === "error") {
        baselines.set(baselineId(need), result.error as Error);
      }
    }
    return baselines;
    // results is a new array every render; signature captures what matters.
  }, [signature, requests, needs, ctx, queryClient, batched]);
}

/**
 * Loaded versions (in `order`) as rows of before/after pairs. Newest first,
 * the state before the oldest loaded touch of each object is read while older
 * versions remain - for the `shown` rows only: the next batch usually supplies
 * it before the others are looked at. Oldest first, every earlier version is
 * loaded before a later one, so an object's first loaded version is its first
 * ever and nothing needs reading - unless the list starts at `minRound`, where
 * the state before each object's first touch is read either way. `gaps`:
 * the node filtered the versions (see Gaps); with `whole`, every row's
 * previous states are read, as of the round before it, a request per object.
 * `touchesOf` and `shown` must be stable.
 */
export function useVersionRows<V extends { round: number; timestamp: number }>(
  ctx: BaselineContext,
  versions: V[],
  touchesOf: (v: V) => Touch[],
  hasMore: boolean,
  shown: (row: number) => boolean,
  order: VersionsOrder,
  minRound?: number,
  gaps?: Gaps,
): VersionRow<V>[] {
  // buildRows walks newest first; `row` indexes match the list only then.
  const newestFirst = useMemo(() => (order === "asc" ? [...versions].reverse() : versions), [versions, order]);
  const hasOlder = (order === "desc" && hasMore) || !!minRound;

  const needs = useMemo(() => {
    const { needs } = buildRows(newestFirst, touchesOf, hasOlder, new Map(), gaps);
    return order === "asc" ? needs.map((need) => ({ ...need, row: newestFirst.length - 1 - need.row })) : needs;
  }, [newestFirst, touchesOf, hasOlder, order, gaps]);
  const baselines = useBaselines(ctx, needs, shown, gaps === "whole");
  return useMemo(() => {
    const { rows } = buildRows(newestFirst, touchesOf, hasOlder, baselines, gaps);
    return order === "asc" ? rows.reverse() : rows;
  }, [newestFirst, touchesOf, hasOlder, baselines, order, gaps]);
}
