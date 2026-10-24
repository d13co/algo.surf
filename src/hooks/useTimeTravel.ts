import { useCallback, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { network, Networks } from "src/packages/core-sdk/constants";
import {
  getTimeTravelNode,
  TimeTravelError,
  ttGet,
  TTAccountVersion,
  TTAppStateVersion,
  TTAppVersion,
  TTBoxesVersion,
  TTBoxVersion,
  TTVersionsPage,
  BOX_VERSIONS_BATCH_SIZE,
  VERSIONS_BATCH_SIZE,
  VERSIONS_FIRST_BATCH_SIZE,
  VERSIONS_SEARCH_BATCH_SIZE,
  RoundBounds,
  VersionsOrder,
} from "src/utils/timeTravel";
import {
  accountVersionTouches,
  appVersionTouches,
  BaselineContext,
  BaselineNeed,
  Baselines,
  baselineId,
  baselineRequest,
  buildRows,
  extractBaseline,
  ObjRef,
  RowObject,
  Touch,
  VersionRow,
} from "src/utils/versionDelta";
import { parseObjKey, VersionFilter } from "src/utils/versionFilter";
import { FeedReader, MergedCursor, MergedPage, readMergedPage } from "src/utils/mergeVersionFeeds";

const ZERO_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

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
      let versions: unknown;
      let params: { "genesis-id": string } | null;
      try {
        [versions, params] = await Promise.all([
          ttGet(`/v2/accounts/${ZERO_ADDRESS}/versions`, { limit: 1 }),
          ttGet<{ "genesis-id": string }>("/v2/transactions/params"),
        ]);
      } catch (e) {
        // Resolved rather than thrown: a failed query would be retried by
        // every component that mounts next.
        console.warn(`${node.baseUrl} is unreachable: ${(e as Error).message}`);
        return false;
      }
      if (!versions) {
        console.warn(`${node.baseUrl} does not serve version histories (is EnableTimeTravel on?)`);
        return false;
      }
      const genesisId = params?.["genesis-id"] ?? "";
      if (network !== Networks.Localnet && !genesisId.toLowerCase().startsWith(network.toLowerCase())) {
        console.warn(`${node.baseUrl} follows ${genesisId}, not ${network}: ignoring it`);
        return false;
      }
      return true;
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

async function getVersionsPage<V>(
  path: string,
  query: Record<string, string | number | undefined>,
  batchSize = VERSIONS_BATCH_SIZE,
  notServed = "This node does not serve version histories",
) {
  const page = await ttGet<TTVersionsPage<V>>(path, {
    include: "values",
    limit: query.next === undefined ? VERSIONS_FIRST_BATCH_SIZE : batchSize,
    ...query,
  });
  if (!page) {
    throw new TimeTravelError(notServed, 404);
  }
  return page;
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

/** A version feed of an app's: its params, the changes of all its boxes, or one box's versions. */
type AppFeed = { kind: "params" } | { kind: "boxes" } | { kind: "box"; name: string };

/**
 * The feeds an app's version list reads: of `object` (an objKey) alone where
 * it names one, else the params, and with `includeBoxes` the box changes too.
 */
function appFeeds(includeBoxes: boolean, object: string | undefined): AppFeed[] {
  const ref = object ? parseObjKey(object) : undefined;
  if (ref?.kind === "box") return [{ kind: "box", name: String(ref.id) }];
  if (ref?.kind === "app" || !includeBoxes) return [{ kind: "params" }];
  return [{ kind: "params" }, { kind: "boxes" }];
}

/** A page of one feed, its versions as TTAppStateVersions. */
async function getAppFeedPage(
  appId: number,
  feed: AppFeed,
  query: Record<string, string | number | undefined>,
  batchSize: number | undefined,
): Promise<TTVersionsPage<TTAppStateVersion>> {
  const app = `/v2/applications/${appId}`;
  switch (feed.kind) {
    case "params":
      return getVersionsPage<TTAppVersion>(`${app}/versions`, query, batchSize);
    case "boxes":
      return getVersionsPage<TTBoxesVersion>(`${app}/boxes/versions`, query, batchSize, "This node does not serve box change histories");
    case "box": {
      const page = await getVersionsPage<TTBoxVersion>(`${app}/box/versions`, { ...query, name: `b64:${feed.name}` }, batchSize);
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
 * that object's versions.
 */
export function useAppVersions(
  id: number,
  bounds: RoundBounds | undefined,
  order: VersionsOrder,
  batchSize?: number,
  includeBoxes = false,
  object?: string,
) {
  const batchSizeRef = useLatestBatchSize(batchSize);
  const feeds = appFeeds(includeBoxes, object);
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

/** A box's versions (`name` in base64) up to `maxRound` (default: the latest), in `order`, a batch at a time. */
export function useBoxVersions(appId: number, name: string | undefined, maxRound: number | undefined, order: VersionsOrder) {
  return useInfiniteQuery({
    ...versionsQueryOptions,
    queryKey: ["timetravel-box-versions", getTimeTravelNode()?.baseUrl, appId, name, maxRound, order],
    queryFn: ({ pageParam }) =>
      getVersionsPage<TTBoxVersion>(`/v2/applications/${appId}/box/versions`, {
        name: `b64:${name}`,
        limit: BOX_VERSIONS_BATCH_SIZE,
        next: pageParam,
        "max-round": maxRound,
        order,
      }),
    enabled: !!appId && !!name,
  });
}

/**
 * Where an account's versions are listed, and what to leave out: all of it,
 * or of `object` (an objKey) alone. A holding and the asset's params (where
 * the account created it) share a list, as do local state and app params;
 * neither list leaves anything out.
 */
function accountVersionsRequest(address: string, includeCreatedParams: boolean, object: string | undefined) {
  const account = `/v2/accounts/${address}`;
  const ref = object ? parseObjKey(object) : undefined;
  switch (ref?.kind) {
    case "base":
      return { path: `${account}/versions`, exclude: "all" };
    case "asset":
    case "created-asset":
      return { path: `${account}/assets/${ref.id}/versions` };
    case "local":
    case "created-app":
      return { path: `${account}/applications/${ref.id}/versions` };
    default:
      return {
        path: `${account}/versions`,
        exclude: includeCreatedParams ? undefined : "created-apps-params,created-assets-params",
      };
  }
}

/**
 * An account's versions in the rounds of `bounds` (default: all of them; none
 * while undefined), in `order`, a batch at a time; with `object` (an objKey),
 * the versions of the lists that object is in (see accountVersionsRequest).
 * Without `includeCreatedParams`, every global state change of an app the
 * account created would be a version of the account too. After the first
 * batch, `batchSize` at a time (default: the usual).
 */
export function useAccountVersions(
  address: string,
  includeCreatedParams: boolean,
  bounds: RoundBounds | undefined,
  order: VersionsOrder,
  object?: string,
  batchSize?: number,
) {
  const batchSizeRef = useLatestBatchSize(batchSize);
  // Keyed by the request: objects sharing a list share its versions.
  const { path, exclude } = accountVersionsRequest(address, includeCreatedParams, object);
  return useInfiniteQuery({
    ...versionsQueryOptions,
    queryKey: ["timetravel-account-versions", getTimeTravelNode()?.baseUrl, path, exclude, boundsKey(bounds), order],
    queryFn: ({ pageParam }) =>
      getVersionsPage<TTAccountVersion>(path, {
        next: pageParam,
        "min-round": bounds?.min,
        "max-round": bounds?.max,
        order,
        exclude,
      }, batchSizeRef.current),
    enabled: !!address && !!bounds,
  });
}

type AtRoundRequest = { path: string; query: Record<string, string | number> };

/** Reads a baselineRequest; useBaselines and useObjectAt share what it caches. */
function atRoundQuery(baseUrl: string | undefined, req: AtRoundRequest) {
  return {
    queryKey: ["timetravel-at-round", baseUrl, req.path, req.query],
    queryFn: () => ttGet(req.path, req.query),
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
    const { path, exclude } = accountVersionsRequest(ctx.address, ctx.includeCreatedParams, undefined);
    return {
      ...common,
      queryKey: ["timetravel-account-version-at", baseUrl, path, exclude, round],
      queryFn: async (): Promise<Touch[]> => {
        const page = await getVersionsPage<TTAccountVersion>(path, { "min-round": round, "max-round": round, exclude });
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

  const baselines = useBaselines(ctx, needs, everyRow);
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
 * Reads each needed object's state at its round, for the `shown` rows; the
 * same request is sent once. The others get any state an earlier read left in
 * the cache, so a row that stops being shown keeps what it had.
 */
function useBaselines(ctx: BaselineContext, needs: BaselineNeed[], shown: (row: number) => boolean): Baselines {
  const queryClient = useQueryClient();
  const baseUrl = getTimeTravelNode()?.baseUrl;

  const requests = useMemo(() => {
    const byKey = new Map<string, { path: string; query: Record<string, string | number>; wanted: boolean }>();
    const keyOf = new Map<string, string>();
    for (const need of needs) {
      const req = baselineRequest(ctx, need.ref, need.round);
      const key = `${req.path}?${new URLSearchParams(req.query as Record<string, string>)}`;
      byKey.set(key, { ...req, wanted: !!byKey.get(key)?.wanted || shown(need.row) });
      keyOf.set(baselineId(need), key);
    }
    return { byKey, keyOf, wanted: [...byKey.entries()].filter(([, req]) => req.wanted) };
  }, [ctx, needs, shown]);

  const queryKeyOf = (req: AtRoundRequest) => atRoundQuery(baseUrl, req).queryKey;

  const results = useQueries({
    queries: requests.wanted.map(([, req]) => atRoundQuery(baseUrl, req)),
  });

  const signature = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join(",");

  return useMemo(() => {
    const fetched = new Map(requests.wanted.map(([key], i) => [key, results[i]]));
    const baselines: Baselines = new Map();
    for (const need of needs) {
      const key = requests.keyOf.get(baselineId(need));
      const result = fetched.get(key) ?? queryClient.getQueryState(queryKeyOf(requests.byKey.get(key)));
      if (result?.status === "success") {
        baselines.set(baselineId(need), extractBaseline(ctx, need.ref, result.data));
      } else if (result?.status === "error") {
        baselines.set(baselineId(need), result.error as Error);
      }
    }
    return baselines;
    // results is a new array every render; signature captures what matters.
  }, [signature, requests, needs, ctx, queryClient, baseUrl]);
}

/**
 * Loaded versions (in `order`) as rows of before/after pairs. Newest first,
 * the state before the oldest loaded touch of each object is read while older
 * versions remain - for the `shown` rows only: the next batch usually supplies
 * it before the others are looked at. Oldest first, every earlier version is
 * loaded before a later one, so an object's first loaded version is its first
 * ever and nothing needs reading - unless the list starts at `minRound`, where
 * the state before each object's first touch is read either way. `touchesOf`
 * and `shown` must be stable.
 */
export function useVersionRows<V extends { round: number; timestamp: number }>(
  ctx: BaselineContext,
  versions: V[],
  touchesOf: (v: V) => Touch[],
  hasMore: boolean,
  shown: (row: number) => boolean,
  order: VersionsOrder,
  minRound?: number,
): VersionRow<V>[] {
  // buildRows walks newest first; `row` indexes match the list only then.
  const newestFirst = useMemo(() => (order === "asc" ? [...versions].reverse() : versions), [versions, order]);
  const hasOlder = (order === "desc" && hasMore) || !!minRound;

  const needs = useMemo(() => {
    const { needs } = buildRows(newestFirst, touchesOf, hasOlder, new Map());
    return order === "asc" ? needs.map((need) => ({ ...need, row: newestFirst.length - 1 - need.row })) : needs;
  }, [newestFirst, touchesOf, hasOlder, order]);
  const baselines = useBaselines(ctx, needs, shown);
  return useMemo(() => {
    const { rows } = buildRows(newestFirst, touchesOf, hasOlder, baselines);
    return order === "asc" ? rows.reverse() : rows;
  }, [newestFirst, touchesOf, hasOlder, baselines, order]);
}
