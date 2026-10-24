import React from "react";
import VoteBar from "src/components/v2/VoteBar";
import { VoteStatus, roundsLeft, verdictClassName, votePercent } from "./voteStatus";

/**
 * An upgrade vote in progress: Yes and No tallies over the vote bar, then the verdict and how far
 * through the window it is. On the homepage card, the upgrades page, and a block page as of that block.
 */
export default function VoteProgress({
    vote,
    roundsRemaining,
    verdict = true,
    explain,
    showRoundsLeft = true,
    className,
}: {
    vote: VoteStatus;
    /** Rounds that can still vote. */
    roundsRemaining: number;
    /** Off on a past block, where the verdict then could contradict how the vote ended. */
    verdict?: boolean;
    /** Adds the verdict's explainer, e.g. "(9,000 Yes no longer reachable)". */
    explain?: boolean;
    /** Rounds left when the vote rules are unknown; off where the page shows them already. */
    showRoundsLeft?: boolean;
    className?: string;
}): JSX.Element {
    return (
        <div className={className}>
            {/* Tallies mirror the bar underneath: yes over the green left end, no over the red right
                end. Always one line: when space runs out the Yes label truncates while the No side
                keeps its full width. */}
            <div className="flex items-baseline justify-between gap-x-2">
                {vote.voteRounds && vote.noVotes != null ? (
                    <>
                        <span className="flex items-baseline gap-x-2 text-primary min-w-0">
                            <span className="text-xl shrink-0">{vote.approvals.toLocaleString()}</span>
                            <span className="text-[13px] truncate">
                                Yes ({votePercent(vote.approvals, vote.approvals + vote.noVotes)}%)
                            </span>
                        </span>
                        <span className="flex items-baseline gap-x-2 text-secondary shrink-0">
                            <span className="text-xl">{vote.noVotes.toLocaleString()}</span>
                            <span className="text-[13px]">
                                No ({votePercent(vote.noVotes, vote.approvals + vote.noVotes)}%)
                            </span>
                        </span>
                    </>
                ) : (
                    <span className="flex items-baseline gap-x-2">
                        <span className="text-primary text-xl">{vote.approvals.toLocaleString()}</span>
                        <span className="text-muted-foreground">approvals</span>
                    </span>
                )}
            </div>

            <VoteBar
                className="mt-2"
                approvals={vote.approvals}
                noVotes={vote.noVotes}
                voteRounds={vote.voteRounds}
                threshold={vote.threshold}
            />

            <div className="text-muted-foreground text-[13px] mt-2">
                {verdict ? (
                    <>
                        <span className={verdictClassName(vote.verdict)}>{vote.label}</span>
                        {explain && vote.explainer ? ` (${vote.explainer})` : ""}
                    </>
                ) : null}
                {[
                    // Cast votes over the whole window: how far through the voting process is, not
                    // how the tally is going.
                    vote.voteRounds && vote.noVotes != null
                        ? `${votePercent(vote.approvals + vote.noVotes, vote.voteRounds)}% ${verdict ? "complete" : "voted"}`
                        : null,
                    // Threshold over window — the yes share of cast votes the tally must hold,
                    // comparable to the Yes percentage above. Number() strips trailing zeros so
                    // mainnet reads "90", not "90.00".
                    vote.voteRounds && vote.threshold
                        ? `${Number(((vote.threshold / vote.voteRounds) * 100).toFixed(2))}% Yes needed`
                        : showRoundsLeft
                          ? roundsLeft(roundsRemaining)
                          : null,
                ]
                    .filter(Boolean)
                    // Separated from the verdict, if any, and each other.
                    .map((part, i) => (verdict || i > 0 ? ` · ${part}` : part))}
            </div>
        </div>
    );
}
