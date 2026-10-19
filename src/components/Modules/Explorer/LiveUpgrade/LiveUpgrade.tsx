import React, { useState } from "react";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import { useConsensusUpgrade } from "src/hooks/useConsensusUpgrade";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import { useUpgradeAttempt } from "src/hooks/useUpgrades";
import VoteBar from "src/components/v2/VoteBar";
import ConsensusUpgradeDialog from "./ConsensusUpgradeDialog";
import UpgradeEta from "./UpgradeEta";
import { verdictClassName, votePercent, voteStatus } from "./voteStatus";

/**
 * Homepage banner for a consensus upgrade in flight, in either phase: being voted on, or approved
 * and counting down to its switch round. Renders nothing the rest of the time, which is almost
 * always. Clicking opens the full detail dialog.
 */
export default function LiveUpgrade(): JSX.Element | null {
    const upgrade = useConsensusUpgrade();
    const lookup = useConsensusVersionLookup();
    const [open, setOpen] = useState(false);
    // From surf idx: earlier proposals of this protocol make this a re-vote.
    const attempt = useUpgradeAttempt(upgrade?.nextProtocolVoteBefore)?.attempt ?? 1;

    if (!upgrade) return null;

    const next = lookup(upgrade.nextProtocol);
    const current = lookup(upgrade.currentProtocol);
    // The vote runs under the current protocol's rules, so its params set the bar.
    const vote = voteStatus(upgrade, current.voteRounds, current.threshold);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Consensus upgrade details"
                className="w-full text-left rounded-lg p-5 bg-background-card border-l-[6px] border-primary
                           hover:bg-background-muted transition-colors cursor-pointer"
            >
                <div className="flex justify-between items-center gap-6 flex-wrap">
                    <div>
                        <div className="text-muted-foreground text-[13px] mb-1">
                            {upgrade.phase === "voting" ? "Upgrade Vote" : "Upgrade Countdown"}
                            {attempt > 1 ? ` · attempt ${attempt}` : ""}
                        </div>
                        <ConsensusVersion info={next} size="lg" />
                    </div>

                    {upgrade.phase === "voting" ? (
                        // Full width below md so the bar spans the card once the flex row wraps
                        // (and so nothing overflows on very narrow screens); compact from md up,
                        // where it shares the row with the version name.
                        <div className="w-full md:w-auto md:min-w-[280px]">
                            {/* Tallies mirror the bar underneath: yes over the green left end, no
                                over the red right end. Always one line: when space runs out the
                                Yes label truncates while the No side keeps its full width. */}
                            <div className="flex items-baseline justify-between gap-x-2">
                                {vote.voteRounds && vote.noVotes != null ? (
                                    <>
                                        <span className="flex items-baseline gap-x-2 text-primary min-w-0">
                                            <span className="text-xl shrink-0">
                                                {vote.approvals.toLocaleString()}
                                            </span>
                                            <span className="text-[13px] truncate">
                                                Yes ({votePercent(vote.approvals, vote.approvals + vote.noVotes)}%)
                                            </span>
                                        </span>
                                        <span className="flex items-baseline gap-x-2 text-secondary shrink-0">
                                            <span className="text-xl">
                                                {vote.noVotes.toLocaleString()}
                                            </span>
                                            <span className="text-[13px]">
                                                No ({votePercent(vote.noVotes, vote.approvals + vote.noVotes)}%)
                                            </span>
                                        </span>
                                    </>
                                ) : (
                                    <span className="flex items-baseline gap-x-2">
                                        <span className="text-primary text-xl">
                                            {vote.approvals.toLocaleString()}
                                        </span>
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
                                <span className={verdictClassName(vote.verdict)}>{vote.label}</span>
                                {" · "}
                                {/* Cast votes over the whole window: how far through the voting
                                    process is, not how the tally is going. */}
                                {vote.voteRounds && vote.noVotes != null
                                    ? `${votePercent(vote.approvals + vote.noVotes, vote.voteRounds)}% complete · `
                                    : ""}
                                {/* Threshold over window — the yes share of cast votes the tally
                                    must hold, comparable to the Yes percentage above. Number()
                                    strips trailing zeros so mainnet reads "90", not "90.00". */}
                                {vote.voteRounds && vote.threshold
                                    ? `${Number(((vote.threshold / vote.voteRounds) * 100).toFixed(2))}% Yes needed`
                                    : `${upgrade.roundsRemaining.toLocaleString()} ${upgrade.roundsRemaining === 1 ? "round" : "rounds"} left`}
                            </div>
                        </div>
                    ) : (
                        <div className="min-w-[280px]">
                            <div className="flex items-baseline gap-2">
                                <span className="text-primary text-xl">
                                    {upgrade.roundsRemaining.toLocaleString()}
                                </span>
                                <span className="text-muted-foreground">{upgrade.roundsRemaining === 1 ? "round" : "rounds"}</span>
                            </div>
                            <div className="text-[13px] mt-2">
                                <UpgradeEta targetEpoch={upgrade.targetEpoch} />
                            </div>
                        </div>
                    )}
                </div>
            </button>

            <ConsensusUpgradeDialog open={open} onOpenChange={setOpen} upgrade={upgrade} />
        </>
    );
}
