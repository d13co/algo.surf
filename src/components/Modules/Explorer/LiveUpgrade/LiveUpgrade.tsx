import React, { useState } from "react";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import { useConsensusUpgrade } from "src/hooks/useConsensusUpgrade";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
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

    if (!upgrade) return null;

    const next = lookup(upgrade.nextProtocol);
    const current = lookup(upgrade.currentProtocol);
    // The vote runs under the current protocol's rules, so its params set the bar.
    const vote = voteStatus(upgrade, current.voteRounds, current.threshold);

    const votePct = vote.voteRounds ? Math.min(100, (vote.approvals / vote.voteRounds) * 100) : null;
    const noPct = vote.voteRounds && vote.noVotes != null && votePct != null
        ? Math.min(100 - votePct, (vote.noVotes / vote.voteRounds) * 100)
        : null;
    // Where yes hands over to no, as a percentage of the combined yes+no element (not of the whole
    // track — the gradient lives inside that element).
    const yesBoundaryPct = votePct != null && noPct ? (votePct / (votePct + noPct)) * 100 : null;
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
                        // Full width below md so the bar spans the card once the flex row wraps
                        // (and so nothing overflows on very narrow screens); compact from md up,
                        // where it shares the row with the version name.
                        <div className="w-full md:w-auto md:min-w-[280px]">
                            {/* flex-col-reverse folds the verdict onto its own line above the
                                tallies on mobile, still pinned right; from sm up it sits inline at
                                the row's end. */}
                            <div className="flex flex-col-reverse gap-y-1 sm:flex-row sm:items-baseline gap-x-2">
                                <div className="flex flex-col gap-y-0.5 sm:flex-row sm:items-baseline sm:gap-x-2">
                                    {vote.voteRounds && vote.noVotes != null ? (
                                        <>
                                            <span className="flex items-baseline gap-x-2 text-primary">
                                                <span className="text-xl">
                                                    {vote.approvals.toLocaleString()}
                                                </span>
                                                <span className="text-[13px]">
                                                    Yes ({votePercent(vote.approvals, vote.approvals + vote.noVotes)}%)
                                                </span>
                                            </span>
                                            <span className="flex items-baseline gap-x-2 text-secondary">
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
                                <span className={`self-end sm:self-auto sm:ml-auto text-[13px] ${verdictClassName(vote.verdict)}`}>
                                    {vote.label}
                                </span>
                            </div>

                            {votePct != null ? (
                                <div className="relative mt-2 h-1.5 w-full rounded bg-background-muted overflow-hidden">
                                    {noPct != null && yesBoundaryPct != null ? (
                                        /* One element for both segments: two abutting
                                           percentage-positioned divs leave a sub-pixel seam that
                                           reads as a vertical shift, so the yes/no handoff is a
                                           hard gradient stop inside a single element instead. */
                                        <div
                                            className="absolute inset-y-0 left-0"
                                            style={{
                                                width: `${votePct + noPct}%`,
                                                background: `linear-gradient(90deg, var(--color-primary) ${yesBoundaryPct}%, var(--color-secondary) ${yesBoundaryPct}%)`,
                                            }}
                                        />
                                    ) : (
                                        <div
                                            className="absolute inset-y-0 left-0 bg-primary"
                                            style={{ width: `${votePct}%` }}
                                        />
                                    )}
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
                                {/* Cast votes over the whole window: how far through the voting
                                    process is, not how the tally is going. */}
                                {vote.voteRounds && vote.noVotes != null
                                    ? `${votePercent(vote.approvals + vote.noVotes, vote.voteRounds)}% complete · `
                                    : ""}
                                {upgrade.roundsRemaining.toLocaleString()} rounds left
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
