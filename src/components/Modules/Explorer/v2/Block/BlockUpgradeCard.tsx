import React from "react";
import { History, Info } from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";
import { useUpgradeAttempt, UpgradeAttempt } from "src/hooks/useUpgrades";
import { useLiveBlocks } from "src/hooks/useLiveBlocks";
import dateFormat from "dateformat";
import LinkToBlock from "../Links/LinkToBlock";
import Link from "../Links/Link";
import VoteProgress from "../../LiveUpgrade/VoteProgress";
import { voteStatus } from "../../LiveUpgrade/voteStatus";

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="mt-2.5">
            <div className="text-muted-foreground">{label}</div>
            {/* leading-5: two-line values (a version and its AVM, a tally and its attempt) need room. */}
            <div className="mt-2.5 text-[13px] leading-5 text-foreground">{children}</div>
        </div>
    );
}

function Cell({ children }: { children: React.ReactNode }): JSX.Element {
    return <div className="col-span-12 sm:col-span-6">{children}</div>;
}

function day(ts: number): string {
    return dateFormat(new Date(ts * 1000), "d mmm yyyy");
}

function HistoryButton({ found, className }: { found: UpgradeAttempt; className?: string }): JSX.Element {
    return (
        <div className={className}>
            <Button variant="outline" size="sm" className="border-border text-primary hover:bg-primary/10" asChild>
                <Link noStyle href={`/upgrades#${found.group.anchor}`} keepRound={false}>
                    <History />
                    Upgrade history
                </Link>
            </Button>
        </div>
    );
}

/**
 * "Attempt 3 of 5" and, from sm up, an Upgrade history button. On a phone, where the fields stack,
 * the button ends the card instead.
 */
function AttemptLine({ found }: { found: UpgradeAttempt }): JSX.Element {
    const total = found.group.attempts.length;
    return (
        <>
            {total > 1 ? <div className="text-muted-foreground">Attempt {found.attempt} of {total}</div> : null}
            <HistoryButton found={found} className="mt-2 hidden sm:block" />
        </>
    );
}

/** How the vote this block belongs to ended, from surf idx. */
function VoteOutcome({ found, voteRounds }: { found: UpgradeAttempt; voteRounds: number | null }): JSX.Element {
    const u = found.upgrade;
    const passed = u.status === "approved" || u.status === "applied";
    return (
        <>
            {u.status === "voting" ? (
                <span className="text-foreground">Voting</span>
            ) : (
                <>
                    <span className={passed ? "text-primary" : "text-muted-foreground"}>
                        {u.status === "applied" ? "Applied" : passed ? "Approved" : "Rejected"}
                    </span>
                    {u.approvals != null ? (
                        <span className="text-muted-foreground">
                            {" · "}{u.approvals.toLocaleString()}
                            {voteRounds ? ` / ${voteRounds.toLocaleString()}` : ""} approvals
                        </span>
                    ) : null}
                </>
            )}
            <AttemptLine found={found} />
        </>
    );
}

/** A round, linked once its block exists: a future round's block page would 404. */
function RoundRef({ round, exists }: { round: number; exists: boolean }): JSX.Element {
    return exists ? <LinkToBlock id={round} /> : <>{round.toLocaleString()}</>;
}

/**
 * Historical view of a block's role in a consensus upgrade. While the vote is open: whether its
 * proposer voted and how the tally stood. Once the vote has closed and the switch is pending: the
 * result and how far off the switch was. Purely retrospective: no countdown, no ETA.
 *
 * Renders nothing for the overwhelming majority of blocks, which have no upgrade activity.
 */
export default function BlockUpgradeCard({ block }: { block: CoreBlock }): JSX.Element | null {
    const lookup = useConsensusVersionLookup();

    const state = block.getUpgradeState();
    const vote = block.getUpgradeVote();
    // The vote's outcome, known now even where this block saw it open. Only for a pending
    // proposal: nextProtocolVoteBefore identifies it.
    const found = useUpgradeAttempt(state.nextProtocol ? state.nextProtocolVoteBefore : undefined);
    const latestRound = Number(useLiveBlocks().blocks[0]?.header.round ?? 0);

    if (!block.hasUpgradeActivity()) return null;

    const round = block.getRound();
    const current = lookup(state.currentProtocol);
    const next = state.nextProtocol ? lookup(state.nextProtocol) : null;
    const proposed = vote.upgradePropose ? lookup(vote.upgradePropose) : null;

    // The vote runs under the current protocol's rules, so the denominator and bar come from it.
    const voteRounds = current.voteRounds;
    const threshold = current.threshold;

    const { nextProtocolVoteBefore: voteBefore, nextProtocolSwitchOn: switchOn } = state;
    // Rounds after this one that could still vote, as of this block: the close round casts none.
    const votingRoundsLeft = Math.max(0, voteBefore - 1 - round);
    // The header keeps a proposal pending after its vote only if it passed: a rejected one clears.
    const switchPending = !!next && voteBefore > 0 && round >= voteBefore;
    // An approved switch can't be undone, so a passed switch round means it happened.
    const applied = found?.upgrade.status === "applied" || (switchPending && switchOn > 0 && switchOn <= latestRound);
    const switchTs = found?.upgrade.switchTs;
    // The vote passed: only then is the pending protocol what the chain is upgrading to.
    const passed = switchPending || found?.upgrade.status === "approved" || found?.upgrade.status === "applied";
    // Closed by now, so its close round's block exists.
    const voteClosed = voteBefore <= latestRound || (!!found && found.upgrade.status !== "voting");
    // The block that proposed it already shows it as proposed.
    const shownNext = state.nextProtocol !== vote.upgradePropose ? next : null;

    const tally = (
        <>
            <span className="text-foreground">{state.nextProtocolApprovals.toLocaleString()}</span>
            {voteRounds ? (
                <span className="text-muted-foreground">
                    {" / "}{voteRounds.toLocaleString()}
                    {threshold ? ` · ${threshold.toLocaleString()} needed` : ""}
                </span>
            ) : null}
        </>
    );

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
                    {shownNext ? (
                        <Cell>
                            <Field label={passed ? "Upgrading to" : "Voting on"}>
                                <ConsensusVersion info={shownNext} showLink />
                            </Field>
                        </Cell>
                    ) : null}

                    {proposed ? (
                        <Cell>
                            <Field label="Upgrade proposed">
                                <ConsensusVersion info={proposed} showLink />
                                {vote.upgradeDelay > 0 ? (
                                    <div className="text-muted-foreground">
                                        {vote.upgradeDelay.toLocaleString()} round delay after the vote
                                    </div>
                                ) : null}
                            </Field>
                        </Cell>
                    ) : null}

                    {switchPending ? (
                        <>
                            {/* No proposer's vote here: nothing is being voted on. */}
                            <Cell>
                                <Field label="Status">
                                    <span className="text-primary">Approved</span>
                                    <span className="text-muted-foreground">
                                        {" · "}switches in {(switchOn - round).toLocaleString()} {switchOn - round === 1 ? "round" : "rounds"}
                                    </span>
                                    {found ? <AttemptLine found={found} /> : null}
                                </Field>
                            </Cell>

                            <Cell>
                                <Field label="Final vote">{tally}</Field>
                            </Cell>

                            <Cell>
                                <Field label="Vote closed">
                                    <LinkToBlock id={voteBefore} />
                                </Field>
                            </Cell>

                            {switchOn > 0 ? (
                                <Cell>
                                    <Field label={applied ? "Switched on" : "Switches on"}>
                                        <RoundRef round={switchOn} exists={switchOn <= latestRound || applied} />
                                        {switchTs ? <span className="text-muted-foreground ml-2">{day(switchTs)}</span> : null}
                                    </Field>
                                </Cell>
                            ) : null}
                        </>
                    ) : (
                        <>
                            <Cell>
                                <Field label="Proposer's vote">
                                    {vote.upgradeApprove ? (
                                        <span className="text-primary">Approve</span>
                                    ) : (
                                        <span className="text-muted-foreground">No vote</span>
                                    )}
                                </Field>
                            </Cell>

                            {next ? (
                                <>
                                    <Cell>
                                        <Field label="Vote tally at this block">
                                            <VoteProgress
                                                vote={voteStatus(
                                                    { nextProtocolApprovals: state.nextProtocolApprovals, phase: "voting", roundsRemaining: votingRoundsLeft },
                                                    voteRounds,
                                                    threshold,
                                                )}
                                                roundsRemaining={votingRoundsLeft}
                                                verdict={false}
                                            />
                                        </Field>
                                    </Cell>

                                    {voteBefore > 0 ? (
                                        <Cell>
                                            <Field label="Voting close round">
                                                <RoundRef round={voteBefore} exists={voteClosed} />
                                            </Field>
                                        </Cell>
                                    ) : null}

                                    {found ? (
                                        <Cell>
                                            <Field label="Outcome">
                                                <VoteOutcome found={found} voteRounds={voteRounds} />
                                            </Field>
                                        </Cell>
                                    ) : null}

                                    {/* Hidden once surf idx says the vote failed: it never switched. */}
                                    {switchOn > 0 && found?.upgrade.status !== "rejected" ? (
                                        <Cell>
                                            <Field
                                                label={applied ? "Switched on" : passed ? "Switches on" : "Switch round if approved"}
                                            >
                                                <RoundRef round={switchOn} exists={switchOn <= latestRound || applied} />
                                                {switchTs ? (
                                                    <span className="text-muted-foreground ml-2">{day(switchTs)}</span>
                                                ) : null}
                                            </Field>
                                        </Cell>
                                    ) : null}
                                </>
                            ) : null}
                        </>
                    )}
                </div>
                {found ? <HistoryButton found={found} className="mt-4 sm:hidden" /> : null}
            </div>
        </div>
    );
}
