import React from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "src/components/v2/ui/dialog";
import Copyable from "src/components/v2/Copyable";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import LinkToBlock from "src/components/Modules/Explorer/v2/Links/LinkToBlock";
import { ConsensusUpgrade } from "src/hooks/useConsensusUpgrade";
import { useConsensusVersionLookup } from "src/hooks/useConsensusVersions";
import UpgradeEta from "./UpgradeEta";
import { verdictClassName, votePercent, voteStatus } from "./voteStatus";

/**
 * The full protocol string, for spec-URL protocols. Skipped for bare tokens like "fnet5", where the
 * raw string is already the displayed name and repeating it just reads as a stutter.
 */
function RawProtocol({ protocol, name }: { protocol: string; name: string }): JSX.Element | null {
    if (protocol === name) return null;
    return (
        <div className="mt-1 flex items-center min-w-0 text-muted-foreground text-xs">
            <span className="truncate">{protocol}</span>
            <Copyable value={protocol} />
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="grid grid-cols-12 gap-2 py-2 border-b border-border last:border-0">
            <div className="col-span-12 sm:col-span-5 text-muted-foreground text-[13px]">{label}</div>
            <div className="col-span-12 sm:col-span-7 text-[13px] text-foreground min-w-0">{children}</div>
        </div>
    );
}

export default function ConsensusUpgradeDialog({
    open,
    onOpenChange,
    upgrade,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    upgrade: ConsensusUpgrade;
}): JSX.Element {
    const lookup = useConsensusVersionLookup();

    const current = lookup(upgrade.currentProtocol);
    const next = lookup(upgrade.nextProtocol);
    const vote = voteStatus(upgrade, current.voteRounds, current.threshold);

    const avmChanged = current.avm != null && next.avm != null && current.avm !== next.avm;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-background-muted text-foreground">
                <DialogHeader>
                    <DialogTitle>
                        {upgrade.phase === "voting" ? "Consensus Upgrade Vote" : "Consensus Upgrade"}
                    </DialogTitle>
                    <DialogDescription>
                        {upgrade.phase === "voting"
                            ? "Block proposers are voting on this protocol upgrade."
                            : "This protocol upgrade is approved and waiting to switch on."}
                    </DialogDescription>
                </DialogHeader>

                <div className="overflow-y-auto min-h-0">
                    <Row label="Current protocol">
                        <ConsensusVersion info={current} showLink />
                        <RawProtocol protocol={upgrade.currentProtocol} name={current.name} />
                    </Row>

                    <Row label="Upgrading to">
                        <ConsensusVersion info={next} showLink />
                        <RawProtocol protocol={upgrade.nextProtocol} name={next.name} />
                    </Row>

                    {avmChanged ? (
                        <Row label="AVM version">
                            <span className="text-muted-foreground">{current.avm}</span>
                            <span className="text-muted-foreground mx-1.5">→</span>
                            <span className="text-primary">{next.avm}</span>
                        </Row>
                    ) : null}

                    <Row label="Status">
                        <span className={verdictClassName(vote.verdict)}>{vote.label}</span>
                    </Row>

                    <Row label="Votes in favour">
                        {vote.voteRounds && vote.noVotes != null ? (
                            <>
                                <span className="text-foreground">
                                    {votePercent(vote.approvals, vote.approvals + vote.noVotes)}%
                                </span>
                                <span className="text-muted-foreground">
                                    {" · "}{vote.approvals.toLocaleString()}
                                    {" / "}{vote.voteRounds.toLocaleString()}
                                    {vote.threshold ? ` · ${vote.threshold.toLocaleString()} needed` : ""}
                                </span>
                            </>
                        ) : (
                            <span className="text-foreground">{vote.approvals.toLocaleString()}</span>
                        )}
                    </Row>

                    {upgrade.nextProtocolVoteBefore > 0 ? (
                        <Row label="Voting closes">
                            {/* Only a link once the vote has closed. While voting, this round has
                                not been produced yet, so the block page would 404. */}
                            {upgrade.phase === "voting" ? (
                                <span>round {upgrade.nextProtocolVoteBefore.toLocaleString()}</span>
                            ) : (
                                <LinkToBlock id={upgrade.nextProtocolVoteBefore} />
                            )}
                            <span className="text-muted-foreground ml-2">
                                {upgrade.phase === "voting" ? "(open)" : "(closed)"}
                            </span>
                        </Row>
                    ) : null}

                    {/* Only once the outcome is assured: while the vote can still fail, the switch
                        round is speculative — showing it reads as a promise the tally hasn't made. */}
                    {upgrade.nextProtocolSwitchOn > 0 && vote.verdict === "approved" ? (
                        <Row label="Switches on">
                            {/* Never a link: the switch round is always in the future here — the
                                hook returns null once the chain reaches it — so it would 404. */}
                            round {upgrade.nextProtocolSwitchOn.toLocaleString()}
                        </Row>
                    ) : null}

                    <Row label={upgrade.phase === "voting" ? "Rounds left to vote" : "Rounds remaining"}>
                        {upgrade.roundsRemaining.toLocaleString()}
                        {upgrade.phase === "waiting" ? (
                            <span className="text-muted-foreground">
                                {" "}from round {upgrade.round.toLocaleString()}
                            </span>
                        ) : null}
                    </Row>

                    <Row label={upgrade.phase === "voting" ? "Voting closes in" : "Estimated switch"}>
                        <UpgradeEta targetEpoch={upgrade.targetEpoch} />
                        <div className="mt-1 text-muted-foreground text-xs">
                            {/* fixedView="local": MultiDateViewer's relative mode always appends
                                "ago", which reads wrong for a future timestamp.

                                Rounded to the minute so the display's seconds are a fixed :00.
                                TIMESTAMP_DISPLAY_FORMAT renders seconds, and this estimate is
                                roundsRemaining × a live average round time — the seconds digit
                                jittered on every block, implying a precision the projection
                                doesn't have. */}
                            <MultiDateViewer
                                timestamp={Math.round(upgrade.targetEpoch / 60) * 60}
                                variant="value"
                                fixedView="local"
                            />
                        </div>
                    </Row>

                    <Row label="Average round time">
                        {upgrade.avgRoundTime.toFixed(2)}s
                        <span className="text-muted-foreground">
                            {upgrade.avgRoundTimeSource === "constant"
                                ? " (assumed)"
                                : upgrade.avgRoundTimeSource === "liveblocks"
                                    ? " (recent blocks)"
                                    : " (live)"}
                        </span>
                    </Row>

                    {next.description ? (
                        <Row label={`What ${next.name} changes`}>
                            <p className="text-muted-foreground">{next.description}</p>
                        </Row>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
