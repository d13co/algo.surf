import React, { useState } from "react";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import { useConsensusUpgrade } from "src/hooks/useConsensusUpgrade";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import { useUpgradeAttempt } from "src/hooks/useUpgrades";
import ConsensusUpgradeDialog from "./ConsensusUpgradeDialog";
import UpgradeEta from "./UpgradeEta";
import VoteProgress from "./VoteProgress";
import { voteStatus } from "./voteStatus";

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
                        <VoteProgress vote={vote} roundsRemaining={upgrade.roundsRemaining} className="w-full md:w-auto md:min-w-[280px]" />
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
