import { useMemo } from "react";
import { useAverageRoundTime } from "@d13co/algo-metrics-react";
import { useLiveBlocks } from "src/hooks/useLiveBlocks";
import { BLOCK_TIME } from "src/packages/core-sdk/constants";
import { A_UpgradeState } from "src/packages/core-sdk/types";

/**
 * "voting" — proposers are still casting yes votes; the tally can still fail.
 * "waiting" — the vote closed and the upgrade is counting down to its switch round.
 */
export type UpgradePhase = "voting" | "waiting";

export interface ConsensusUpgrade extends A_UpgradeState {
    phase: UpgradePhase;
    round: number;
    roundTimestamp: number;
    /**
     * Rounds that can still cast a yes vote when voting (see votableRoundsLeft — this is one less
     * than the distance to nextProtocolVoteBefore), otherwise rounds to the switch round.
     */
    roundsRemaining: number;
    /**
     * Projected unix seconds of the round the phase ends on: nextProtocolVoteBefore, where the vote
     * is resolved, or nextProtocolSwitchOn, where the new protocol takes effect. One round later
     * than roundsRemaining during voting.
     */
    targetEpoch: number;
    avgRoundTime: number;
    avgRoundTimeSource: "metrics" | "liveblocks" | "constant";
}

/**
 * Rounds that can still add an approval.
 *
 * go-algorand counts a yes vote only while `round < nextProtocolVoteBefore`, and the header we read
 * already includes its own round's vote, so the last votable round is `nextProtocolVoteBefore - 1`
 * and there are `nextProtocolVoteBefore - 1 - round` left. At `nextProtocolVoteBefore` itself the
 * vote is resolved rather than counted, which is why this is one less than the distance to it —
 * without the -1 a tally sitting exactly one vote short of the threshold on the final votable round
 * would still read as "On track" a round after it became unreachable.
 *
 * In the waiting phase nothing is being voted on, so this is simply the distance to the switch round
 * (the protocol changes *at* nextProtocolSwitchOn, so no -1 there).
 */
function votableRoundsLeft(voting: boolean, voteBefore: number, switchOn: number, round: number): number {
    return voting
        ? Math.max(0, voteBefore - 1 - round)
        : Math.max(0, switchOn - round);
}

/** Average seconds per round from the cached live block headers, or null with fewer than two. */
function avgRoundTimeFromBlocks(blocks: { header: { round: bigint; timestamp: bigint } }[]): number | null {
    if (blocks.length < 2) return null;
    const newest = blocks[0].header;
    const oldest = blocks[blocks.length - 1].header;
    const rounds = Number(newest.round) - Number(oldest.round);
    if (rounds <= 0) return null;
    const seconds = Number(newest.timestamp) - Number(oldest.timestamp);
    if (seconds <= 0) return null;
    return seconds / rounds;
}

// Mainnet spends years between upgrades and localnet never has one, so the tile is otherwise only
// testable in the hours before a real switch round. In dev, ?upgrade=voting|waiting|unknown (or
// localStorage "surf:fakeUpgrade") synthesises one. import.meta.env.DEV lets Vite drop this in prod.
const DEMO_PROTOCOLS = {
    current: "https://github.com/algorandfoundation/specs/tree/236dcc18c9c507d794813ab768e467ea42d1b4d9", // v40, AVM 11
    next: "https://github.com/algorandfoundation/specs/tree/953304de35264fc3ef91bcd05c123242015eeaed", // v41, AVM 12
    unknown: "https://github.com/algorandfoundation/specs/tree/0000000000000000000000000000000000000000",
};

function demoUpgrade(mode: string, round: number): ConsensusUpgrade | null {
    const voting = mode === "voting" || mode === "voting-fail";
    const voteBefore = voting ? round + 3200 : round - 5000;
    const switchOn = voteBefore + 208000;
    // "voting" is on track (6,200 + 3,199 rounds left clears the 9,000 bar); "voting-fail" can no
    // longer reach it (1,200 + 3,199 < 9,000), which is the "Cannot pass" branch. Approvals must
    // stay below the 6,801 rounds already voted (10,000-round window) or the implied no-vote count
    // goes negative — a state the real chain can't produce.
    const approvals = mode === "voting-fail" ? 1200 : voting ? 6200 : 9120;
    const roundsToTarget = (voting ? voteBefore : switchOn) - round;
    return {
        currentProtocol: DEMO_PROTOCOLS.current,
        nextProtocol: mode === "unknown" ? DEMO_PROTOCOLS.unknown : DEMO_PROTOCOLS.next,
        nextProtocolApprovals: approvals,
        nextProtocolVoteBefore: voteBefore,
        nextProtocolSwitchOn: switchOn,
        phase: voting ? "voting" : "waiting",
        round,
        roundTimestamp: Math.floor(Date.now() / 1000),
        roundsRemaining: votableRoundsLeft(voting, voteBefore, switchOn, round),
        targetEpoch: Math.floor(Date.now() / 1000) + roundsToTarget * 2.8,
        avgRoundTime: 2.8,
        avgRoundTimeSource: "constant",
    };
}

/**
 * The consensus upgrade in flight on the current network, or null when there is none.
 *
 * Derived entirely from the latest live block header, which carries the whole upgrade state machine
 * and is refreshed every round — so this costs no requests. (algod's status endpoint would add only
 * next-version-supported, which is a property of the node serving us rather than of the network, so
 * it is deliberately not surfaced.)
 */
export function useConsensusUpgrade(): ConsensusUpgrade | null {
    const { blocks } = useLiveBlocks();
    const metricsAvg = useAverageRoundTime();

    return useMemo(() => {
        const latest = blocks[0];

        if (import.meta.env.DEV) {
            const mode = new URLSearchParams(window.location.search).get("upgrade")
                ?? localStorage.getItem("surf:fakeUpgrade");
            if (mode) return demoUpgrade(mode, latest ? Number(latest.header.round) : 1_000_000);
        }

        if (!latest?.header) return null;

        const us = latest.header.upgradeState;
        // Declared non-optional on the algod type, but msgpack omits zero values.
        const nextProtocol = us?.nextProtocol ?? "";
        if (!nextProtocol) return null;

        const round = Number(latest.header.round);
        const state: A_UpgradeState = {
            currentProtocol: us?.currentProtocol ?? "",
            nextProtocol,
            nextProtocolApprovals: Number(us?.nextProtocolApprovals ?? 0),
            nextProtocolVoteBefore: Number(us?.nextProtocolVoteBefore ?? 0),
            nextProtocolSwitchOn: Number(us?.nextProtocolSwitchOn ?? 0),
        };

        // The header clears itself at the switch round, but guard anyway: persisted or stale data
        // must never render a negative countdown.
        if (state.nextProtocolSwitchOn > 0 && round >= state.nextProtocolSwitchOn) return null;

        const voting = state.nextProtocolVoteBefore > 0 && round < state.nextProtocolVoteBefore;
        const phase: UpgradePhase = voting ? "voting" : "waiting";
        // The round the phase ends on — where the vote is resolved, or where the switch happens.
        const target = voting ? state.nextProtocolVoteBefore : state.nextProtocolSwitchOn;
        const roundsToTarget = Math.max(0, target - round);
        const roundsRemaining = votableRoundsLeft(
            voting,
            state.nextProtocolVoteBefore,
            state.nextProtocolSwitchOn,
            round,
        );

        // useAverageRoundTime returns null until the metrics watcher has seen two blocks, which is
        // why this falls back to the cached headers before the hardcoded constant.
        let avgRoundTime = metricsAvg;
        let avgRoundTimeSource: ConsensusUpgrade["avgRoundTimeSource"] = "metrics";
        if (avgRoundTime == null) {
            avgRoundTime = avgRoundTimeFromBlocks(blocks);
            avgRoundTimeSource = "liveblocks";
        }
        if (avgRoundTime == null) {
            avgRoundTime = BLOCK_TIME;
            avgRoundTimeSource = "constant";
        }

        const roundTimestamp = Number(latest.header.timestamp);

        return {
            ...state,
            phase,
            round,
            roundTimestamp,
            roundsRemaining,
            targetEpoch: roundTimestamp + roundsToTarget * avgRoundTime,
            avgRoundTime,
            avgRoundTimeSource,
        };
    }, [blocks, metricsAvg]);
}

export default useConsensusUpgrade;
