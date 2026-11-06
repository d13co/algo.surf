import { base64ToBytes, decodeAddress } from "algosdk";
import { addressLsigAddress, nameLsigAddress, type NfdGhostSDK, type NfdRecord } from "nfd-ghost-sdk";
import explorer from "src/utils/dappflow";
import { abel, abelTinyToAssetTiny } from "src/packages/abel/abel";
import { getAbelAt } from "src/packages/abel/abelAt";
import AssetCache from "src/components/Common/AssetCache";
import type { A_AssetTiny } from "src/packages/core-sdk/types";
import { roundAsOfTime } from "src/utils/dateToRound";
import { roundTimes } from "src/utils/roundTimes";
import {
  getDTAlgod,
  getVersionsPages,
  TTAccountVersion,
  TTAppVersion,
  TTBoxesVersion,
  TTBoxVersion,
  TTVersionsPage,
  VersionsQuery,
  VersionsSource,
} from "src/utils/timeTravel";

/**
 * An account's NFD history: the NFDs that listed it as a verified address, and
 * the NFDs it owned, with the rounds each started and ended.
 *
 * "Listed" and "owned" are what nfd-ghost-sdk answers at a round:
 * `reverseLookup`, and `getRecord` non-null with `owner` the account. The
 * time-travel node's version feeds give the rounds at which those answers can
 * change; the SDK's queries say what they are at those rounds.
 *
 * - Links: the registry's reverse box (`sha256("addr/algo/" ‖ pubkey)`) and
 *   the v1 address lsig's `i.apps0..15` list the candidates over time. Their
 *   rounds, the candidates' own link rounds while listed (app keys, and v2/v3
 *   `v.caAlgo.` boxes) and the rounds they expire at are validated with
 *   `reverseLookupSeries`.
 * - Ownership: the registry's `"O" ‖ owner ‖ appId` owner boxes (every box ever
 *   written, deletions included), the link candidates, and (stage 2) the NFD
 *   assets the account ever held are candidates. `getRecordsAt` at each
 *   candidate's ownership rounds, then at the rounds the registry's naming of
 *   the NFDs it owned changed, gives exact ownership periods.
 *
 * See NFD-HISTORY.md.
 */

export type NfdRole = "owner" | "primary" | "linked";

/** Why a period ended. */
export type NfdPeriodEnd =
  | "removed" // no longer a verified address
  | "expired"
  | "forSale"
  | "deleted" // the app is gone, or no longer the NFD its registry names
  | "transferred" // owned by another account
  | "primaryChanged"; // still linked, but as or no longer as the primary NFD

export type NfdPeriod = {
  appId: number;
  name: string;
  role: NfdRole;
  /** The first round of the period */
  from: number;
  /** The round it ended at; none while it lasts */
  to?: number;
  end?: NfdPeriodEnd;
};

export type NfdHistoryStats = {
  /** Version feed pages read from the time-travel node */
  requests: number;
  linkCandidates: number;
  ownerCandidates: number;
  /** Rounds the reverse lookup was validated at */
  linkRounds: number;
  /** (NFD, round) pairs read for ownership and end reasons */
  recordPairs: number;
  ms: number;
};

export type NfdHistory = {
  periods: NfdPeriod[];
  latestRound: number;
  /** The NFD apps checked for ownership: stage 2 skips them. */
  candidates: number[];
  /** Every round the reverse lookup or a record was read at (for scripts/nfd-history-check.ts) */
  checkedRounds: number[];
  /** Block timestamps (Unix seconds) of the rounds the periods start and end at, where known */
  timestamps: Map<number, number>;
  /** Things the history may miss, for the reader */
  notes: string[];
  stats: NfdHistoryStats;
};

export type LoadNfdHistoryOptions = {
  sdk: NfdGhostSDK;
  registryAppId: number;
  signal?: AbortSignal;
  onProgress?: (step: string) => void;
};

/** Version feed requests in flight at once; the SDK has its own 3 query requests, and the node answers 503 past 8. */
const FEED_CONCURRENCY = 2;
/** Versions per page: the node's maximum. */
const PAGE_LIMIT = 1000;
/** NFDs per `getRecordsAt` call: one failed query cancels its whole call, so a failure loses one batch only. */
const RECORD_BATCH_APPS = 50;
/** NFDs mint their asset 3, 6 or 7 app/asset ids after their app (DESIGN-v2 section 10). */
const ASSET_AFTER_APP_MAX = 8;

/**
 * App keys that can change whether the account owns an NFD: its owner, and its
 * name (which the registry must resolve to it). Creation and deletion count too.
 */
const OWNERSHIP_KEYS = new Set(["i.owner.a", "i.name"]);
/**
 * App keys that can change whether an NFD lists the account: those above, a
 * sale, expiry, the version (v1 keeps `caAlgo` in global state, v2/v3 in
 * boxes), and v1's `v.caAlgo.N.as`. Neither query reads `i.reservedOwner.a`,
 * `i.seller.a`, `i.timeChanged` or `u.*`: leave them out.
 */
const LINK_KEYS = new Set([...OWNERSHIP_KEYS, "i.sellamt", "i.expirationTime", "i.ver"]);
const isLinkKey = (key: string) => LINK_KEYS.has(key) || key.startsWith("v.caAlgo.");

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("latin1");

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Packed big-endian uint64 app ids, zeros (removed slots) dropped. */
function packedIds(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ids: number[] = [];
  for (let i = 0; i + 8 <= bytes.length; i += 8) {
    const id = Number(view.getBigUint64(i));
    if (id) ids.push(id);
  }
  return ids;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    while (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

/** [from, to): an id's presence in a feed. */
type Interval = { from: number; to?: number };

/** Each id's intervals of presence, from a feed's sets of ids over time (in round order). */
function presence(changes: { round: number; ids: number[] }[]): Map<number, Interval[]> {
  const out = new Map<number, Interval[]>();
  const open = new Map<number, Interval>();
  for (const { round, ids } of changes) {
    const now = new Set(ids);
    for (const [id, interval] of open) {
      if (!now.has(id)) {
        interval.to = round;
        open.delete(id);
      }
    }
    for (const id of now) {
      if (open.has(id)) continue;
      const interval: Interval = { from: round };
      open.set(id, interval);
      out.set(id, [...(out.get(id) ?? []), interval]);
    }
  }
  return out;
}

const within = (round: number, intervals: Interval[] | undefined) =>
  !!intervals?.some(({ from, to }) => round >= from && (to === undefined || round < to));

const pairKey = (appId: number, round: number) => `${appId}@${round}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What every step of a load shares: one latest round, so every feed and query agrees on "now". */
type Ctx = {
  address: string;
  sdk: NfdGhostSDK;
  registryAppId: number;
  latestRound: number;
  creationRound: number;
  signal?: AbortSignal;
  notes: string[];
  timestamps: Map<number, number>;
  stats: NfdHistoryStats;
  feed: <T>(fn: () => Promise<T>) => Promise<T>;
  /** NFD names by app, where some read has given one: for notes. */
  names: Map<number, string>;
};

async function context(
  address: string,
  { sdk, registryAppId, signal }: LoadNfdHistoryOptions,
  latestRound?: number,
): Promise<Ctx> {
  const algod = getDTAlgod();
  if (!algod) throw new Error("No time travel node configured");
  const [latest, creationRound] = await Promise.all([
    latestRound ?? algod.status().do().then(({ lastRound }) => Number(lastRound)),
    sdk.getRegistryCreationRound().then((round) => Number(round ?? 0)),
  ]);
  signal?.throwIfAborted();
  return {
    address,
    sdk,
    registryAppId,
    latestRound: latest,
    creationRound,
    signal,
    notes: [],
    timestamps: new Map(),
    stats: { requests: 0, linkCandidates: 0, ownerCandidates: 0, linkRounds: 0, recordPairs: 0, ms: 0 },
    feed: limiter(FEED_CONCURRENCY),
    names: new Map(),
  };
}

/** Every version of a feed up to the load's latest round, oldest first. */
async function readFeed<V extends { round: number; timestamp: number }>(
  ctx: Ctx,
  source: VersionsSource,
  query: Pick<VersionsQuery, "values" | "keys"> = {},
): Promise<V[]> {
  const versions: V[] = [];
  const pages = getVersionsPages<V>(
    source,
    { ...query, order: "asc", maxRound: ctx.latestRound, limit: PAGE_LIMIT },
    ctx.signal,
  );
  for (;;) {
    const page = await ctx.feed(() => pages.next());
    if (page.done) break;
    ctx.stats.requests++;
    versions.push(...(page.value as TTVersionsPage<V>).versions);
  }
  for (const v of versions) ctx.timestamps.set(v.round, v.timestamp);
  return versions;
}

/** A change to an NFD's app: `keys` absent where the node can't say which keys changed. */
type AppChange = { round: number; deleted: boolean; keys?: string[]; created: boolean };

const isOwnershipChange = (v: AppChange) =>
  v.created || v.deleted || !v.keys || v.keys.some((key) => OWNERSHIP_KEYS.has(key));
const isLinkChange = (v: AppChange) => isOwnershipChange(v) || !!v.keys?.some(isLinkKey);

/** Each app's changes that can change a link or ownership (see OWNERSHIP_KEYS, LINK_KEYS). */
async function readAppChanges(ctx: Ctx, appIds: number[]): Promise<Map<number, AppChange[]>> {
  const out = new Map<number, AppChange[]>();
  await Promise.all(
    appIds.map(async (id) => {
      const versions = await readFeed<TTAppVersion>(ctx, (a) => a.getApplicationVersions(id), { keys: true });
      out.set(
        id,
        versions
          .map((v, i) => ({
            round: v.round,
            deleted: v.deleted,
            created: i === 0 && !v.deleted,
            keys: v["changed-keys"]?.map((k) => textDecoder.decode(base64ToBytes(k))),
          }))
          .filter(isLinkChange),
      );
    }),
  );
  return out;
}

/** The rounds each app's `v.caAlgo.` boxes changed (v2/v3 keep their verified addresses there). */
async function readCaAlgoRounds(ctx: Ctx, appIds: number[]): Promise<Map<number, number[]>> {
  const prefix = textEncoder.encode("v.caAlgo.");
  const out = new Map<number, number[]>();
  await Promise.all(
    appIds.map(async (id) => {
      const versions = await readFeed<TTBoxesVersion>(ctx, (a) => a.getApplicationBoxesVersions(id).prefix(prefix));
      out.set(
        id,
        versions.map((v) => v.round),
      );
    }),
  );
  return out;
}

/** Splits `items` into lists of at most `size`. */
function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * `getRecordsAt` at every pair, about RECORD_BATCH_APPS NFDs per call: a
 * failed call becomes a note naming its NFDs, and its pairs stay unread.
 */
async function readRecords(ctx: Ctx, pairs: { appId: number; round: number }[], into: Map<string, NfdRecord | null>) {
  const todo = pairs.filter(
    ({ appId, round }) => round >= ctx.creationRound && round <= ctx.latestRound && !into.has(pairKey(appId, round)),
  );
  if (!todo.length) return;
  ctx.stats.recordPairs += todo.length;
  const byApp = new Map<number, { appId: number; round: number }[]>();
  for (const pair of todo) byApp.set(pair.appId, [...(byApp.get(pair.appId) ?? []), pair]);
  const batches = chunks([...byApp.keys()], RECORD_BATCH_APPS).map((apps) => apps.flatMap((id) => byApp.get(id)!));
  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const read = await ctx.sdk.getRecordsAt(batch, { fields: [], signal: ctx.signal });
      batch.forEach(({ appId, round }, i) => {
        into.set(pairKey(appId, round), read[i]);
        if (read[i]) ctx.names.set(appId, read[i]!.name);
      });
    }),
  );
  ctx.signal?.throwIfAborted();
  results.forEach((result, i) => {
    if (result.status === "fulfilled") return;
    const apps = [...new Set(batches[i].map((p) => p.appId))].map((id) => ctx.names.get(id) ?? `app ${id}`);
    const shown = apps.length > 5 ? `${apps.slice(0, 5).join(", ")} and ${apps.length - 5} more` : apps.join(", ");
    ctx.notes.push(
      `Ownership could not be read for ${plural(apps.length, "NFD")} (${shown}): ${(result.reason as Error).message}`,
    );
  });
}

/**
 * Owner periods for `apps` from their changes: `getRecordsAt` at every
 * ownership round, then (second pass) at the rounds the registry's naming of
 * the NFDs the account owned changed. `records` holds reads already made
 * (link end rounds), which count as samples too.
 */
async function ownerPeriods(
  ctx: Ctx,
  changes: Map<number, AppChange[]>,
  records: Map<string, NfdRecord | null>,
): Promise<NfdPeriod[]> {
  const rounds = new Map<number, Set<number>>();
  const want = (appId: number, round: number) => {
    if (round < ctx.creationRound || round > ctx.latestRound) return;
    rounds.set(appId, (rounds.get(appId) ?? new Set()).add(round));
  };
  for (const [id, versions] of changes) for (const v of versions) if (isOwnershipChange(v)) want(id, v.round);
  const pairs = () =>
    [...rounds].flatMap(([appId, set]) => [...set].map((round) => ({ appId, round })));
  await readRecords(
    ctx,
    pairs().filter(({ appId, round }) => !changes.get(appId)!.some((v) => v.round === round && v.deleted)),
    records,
  );

  // Second pass: the registry must name the NFD (its `name/` box, or for v1 the name lsig's `i.appid`)
  // for getRecord to see it, and those change in the registry, not in the app's feed.
  const owned = new Map<number, { names: Set<string>; v1: boolean }>();
  for (const [key, record] of records) {
    if (!record || record.owner !== ctx.address) continue;
    const appId = Number(key.slice(0, key.indexOf("@")));
    if (!changes.has(appId)) continue;
    const entry = owned.get(appId) ?? { names: new Set(), v1: false };
    entry.names.add(record.name);
    entry.v1 ||= record.major === 1;
    owned.set(appId, entry);
  }
  const before = pairs().length;
  const registry = ctx.registryAppId;
  const appIdKey = textEncoder.encode("i.appid");
  await Promise.all(
    [...owned].flatMap(([appId, { names, v1 }]) =>
      [...names].flatMap((name) => [
        sha256(concat(textEncoder.encode("name/"), textEncoder.encode(name))).then((box) =>
          readFeed<TTBoxVersion>(ctx, (a) => a.getApplicationBoxVersions(registry, box)).then((vs) =>
            vs.forEach((v) => want(appId, v.round)),
          ),
        ),
        ...(v1
          ? [
              readFeed<TTAccountVersion>(ctx, (a) =>
                a.accountApplicationVersions(nameLsigAddress(BigInt(registry), name), registry).key(appIdKey),
              ).then((vs) => vs.forEach((v) => want(appId, v.round))),
            ]
          : []),
      ]),
    ),
  );
  if (pairs().length > before) {
    await readRecords(
      ctx,
      pairs().filter(({ appId, round }) => !changes.get(appId)!.some((v) => v.round === round && v.deleted)),
      records,
    );
  }

  // Periods, from every record read for each app
  const periods: NfdPeriod[] = [];
  const known = new Map<number, number[]>();
  for (const key of records.keys()) {
    const at = key.indexOf("@");
    const appId = Number(key.slice(0, at));
    if (changes.has(appId)) known.set(appId, [...(known.get(appId) ?? []), Number(key.slice(at + 1))]);
  }
  for (const [id, versions] of changes) {
    const deletedAt = new Set(versions.filter((v) => v.deleted).map((v) => v.round));
    const sorted = [...new Set([...(known.get(id) ?? []), ...deletedAt])].sort((a, b) => a - b);
    let open: NfdPeriod | undefined;
    for (const round of sorted) {
      const key = pairKey(id, round);
      // A pair whose batch failed is unknown: skip it, as if it weren't sampled.
      if (!deletedAt.has(round) && !records.has(key)) continue;
      const record = deletedAt.has(round) ? null : records.get(key)!;
      const owns = !!record && record.owner === ctx.address;
      if (owns && !open) {
        open = { appId: id, name: record!.name, role: "owner", from: round };
        periods.push(open);
      } else if (!owns && open) {
        open.to = round;
        open.end = record ? "transferred" : "deleted";
        open = undefined;
      }
    }
  }
  return periods;
}

/** Block timestamps for `rounds` not in the load's map yet: the page's cache, then abel on the time-travel node. */
async function fillTimestamps(ctx: Ctx, rounds: number[]) {
  const missing = [...new Set(rounds)].filter((r) => {
    if (ctx.timestamps.has(r)) return false;
    const cached = roundTimes.get(BigInt(r));
    if (cached !== undefined) ctx.timestamps.set(r, cached);
    return cached === undefined;
  });
  const abelAt = getAbelAt();
  if (!missing.length || !abelAt) return;
  try {
    const results = await ctx.feed(() => abelAt.getBlockTimesAndTcAtRounds(missing.map(BigInt), 1));
    for (const r of results) {
      if (!r.ok || !r.value[0]) continue;
      ctx.timestamps.set(Number(r.round), r.value[0].ts);
      roundTimes.add(BigInt(r.round), r.value[0].ts);
    }
  } catch (e) {
    if (ctx.signal?.aborted) throw e;
    // the table shows the round without its time
  }
}

/**
 * Runs `load` with a signal of its own, aborted with `signal` and on the
 * first failure: the reads still running then stop instead of loading the
 * node for a result nobody gets.
 */
async function cancelOnFailure<T>(signal: AbortSignal | undefined, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal!.reason);
  if (signal?.aborted) onAbort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await load(controller.signal);
  } catch (e) {
    controller.abort(e);
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Stage 1: links, and ownership from owner boxes and link candidates. One failed feed read fails the load. */
export function loadNfdHistory(address: string, options: LoadNfdHistoryOptions): Promise<NfdHistory> {
  return cancelOnFailure(options.signal, (signal) => readNfdHistory(address, { ...options, signal }));
}

async function readNfdHistory(address: string, options: LoadNfdHistoryOptions): Promise<NfdHistory> {
  const started = Date.now();
  const { onProgress } = options;
  const ctx = await context(address, options);
  const { sdk, registryAppId, latestRound, creationRound, signal, timestamps, stats, notes } = ctx;
  const publicKey = decodeAddress(address).publicKey;

  // 1. The registry's feeds for the account: its reverse box, its v1 address lsig, and every owner box it ever had
  onProgress?.("Reading the registry's history");
  const reverseBox = await sha256(concat(textEncoder.encode("addr/algo/"), publicKey));
  const lsig = addressLsigAddress(BigInt(registryAppId), address);
  const ownerPrefix = concat(textEncoder.encode("O"), publicKey);
  const [boxFeed, lsigFeed, ownerFeed] = await Promise.all([
    readFeed<TTBoxVersion>(ctx, (a) => a.getApplicationBoxVersions(registryAppId, reverseBox), { values: true }),
    readFeed<TTAccountVersion>(ctx, (a) => a.accountApplicationVersions(lsig, registryAppId), { values: true }),
    readFeed<TTBoxesVersion>(ctx, (a) => a.getApplicationBoxesVersions(registryAppId).prefix(ownerPrefix)),
  ]);

  const boxPresence = presence(
    boxFeed.map((v) => ({ round: v.round, ids: v.deleted || !v.value ? [] : packedIds(base64ToBytes(v.value)) })),
  );
  const lsigPresence = presence(
    lsigFeed.map((v) => {
      const local = v["apps-local-state"]?.find((s) => Number(s["app-id"]) === registryAppId);
      const ids =
        !local || local.deleted
          ? []
          : (local["app-local-state"]?.["key-value"] ?? [])
              .filter(({ key }) => /^i\.apps\d+$/.test(atob(key)))
              .flatMap(({ value }) => packedIds(base64ToBytes(value.bytes)));
      return { round: v.round, ids };
    }),
  );
  const hints = new Map<number, Interval[]>();
  for (const feed of [boxPresence, lsigPresence]) {
    for (const [id, intervals] of feed) hints.set(id, [...(hints.get(id) ?? []), ...intervals]);
  }
  const linkCandidates = [...hints.keys()];

  const ownerBoxApps = new Set<number>();
  for (const v of ownerFeed) {
    for (const box of v.boxes) {
      const name = base64ToBytes(box.name);
      const id = name.length === 41 ? packedIds(name.subarray(33))[0] : undefined;
      if (id) ownerBoxApps.add(id);
    }
  }
  const candidates = [...new Set([...ownerBoxApps, ...linkCandidates])];
  stats.linkCandidates = linkCandidates.length;
  stats.ownerCandidates = candidates.length;

  // 2. Every candidate's changes, and the link candidates' caAlgo boxes
  onProgress?.(`Reading the history of ${plural(candidates.length, "NFD")}`);
  const [changes, caAlgoRounds] = await Promise.all([
    readAppChanges(ctx, candidates),
    readCaAlgoRounds(ctx, linkCandidates),
  ]);

  // 3. Links: validated at every round they can change
  onProgress?.("Checking verified addresses");
  const linkRounds = new Set<number>([latestRound]);
  for (const v of [...boxFeed, ...lsigFeed]) linkRounds.add(v.round);
  for (const id of linkCandidates) {
    const listed = hints.get(id);
    for (const v of changes.get(id) ?? []) if (within(v.round, listed)) linkRounds.add(v.round);
    for (const round of caAlgoRounds.get(id) ?? []) if (within(round, listed)) linkRounds.add(round);
  }
  const points = new Map<number, NfdRecord[]>();
  const readLinks = async (rounds: number[]) => {
    const list = [...new Set(rounds)].filter((r) => r >= creationRound && r <= latestRound && !points.has(r));
    if (!list.length) return;
    stats.linkRounds += list.length;
    // maxPoints: without it, a series stops at 1,024 points.
    const series = await sdk.reverseLookupSeries([address], list, { fields: [], maxPoints: list.length, signal });
    for (const point of series) {
      if (point.ok) {
        const records = point.value.get(address) ?? [];
        points.set(Number(point.round), records);
        for (const r of records) ctx.names.set(Number(r.appId), r.name);
      } else {
        const { error } = point as { error: Error };
        notes.push(`Verified addresses could not be read at block ${point.round}: ${error.message}`);
      }
    }
  };
  await readLinks([...linkRounds]);

  // Expiry happens in time, not in a feed. An NFD is expired once a block's timestamp reaches
  // `expiresAt`; roundAsOfTime gives the last round at or before it, so read it and the next.
  const sorted = () => [...points.keys()].sort((a, b) => a - b);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiries = new Set<number>();
  {
    const rounds = sorted();
    rounds.forEach((round, i) => {
      const until = i + 1 < rounds.length ? timestamps.get(rounds[i + 1]) ?? nowSeconds : nowSeconds;
      for (const r of points.get(round)!) {
        if (r.expiresAt && r.expiresAt <= until && r.expiresAt <= nowSeconds) expiries.add(r.expiresAt);
      }
    });
  }
  if (expiries.size) {
    const rounds = await Promise.all(
      [...expiries].map((time) =>
        ctx
          .feed(() => roundAsOfTime(time, signal))
          .then((round) => [round, round + 1].map((r) => Math.min(r, latestRound)))
          .catch((e) => {
            if (signal?.aborted) throw e;
            notes.push(`The block an NFD expired at could not be found (${(e as Error).message}): its period may end late.`);
            return [];
          }),
      ),
    );
    await readLinks(rounds.flat());
  }

  // 4. Link periods, split where the primary NFD changes
  const periods: NfdPeriod[] = [];
  const ended: { period: NfdPeriod; round: number }[] = [];
  {
    const open = new Map<number, NfdPeriod>();
    for (const round of sorted()) {
      const now = new Map(
        points.get(round)!.map((r, i) => [Number(r.appId), { record: r, role: (i === 0 ? "primary" : "linked") as NfdRole }]),
      );
      for (const [id, period] of open) {
        const still = now.get(id);
        if (still && still.role === period.role) continue;
        period.to = round;
        if (still) period.end = "primaryChanged";
        else ended.push({ period, round });
        open.delete(id);
      }
      for (const [id, { record, role }] of now) {
        if (open.has(id)) continue;
        const period: NfdPeriod = { appId: id, name: record.name, role, from: round };
        open.set(id, period);
        periods.push(period);
      }
    }
  }

  // 5. Ownership, and why links ended
  onProgress?.("Checking ownership");
  const records = new Map<string, NfdRecord | null>();
  await readRecords(
    ctx,
    ended.map(({ period, round }) => ({ appId: period.appId, round })),
    records,
  );
  for (const { period, round } of ended) {
    const key = pairKey(period.appId, round);
    if (!records.has(key)) continue; // its batch failed: noted
    const record = records.get(key);
    period.end = !record ? "deleted" : record.state === "expired" ? "expired" : record.state === "forSale" ? "forSale" : "removed";
  }
  periods.push(...(await ownerPeriods(ctx, changes, records)));

  await fillTimestamps(ctx, periods.flatMap((p) => (p.to === undefined ? [p.from] : [p.from, p.to])));
  stats.ms = Date.now() - started;
  const checkedRounds = [...new Set([...points.keys(), ...[...records.keys()].map((k) => Number(k.slice(k.indexOf("@") + 1)))])];
  return { periods, latestRound, candidates, checkedRounds, timestamps, notes, stats };
}

export type NfdAssetHistory = {
  periods: NfdPeriod[];
  timestamps: Map<number, number>;
  notes: string[];
  stats: NfdHistoryStats & { assets: number };
};

/**
 * Stage 2: NFDs the account owned that neither an owner box nor a link
 * names, found through the NFD assets it ever held (owner boxes came with the
 * v3 registry; older NFDs may have none). Reads at stage 1's latest round, and
 * skips its candidates.
 */
export function loadNfdAssetHistory(
  address: string,
  options: LoadNfdAssetHistoryOptions,
): Promise<NfdAssetHistory> {
  return cancelOnFailure(options.signal, (signal) => readNfdAssetHistory(address, { ...options, signal }));
}

type LoadNfdAssetHistoryOptions = LoadNfdHistoryOptions & { latestRound: number; known: number[] };

async function readNfdAssetHistory(address: string, options: LoadNfdAssetHistoryOptions): Promise<NfdAssetHistory> {
  const started = Date.now();
  const ctx = await context(address, options, options.latestRound);
  const { onProgress, signal } = options;
  onProgress?.("Checking older NFDs (asset holdings)");
  let assets: Map<number, number | undefined>;
  try {
    assets = await nfdAssetsEverHeld(ctx);
  } catch (e) {
    if (signal?.aborted) throw e;
    ctx.notes.push(
      `The account's asset holdings could not be read (${(e as Error).message}): NFDs it owned before owner boxes may be missing.`,
    );
    assets = new Map();
  }
  const known = new Set(options.known);
  const apps = (await nfdAssetApps(ctx, assets)).filter((id) => !known.has(id));
  ctx.stats.ownerCandidates = apps.length;
  const changes = await readAppChanges(ctx, apps);
  const periods = await ownerPeriods(ctx, changes, new Map());
  await fillTimestamps(ctx, periods.flatMap((p) => (p.to === undefined ? [p.from] : [p.from, p.to])));
  ctx.stats.ms = Date.now() - started;
  return { periods, timestamps: ctx.timestamps, notes: ctx.notes, stats: { ...ctx.stats, assets: assets.size } };
}

/**
 * The NFD assets the account ever held (the indexer keeps closed holdings):
 * asset id → the round it opted in. NFD assets are minted after the registry,
 * and app and asset ids share one counter, so older holdings are dropped
 * before their unit names are looked up.
 */
async function nfdAssetsEverHeld(ctx: Ctx): Promise<Map<number, number | undefined>> {
  const indexer = explorer.network.getIndexer();
  const held = new Map<number, number | undefined>();
  let next: string | undefined;
  do {
    const request = indexer.lookupAccountAssets(ctx.address).includeAll(true).limit(PAGE_LIMIT);
    if (next) request.nextToken(next);
    const page = await request.do();
    for (const holding of page.assets) {
      const id = Number(holding.assetId);
      if (id <= ctx.registryAppId) continue;
      held.set(id, holding.optedInAtRound === undefined ? undefined : Number(holding.optedInAtRound));
    }
    next = page.nextToken || undefined;
    ctx.signal?.throwIfAborted();
  } while (next);

  const ids = [...held.keys()];
  let tiny = new Map<number, A_AssetTiny>();
  try {
    tiny = await AssetCache.getByIndices(ids);
  } catch {
    // the cache is a convenience
  }
  const missing = ids.filter((id) => !tiny.has(id));
  if (missing.length) {
    const fetched = await abel.getAssetsTinyLabels(missing.map(BigInt));
    const list: A_AssetTiny[] = [];
    for (const labels of fetched.values()) {
      const asset = abelTinyToAssetTiny(labels);
      tiny.set(asset.index, asset);
      list.push(asset);
    }
    void AssetCache.insertMany(list).catch(() => {});
  }
  ctx.signal?.throwIfAborted();
  // TODO: confirm whether deleting an NFD destroys its asset. If it does, a destroyed asset has no unit name here,
  // so it is dropped, and nfdAssetApps' opt-in-round read for apps that are gone never sees it.
  for (const id of ids) {
    if (tiny.get(id)?.params["unit-name"] !== "NFD") held.delete(id);
  }
  return held;
}

/**
 * The NFD apps of NFD assets: an NFD's app is among the 8 ids before its asset
 * (DESIGN-v2 section 10), and is the one whose `i.asaid` is the asset. Read at
 * the load's latest round, and where the app is gone, at the round the account
 * opted in to the asset.
 */
async function nfdAssetApps(ctx: Ctx, assets: Map<number, number | undefined>): Promise<number[]> {
  if (!assets.size) return [];
  const { sdk, signal, latestRound, creationRound } = ctx;
  const candidates = (asset: number) =>
    Array.from({ length: ASSET_AFTER_APP_MAX }, (_, i) => asset - 1 - i).filter((id) => id > 0);
  const found = new Map<number, number>();
  const latest = await sdk.getRecords([...new Set([...assets.keys()].flatMap(candidates))], {
    fields: [],
    round: latestRound,
    signal,
  });
  for (const record of latest.values()) {
    if (record && assets.has(Number(record.asaId))) found.set(Number(record.asaId), Number(record.appId));
  }
  const pairs = [...assets]
    .filter(([asset, optedIn]) => !found.has(asset) && optedIn !== undefined && optedIn >= creationRound && optedIn <= latestRound)
    .flatMap(([asset, optedIn]) => candidates(asset).map((appId) => ({ appId, round: optedIn! })));
  if (pairs.length) {
    const read = await sdk.getRecordsAt(pairs, { fields: [], signal });
    for (const record of read) {
      if (record && assets.has(Number(record.asaId))) found.set(Number(record.asaId), Number(record.appId));
    }
  }
  return [...new Set(found.values())];
}
