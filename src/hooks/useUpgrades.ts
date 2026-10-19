import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { surfIdxGet, surfIdxRetry, surfIdxSupported } from "src/utils/surfIdx";
import { ConsensusUpgrade, useConsensusUpgrade } from "src/hooks/useConsensusUpgrade";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import { useLiveBlocks } from "src/hooks/useLiveBlocks";

export type SurfUpgradeStatus = "voting" | "rejected" | "approved" | "applied";

/** One consensus upgrade proposal, from surf idx /v0/upgrades. */
export interface SurfUpgrade {
  /** The round it was proposed in. */
  round: number;
  ts: number;
  /** The protocol it was proposed on, whose rules the vote runs under. */
  from: string;
  /** The protocol it proposes. */
  proto: string;
  /** Approvals count in the rounds before this one. Identifies the proposal. */
  voteBefore: number;
  /** Where the new protocol takes effect, if approved. */
  switchOn: number;
  /** Final count; null in surf idx while voting, filled from the live header here when it can be. */
  approvals: number | null;
  status: SurfUpgradeStatus;
  /** Timestamp of the switchOn block once applied. */
  switchTs: number | null;
  /** From the live block header: surf idx hasn't seen it yet, so `ts` is unknown (0). */
  pending?: boolean;
  /** The round of the live header the running tally was read from. */
  asOf?: number;
}

/**
 * "superseded": every attempt was rejected and a later version was proposed instead.
 * "rejected": every attempt was rejected and nothing has been proposed since.
 */
export type UpgradeGroupStatus = SurfUpgradeStatus | "superseded";

/** Back-to-back proposals of one protocol: a rejected proposal is usually re-proposed right away. */
export interface UpgradeGroup {
  proto: string;
  from: string;
  /** Oldest first. */
  attempts: SurfUpgrade[];
  /** The last attempt, whose outcome is the group's. */
  final: SurfUpgrade;
  status: UpgradeGroupStatus;
  /** Its id on the history page: the version name, suffixed for older groups of a repeated name. */
  anchor: string;
}

/** Every upgrade proposal on this network, oldest first. */
export function useUpgrades(enabled = true) {
  return useQuery({
    queryKey: ["surf-upgrades"],
    queryFn: () => surfIdxGet<SurfUpgrade[]>("/v0/upgrades"),
    enabled: surfIdxSupported && enabled,
    // Small and almost all history, so it may persist; a vote in progress refreshes from the live header.
    staleTime: 10 * 60_000,
    ...surfIdxRetry,
  });
}

/** What withLive reads of the live upgrade. */
export type LiveVote = Pick<
  ConsensusUpgrade,
  "nextProtocolVoteBefore" | "nextProtocolApprovals" | "phase" | "round" | "currentProtocol" | "nextProtocol" | "nextProtocolSwitchOn"
>;

/**
 * Adds the in-flight upgrade from the live header: its running tally while surf idx has none, or the
 * whole proposal when surf idx hasn't sampled it yet (it samples every 10,000 rounds).
 */
export function withLive(rows: SurfUpgrade[], live: LiveVote | null, voteRounds: number): SurfUpgrade[] {
  if (!live || !live.nextProtocolVoteBefore) return rows;
  const status: SurfUpgradeStatus = live.phase === "voting" ? "voting" : "approved";
  const i = rows.findIndex((u) => u.voteBefore === live.nextProtocolVoteBefore);
  if (i >= 0) {
    const row = rows[i];
    // surf idx may say "voting" from before the vote closed; the header knows it passed.
    const passed = row.status === "voting" && status === "approved";
    if (row.approvals != null && !passed) return rows;
    const out = rows.slice();
    out[i] = {
      ...row,
      ...(row.approvals == null ? { approvals: live.nextProtocolApprovals, asOf: live.round } : {}),
      ...(passed ? { status } : {}),
    };
    return out;
  }
  return [
    ...rows,
    {
      round: live.nextProtocolVoteBefore - voteRounds,
      ts: 0,
      from: live.currentProtocol,
      proto: live.nextProtocol,
      voteBefore: live.nextProtocolVoteBefore,
      switchOn: live.nextProtocolSwitchOn,
      approvals: live.nextProtocolApprovals,
      status,
      switchTs: null,
      pending: true,
      asOf: live.round,
    },
  ];
}

/** Runs of consecutive proposals of the same protocol, oldest first. */
export function groupUpgrades(rows: SurfUpgrade[]): UpgradeGroup[] {
  const groups: UpgradeGroup[] = [];
  for (const u of rows) {
    const last = groups[groups.length - 1];
    if (last && last.proto === u.proto && last.from === u.from) {
      last.attempts.push(u);
      last.final = u;
    } else {
      groups.push({ proto: u.proto, from: u.from, attempts: [u], final: u, status: u.status, anchor: "" });
    }
  }
  groups.forEach((g, i) => {
    g.status = g.final.status === "rejected" && i < groups.length - 1 ? "superseded" : g.final.status;
  });
  return groups;
}

// UpgradeVoteRounds: 10,000 since consensus v7, never changed. Only used to place a proposal
// surf idx hasn't seen yet, so a wrong value can't misstate a tally.
const VOTE_ROUNDS = 10_000;

/** Sets each group's anchor from its version name. The newest of a repeated name keeps it bare. */
export function setAnchors(groups: UpgradeGroup[], nameOf: (proto: string) => string): UpgradeGroup[] {
  const seen = new Map<string, number>();
  for (let i = groups.length - 1; i >= 0; i--) {
    const base = upgradeAnchor(nameOf(groups[i].proto));
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    groups[i].anchor = count === 1 ? base : `${base}-${count}`;
  }
  return groups;
}

// Shortest gap between refetches when the cached list is behind the chain: an outcome or switch it
// lacks is worth a minute, a proposal surf idx hasn't sampled yet (up to ~8 h, and the live header
// already shows it) only every 10 minutes.
const STALE_REFETCH_MS = 60_000;
const MISSING_REFETCH_MS = 10 * 60_000;

/**
 * How far the cached list is behind the chain: "stale" when a vote it has open has closed or an
 * upgrade it has waiting has switched, "missing" when the live header has a proposal it lacks.
 */
function behindBy(rows: SurfUpgrade[], latestRound: number, live: LiveVote | null): "stale" | "missing" | null {
  if (!latestRound) return null;
  if (rows.some((u) => (u.status === "voting" && u.voteBefore <= latestRound) || (u.status === "approved" && u.switchOn <= latestRound)))
    return "stale";
  if (live?.nextProtocolVoteBefore && !rows.some((u) => u.voteBefore === live.nextProtocolVoteBefore)) return "missing";
  return null;
}

// When a behind-refetch last started, shared by every mounted useUpgradeGroups (the homepage has
// two), so they fire one request between them.
let lastBehindRefetch = 0;

/**
 * The proposal groups, oldest first, with the live upgrade merged in. undefined while loading, or
 * when not enabled.
 */
export function useUpgradeGroups(enabled = true): { groups: UpgradeGroup[] | undefined; isError: boolean; error: unknown } {
  const { data, isError, error, refetch, fetchStatus, dataUpdatedAt } = useUpgrades(enabled);
  const live = useConsensusUpgrade();
  const lookup = useConsensusVersionLookup();
  const latestRound = Number(useLiveBlocks().blocks[0]?.header.round ?? 0);

  // Throttled from the last attempt, failed ones included, and never over a fetch in flight: on the
  // homepage this runs every block, and a refetch cancels the one before (and its retry backoff).
  const behind = data ? behindBy(data, latestRound, live) : null;
  useEffect(() => {
    if (!enabled || !behind || fetchStatus !== "idle") return;
    const gap = behind === "stale" ? STALE_REFETCH_MS : MISSING_REFETCH_MS;
    if (Date.now() - Math.max(lastBehindRefetch, dataUpdatedAt) < gap) return;
    lastBehindRefetch = Date.now();
    refetch({ cancelRefetch: false });
  }, [enabled, behind, fetchStatus, dataUpdatedAt, latestRound, refetch]);

  // useConsensusUpgrade returns a new object whenever the average round time moves, about every
  // block: keep only what withLive reads, so the groups rebuild only when that changes.
  const liveKey = live
    ? [live.nextProtocolVoteBefore, live.nextProtocolApprovals, live.phase, live.round, live.currentProtocol, live.nextProtocol, live.nextProtocolSwitchOn].join("|")
    : "";
  const liveVote = useMemo((): LiveVote | null => live, [liveKey]);
  const merged = useMemo(() => (data ? withLive(data, liveVote, VOTE_ROUNDS) : undefined), [data, liveVote]);
  const groups = useMemo(
    () => (merged ? setAnchors(groupUpgrades(merged), (p) => lookup(p).name) : undefined),
    [merged, lookup],
  );
  return { groups, isError, error };
}

export interface UpgradeAttempt {
  upgrade: SurfUpgrade;
  group: UpgradeGroup;
  /** 1-based, within its group. */
  attempt: number;
}

/** The proposal whose vote ends at voteBefore, with its group; null when unknown or there's no surf idx. */
export function useUpgradeAttempt(voteBefore: number | undefined): UpgradeAttempt | null {
  // Only fetches the list when there's a proposal to look up.
  const { groups } = useUpgradeGroups(!!voteBefore);
  return useMemo(() => {
    if (!groups || !voteBefore) return null;
    for (const group of groups) {
      const i = group.attempts.findIndex((u) => u.voteBefore === voteBefore);
      if (i >= 0) return { upgrade: group.attempts[i], group, attempt: i + 1 };
    }
    return null;
  }, [groups, voteBefore]);
}

/** Yes votes the proposal didn't get. A closed vote used its whole window. */
export function closedNoVotes(u: SurfUpgrade, voteRounds: number | null): number | null {
  if (voteRounds == null || u.approvals == null || u.status === "voting") return null;
  return Math.max(0, voteRounds - u.approvals);
}

/** Anchor on the history page for a protocol's group, by its display name. */
export function upgradeAnchor(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "-");
}
