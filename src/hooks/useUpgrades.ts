import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAlgoMetricsContext } from "@d13co/algo-metrics-react";
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

/** How a closed vote ended, read from the chain. */
export interface ClosedVote {
  voteBefore: number;
  /** The final tally, from the header of the last round that voted. */
  approvals: number;
  /** The header of the close round kept the proposal pending: it passed. */
  passed: boolean;
}

/**
 * Settles what the chain has decided but surf idx doesn't have yet: a vote it has open that closed
 * (from the close round's headers), and an approved upgrade whose switch round has passed.
 */
export function withClosed(rows: SurfUpgrade[], latestRound: number, closed: ClosedVote | null | undefined): SurfUpgrade[] {
  if (!latestRound) return rows;
  let out = rows;
  rows.forEach((u, i) => {
    let next: SurfUpgrade | null = null;
    if (u.status === "voting" && closed?.voteBefore === u.voteBefore) {
      next = {
        ...u,
        approvals: closed.approvals,
        asOf: undefined,
        status: !closed.passed ? "rejected" : u.switchOn <= latestRound ? "applied" : "approved",
      };
    } else if (u.status === "approved" && u.switchOn <= latestRound) {
      // An approved switch can't be undone: past its round, it happened.
      next = { ...u, status: "applied" };
    }
    if (next) {
      if (out === rows) out = rows.slice();
      out[i] = next;
    }
  });
  return out;
}

/**
 * The outcome of the newest vote the list has open that closed by latestRound, from the headers
 * either side of its close. Fetched once: a closed vote never changes. null while there's none.
 */
function useClosedVote(rows: SurfUpgrade[] | undefined, latestRound: number): ClosedVote | null | undefined {
  const { sdk } = useAlgoMetricsContext();
  const voteBefore = latestRound
    ? rows
        ?.filter((u) => u.status === "voting" && u.voteBefore <= latestRound)
        .reduce((max, u) => Math.max(max, u.voteBefore), 0)
    : 0;
  const { data } = useQuery({
    queryKey: ["closed-vote", voteBefore],
    queryFn: async (): Promise<ClosedVote> => {
      const algod = sdk.algorand.client.algod;
      // The last round that voted carries the final tally, its own vote included. The close round
      // keeps the proposal pending if it passed, and clears it if not.
      const [last, close] = await Promise.all([
        algod.block(voteBefore! - 1).headerOnly(true).do(),
        algod.block(voteBefore!).headerOnly(true).do(),
      ]);
      const pending = close.block.header.upgradeState;
      return {
        voteBefore: voteBefore!,
        approvals: Number(last.block.header.upgradeState?.nextProtocolApprovals ?? 0),
        passed: !!pending?.nextProtocol && Number(pending.nextProtocolVoteBefore) === voteBefore,
      };
    },
    enabled: !!voteBefore,
    staleTime: Infinity,
  });
  return voteBefore ? data : null;
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
  const withLiveRows = useMemo(() => (data ? withLive(data, liveVote, VOTE_ROUNDS) : undefined), [data, liveVote]);
  // Between a vote closing (or a switch) and surf idx catching up, the live header no longer has it.
  const closed = useClosedVote(withLiveRows, latestRound);
  const merged = useMemo(
    () => (withLiveRows ? withClosed(withLiveRows, latestRound, closed) : undefined),
    [withLiveRows, latestRound, closed],
  );
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
