import React, { useState } from "react";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import { useConsensusUpgrade } from "src/hooks/useConsensusUpgrade";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import ConsensusUpgradeDialog from "./ConsensusUpgradeDialog";
import UpgradeEta from "./UpgradeEta";
import { verdictClassName, voteStatus } from "./voteStatus";

/**
 * Homepage banner for a consensus upgrade in flight, in either phase: being voted on, or approved
 * and counting down to its switch round. Renders nothing the rest of the time, which is almost
 * always. Clicking opens the full detail dialog.
 */
export default function LiveUpgrade(): JSX.Element | null {
    const upgrade = useConsensusUpgrade();
    const lookup = useConsensusVersionLookup();
    const [open, setOpen] = useState(false);

    if (!upgrade) return null;

    const next = lookup(upgrade.nextProtocol);
    const current = lookup(upgrade.currentProtocol);
    // The vote runs under the current protocol's rules, so its params set the bar.
    const vote = voteStatus(upgrade, current.voteRounds, current.threshold);

    const votePct = vote.voteRounds ? Math.min(100, (vote.approvals / vote.voteRounds) * 100) : null;
    const thresholdPct = vote.voteRounds && vote.threshold
        ? Math.min(100, (vote.threshold / vote.voteRounds) * 100)
        : null;

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
                        </div>
                        <ConsensusVersion info={next} size="lg" />
                    </div>

                    {upgrade.phase === "voting" ? (
                        <div className="min-w-[280px]">
                            <div className="flex items-baseline gap-2">
                                <span className="text-primary text-xl">
                                    {vote.approvals.toLocaleString()}
                                </span>
                                {vote.voteRounds ? (
                                    <span className="text-muted-foreground">
                                        / {vote.voteRounds.toLocaleString()} votes
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">approvals</span>
                                )}
                                <span className={`ml-auto text-[13px] ${verdictClassName(vote.verdict)}`}>
                                    {vote.label}
                                </span>
                            </div>

                            {votePct != null ? (
                                <div className="relative mt-2 h-1.5 w-full rounded bg-background-muted overflow-hidden">
                                    <div
                                        className="absolute inset-y-0 left-0 bg-primary"
                                        style={{ width: `${votePct}%` }}
                                    />
                                    {thresholdPct != null ? (
                                        <div
                                            className="absolute inset-y-0 w-px bg-foreground/60"
                                            style={{ left: `${thresholdPct}%` }}
                                            title={`${vote.threshold?.toLocaleString()} votes needed`}
                                        />
                                    ) : null}
                                </div>
                            ) : null}

                            <div className="text-muted-foreground text-[13px] mt-2">
                                {upgrade.roundsRemaining.toLocaleString()} rounds left to vote
                            </div>
                        </div>
                    ) : (
                        <div className="min-w-[280px]">
                            <div className="flex items-baseline gap-2">
                                <span className="text-primary text-xl">
                                    {upgrade.roundsRemaining.toLocaleString()}
                                </span>
                                <span className="text-muted-foreground">rounds</span>
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
