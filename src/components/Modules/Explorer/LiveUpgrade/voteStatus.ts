import { ConsensusUpgrade } from "src/hooks/useConsensusUpgrade";

export type VoteVerdict = "approved" | "on-track" | "cannot-pass" | "unknown";

export interface VoteStatus {
    verdict: VoteVerdict;
    approvals: number;
    /** Yes-vote slots in the window (UpgradeVoteRounds), null if the table didn't load. */
    voteRounds: number | null;
    /** Yes votes needed (UpgradeThreshold), null if the table didn't load. */
    threshold: number | null;
    label: string;
}

/**
 * How an upgrade vote is going.
 *
 * Approvals count blocks whose proposer voted yes, out of a fixed window of rounds. So the best
 * possible outcome from here is the current tally plus every remaining round — once that falls short
 * of the threshold the upgrade can no longer pass, which is worth saying explicitly rather than
 * showing a tally that quietly can't get there.
 *
 * That bound is only right because upgrade.roundsRemaining counts rounds that can still *vote*
 * (`nextProtocolVoteBefore - 1 - round`, see votableRoundsLeft), not the distance to
 * nextProtocolVoteBefore — no vote is counted on the round the vote is resolved. Feeding the larger
 * number in here would keep reporting "On track" for one round after the upgrade became unreachable.
 *
 * voteRounds/threshold come from the *current* protocol, since the vote runs under its rules.
 */
export function voteStatus(
    upgrade: ConsensusUpgrade,
    voteRounds: number | null,
    threshold: number | null,
): VoteStatus {
    const approvals = upgrade.nextProtocolApprovals;

    if (upgrade.phase === "waiting") {
        return {
            verdict: "approved",
            approvals,
            voteRounds,
            threshold,
            label: "Approved",
        };
    }

    if (threshold == null) {
        return { verdict: "unknown", approvals, voteRounds, threshold, label: "Voting" };
    }

    if (approvals >= threshold) {
        return { verdict: "approved", approvals, voteRounds, threshold, label: "Threshold reached" };
    }

    if (approvals + upgrade.roundsRemaining < threshold) {
        return { verdict: "cannot-pass", approvals, voteRounds, threshold, label: "Cannot pass" };
    }

    return { verdict: "on-track", approvals, voteRounds, threshold, label: "On track" };
}

export function verdictClassName(verdict: VoteVerdict): string {
    switch (verdict) {
        case "approved":
            return "text-primary";
        case "cannot-pass":
            return "text-destructive";
        default:
            return "text-foreground";
    }
}
