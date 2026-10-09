import { useMemo } from "react";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { network, Networks } from "src/packages/core-sdk/constants";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import {
  getTimeTravelNode,
  TimeTravelError,
  ttGet,
  TTAccountVersion,
  TTAppVersion,
  TTBoxVersion,
  TTVersionsPage,
  BOX_VERSIONS_BATCH_SIZE,
  VERSIONS_BATCH_SIZE,
  VERSIONS_FIRST_BATCH_SIZE,
  VersionsOrder,
} from "src/utils/timeTravel";
import {
  BaselineContext,
  BaselineNeed,
  Baselines,
  baselineId,
  baselineRequest,
  buildRows,
  extractBaseline,
  Touch,
  VersionRow,
} from "src/utils/versionDelta";

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

async function getVersionsPage<V>(path: string, query: Record<string, string | number | undefined>) {
  const page = await ttGet<TTVersionsPage<V>>(path, {
    include: "values",
    limit: query.next === undefined ? VERSIONS_FIRST_BATCH_SIZE : VERSIONS_BATCH_SIZE,
    ...query,
  });
  if (!page) {
    throw new TimeTravelError("This node does not serve version histories", 404);
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

/** The order version lists show in: newest first unless switched, remembered across visits. */
export function useVersionsOrder(): [VersionsOrder, (order: VersionsOrder) => void] {
  const [oldestFirst, setOldestFirst] = usePersistenBooleanState("versions-oldest-first", false);
  return [oldestFirst ? "asc" : "desc", (order) => setOldestFirst(order === "asc")];
}

/** An application's versions up to `maxRound` (default: the latest), in `order`, a batch at a time. */
export function useAppVersions(id: number, maxRound: number | undefined, order: VersionsOrder) {
  return useInfiniteQuery({
    ...versionsQueryOptions,
    queryKey: ["timetravel-app-versions", getTimeTravelNode()?.baseUrl, id, maxRound, order],
    queryFn: ({ pageParam }) =>
      getVersionsPage<TTAppVersion>(`/v2/applications/${id}/versions`, {
        next: pageParam,
        "max-round": maxRound,
        order,
      }),
    enabled: !!id,
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
 * An account's versions up to `maxRound` (default: the latest), in `order`,
 * a batch at a time. Without `includeCreatedParams`, every global state change
 * of an app the account created would be a version of the account too.
 */
export function useAccountVersions(
  address: string,
  includeCreatedParams: boolean,
  maxRound: number | undefined,
  order: VersionsOrder,
) {
  return useInfiniteQuery({
    ...versionsQueryOptions,
    queryKey: ["timetravel-account-versions", getTimeTravelNode()?.baseUrl, address, includeCreatedParams, maxRound, order],
    queryFn: ({ pageParam }) =>
      getVersionsPage<TTAccountVersion>(`/v2/accounts/${address}/versions`, {
        next: pageParam,
        "max-round": maxRound,
        order,
        exclude: includeCreatedParams ? undefined : "created-apps-params,created-assets-params",
      }),
    enabled: !!address,
  });
}

/** Reads each needed object's state at its round; the same request is sent once. */
function useBaselines(ctx: BaselineContext, needs: BaselineNeed[]): Baselines {
  const baseUrl = getTimeTravelNode()?.baseUrl;

  const requests = useMemo(() => {
    const byKey = new Map<string, { path: string; query: Record<string, string | number> }>();
    const keyOf = new Map<string, string>();
    for (const need of needs) {
      const req = baselineRequest(ctx, need.ref, need.round);
      const key = `${req.path}?${new URLSearchParams(req.query as Record<string, string>)}`;
      byKey.set(key, req);
      keyOf.set(baselineId(need), key);
    }
    return { list: [...byKey.entries()], keyOf };
  }, [ctx, needs]);

  const results = useQueries({
    queries: requests.list.map(([, req]) => ({
      queryKey: ["timetravel-at-round", baseUrl, req.path, req.query],
      queryFn: () => ttGet(req.path, req.query),
      // State at a past round never changes.
      staleTime: Infinity,
      meta,
    })),
  });

  const signature = results.map((r) => `${r.status}:${r.dataUpdatedAt}`).join(",");

  return useMemo(() => {
    const byKey = new Map(requests.list.map(([key], i) => [key, results[i]]));
    const baselines: Baselines = new Map();
    for (const need of needs) {
      const result = byKey.get(requests.keyOf.get(baselineId(need)));
      if (result?.status === "success") {
        baselines.set(baselineId(need), extractBaseline(ctx, need.ref, result.data));
      } else if (result?.status === "error") {
        baselines.set(baselineId(need), result.error as Error);
      }
    }
    return baselines;
    // results is a new array every render; signature captures what matters.
  }, [signature, requests, needs, ctx]);
}

/**
 * Loaded versions (in `order`) as rows of before/after pairs. Newest first,
 * the state before the oldest loaded touch of each object is read while older
 * versions remain - for the `shown` rows only: the next batch usually supplies
 * it before the others are looked at. Oldest first, every earlier version is
 * loaded before a later one, so an object's first loaded version is its first
 * ever and nothing needs reading. `touchesOf` and `shown` must be stable.
 */
export function useVersionRows<V extends { round: number; timestamp: number }>(
  ctx: BaselineContext,
  versions: V[],
  touchesOf: (v: V) => Touch[],
  hasMore: boolean,
  shown: (row: number) => boolean,
  order: VersionsOrder,
): VersionRow<V>[] {
  // buildRows walks newest first; `row` indexes match the list only then.
  const newestFirst = useMemo(() => (order === "asc" ? [...versions].reverse() : versions), [versions, order]);
  const hasOlder = order === "desc" && hasMore;

  const needs = useMemo(
    () => buildRows(newestFirst, touchesOf, hasOlder, new Map()).needs.filter((need) => shown(need.row)),
    [newestFirst, touchesOf, hasOlder, shown],
  );
  const baselines = useBaselines(ctx, needs);
  return useMemo(() => {
    const { rows } = buildRows(newestFirst, touchesOf, hasOlder, baselines);
    return order === "asc" ? rows.reverse() : rows;
  }, [newestFirst, touchesOf, hasOlder, baselines, order]);
}
