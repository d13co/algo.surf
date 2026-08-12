import { ConsensusUpgrade } from "src/hooks/useConsensusUpgrade";

export type VoteVerdict = "approved" | "on-track" | "cannot-pass" | "unknown";

export interface VoteStatus {
    verdict: VoteVerdict;
    approvals: number;
    /** Yes-vote slots in the window (UpgradeVoteRounds), null if the table didn't load. */
    voteRounds: number | null;
    /** Yes votes needed (UpgradeThreshold), null if the table didn't load. */
    threshold: number | null;
    /** Rounds voted so far whose proposer did not vote yes, null if the table didn't load. */
    noVotes: number | null;
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

    // Every round in the window casts exactly one implicit vote — yes, or not-yes. While voting,
    // rounds voted so far = the window minus the votable rounds left; once the vote closes the
    // whole window has voted. Whatever wasn't a yes is a no.
    const noVotes = voteRounds == null
        ? null
        : Math.max(0, voteRounds - approvals - (upgrade.phase === "voting" ? upgrade.roundsRemaining : 0));

    if (upgrade.phase === "waiting") {
        return {
            verdict: "approved",
            approvals,
            voteRounds,
            threshold,
            noVotes,
            label: "Approved",
        };
    }

    if (threshold == null) {
        return { verdict: "unknown", approvals, voteRounds, threshold, noVotes, label: "Voting" };
    }

    if (approvals >= threshold) {
        return { verdict: "approved", approvals, voteRounds, threshold, noVotes, label: "Threshold reached" };
    }

    if (approvals + upgrade.roundsRemaining < threshold) {
        return { verdict: "cannot-pass", approvals, voteRounds, threshold, noVotes, label: "Cannot pass" };
    }

    return { verdict: "on-track", approvals, voteRounds, threshold, noVotes, label: "On track" };
}

/** A vote tally as a percentage of the votes cast so far, e.g. "7.75". */
export function votePercent(count: number, votesCast: number): string {
    // No votes cast yet (the window's first round): call it 0 rather than divide by zero.
    return votesCast ? ((count / votesCast) * 100).toFixed(2) : "0.00";
}

export function verdictClassName(verdict: VoteVerdict): string {
    switch (verdict) {
        case "approved":
            return "text-primary";
        // secondary, not destructive: --color-destructive is never defined in the Tailwind theme,
        // so text-destructive silently rendered as plain foreground.
        case "cannot-pass":
            return "text-secondary";
        default:
            return "text-foreground";
    }
}
