import React from "react";
import { Info } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";
import LinkToBlock from "../Links/LinkToBlock";

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="mt-2.5">
            <div className="text-muted-foreground">{label}</div>
            <div className="mt-2.5 text-[13px] text-foreground">{children}</div>
        </div>
    );
}

/**
 * Historical view of a block's role in a consensus upgrade — which protocol it ran, whether its
 * proposer voted, and how the tally stood. Purely retrospective: no countdown, no ETA.
 *
 * Renders nothing for the overwhelming majority of blocks, which have no upgrade activity.
 */
export default function BlockUpgradeCard({ block }: { block: CoreBlock }): JSX.Element | null {
    const lookup = useConsensusVersionLookup();

    const state = block.getUpgradeState();
    const vote = block.getUpgradeVote();

    if (!block.hasUpgradeActivity()) return null;

    const current = lookup(state.currentProtocol);
    const next = state.nextProtocol ? lookup(state.nextProtocol) : null;
    const proposed = vote.upgradePropose ? lookup(vote.upgradePropose) : null;

    // The vote runs under the current protocol's rules, so the denominator and bar come from it.
    const voteRounds = current.voteRounds;
    const threshold = current.threshold;

    const voteClosed = state.nextProtocolVoteBefore > 0
        && block.getRound() >= state.nextProtocolVoteBefore;

    return (
        <div className="mt-6 rounded-lg p-5 pt-2.5 bg-background-card">
            <div className="mt-2.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <span>Consensus Upgrade</span>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="cursor-default inline-flex shrink-0">
                                    <Info size={15} />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-border max-w-xs">
                                <p>
                                    Block proposers vote on protocol upgrades. Once enough blocks
                                    approve, the upgrade switches on after a delay.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 sm:col-span-6">
                        <Field label="Protocol">
                            <ConsensusVersion info={current} showLink />
                        </Field>
                    </div>

                    {next ? (
                        <div className="col-span-12 sm:col-span-6">
                            <Field label="Upgrading to">
                                <ConsensusVersion info={next} showLink />
                            </Field>
                        </div>
                    ) : null}

                    {proposed ? (
                        <div className="col-span-12 sm:col-span-6">
                            <Field label="Upgrade proposed">
                                <ConsensusVersion info={proposed} showLink />
                                {vote.upgradeDelay > 0 ? (
                                    <div className="text-muted-foreground mt-1">
                                        {vote.upgradeDelay.toLocaleString()} round delay after the vote
                                    </div>
                                ) : null}
                            </Field>
                        </div>
                    ) : null}

                    <div className="col-span-12 sm:col-span-6">
                        <Field label="Proposer's vote">
                            {vote.upgradeApprove ? (
                                <span className="text-primary">Approve</span>
                            ) : (
                                <span className="text-muted-foreground">No vote</span>
                            )}
                        </Field>
                    </div>

                    {next ? (
                        <>
                            <div className="col-span-12 sm:col-span-6">
                                <Field label="Approvals at this block">
                                    <span className="text-foreground">
                                        {state.nextProtocolApprovals.toLocaleString()}
                                    </span>
                                    {voteRounds ? (
                                        <span className="text-muted-foreground">
                                            {" / "}{voteRounds.toLocaleString()}
                                            {threshold ? ` · ${threshold.toLocaleString()} needed` : ""}
                                        </span>
                                    ) : null}
                                </Field>
                            </div>

                            {state.nextProtocolVoteBefore > 0 ? (
                                <div className="col-span-12 sm:col-span-6">
                                    <Field label="Voting closes">
                                        <LinkToBlock id={state.nextProtocolVoteBefore} />
                                        <span className="text-muted-foreground ml-2">
                                            {voteClosed ? "(closed)" : "(open)"}
                                        </span>
                                    </Field>
                                </div>
                            ) : null}

                            {state.nextProtocolSwitchOn > 0 ? (
                                <div className="col-span-12 sm:col-span-6">
                                    <Field label="Switches on">
                                        <LinkToBlock id={state.nextProtocolSwitchOn} />
                                    </Field>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
