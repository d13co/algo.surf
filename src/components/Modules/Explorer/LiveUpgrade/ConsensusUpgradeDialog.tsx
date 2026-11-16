import React from "react";
import { History } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "src/components/v2/ui/dialog";
import Copyable from "src/components/v2/Copyable";
import { Button } from "src/components/v2/ui/button";
import ConsensusVersion from "src/components/v2/ConsensusVersion";
import humanizeDuration from "humanize-duration";
import { useLatestRound } from "@d13co/algo-metrics-react";
import MultiDateViewer, { formatDate } from "src/components/v2/MultiDateViewer";
import { useBlockHeader } from "src/hooks/useBlock";
import LinkToBlock from "src/components/Modules/Explorer/v2/Links/LinkToBlock";
import Link from "src/components/Modules/Explorer/v2/Links/Link";
import { useUpgradeAttempt } from "src/hooks/useUpgrades";
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

// Enough to show the trend; the history page has the rest.
const EARLIER_SHOWN = 5;

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="grid grid-cols-12 gap-2 py-2 border-b border-border last:border-0">
            <div className="col-span-12 sm:col-span-5 text-muted-foreground text-[13px]">{label}</div>
            <div className="col-span-12 sm:col-span-7 text-[13px] text-foreground min-w-0">{children}</div>
        </div>
    );
}

/** The estimate, in minutes: it is roundsRemaining × an average round time, so seconds would imply a precision it lacks. */
const toMinute = (ts: number) => Math.round(ts / 60) * 60;

/**
 * At ?round=R (`atRound`), the upgrade as it stood at block R: the ETA is projected from R's own
 * timestamp and block time, and once the chain has since reached the round the phase ends on, that
 * round's real time is shown next to the estimate.
 */
export default function ConsensusUpgradeDialog({
    open,
    onOpenChange,
    upgrade,
    atRound,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    upgrade: ConsensusUpgrade;
    atRound?: number;
}): JSX.Element {
    const lookup = useConsensusVersionLookup();
    const latestRaw = useLatestRound();
    const latest = latestRaw != null ? Number(latestRaw) : undefined;
    const voting = upgrade.phase === "voting";
    /** Rounds produced since: at R, links to them work and their times are known. */
    const exists = (r: number) => atRound !== undefined && latest !== undefined && r > 0 && r <= latest;
    const endRound = voting ? upgrade.nextProtocolVoteBefore : upgrade.nextProtocolSwitchOn;
    const reached = exists(endRound);
    const { data: endHeader } = useBlockHeader(reached && open ? endRound : 0);
    const endTs = endHeader?.timestamp ? Number(endHeader.timestamp) : undefined;

    const current = lookup(upgrade.currentProtocol);
    const next = lookup(upgrade.nextProtocol);
    const vote = voteStatus(upgrade, current.voteRounds, current.threshold);

    const avmChanged = current.avm != null && next.avm != null && current.avm !== next.avm;

    // From surf idx: earlier proposals of this protocol, newest first.
    const found = useUpgradeAttempt(upgrade.nextProtocolVoteBefore);
    const earlier = found ? found.group.attempts.slice(0, found.attempt - 1).reverse() : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] sm:max-h-[calc(100vh-2rem)] flex flex-col bg-background-muted text-foreground">
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

                    {next.description ? (
                        <Row label={`What ${next.name} changes`}>
                            <p className="text-muted-foreground">{next.description}</p>
                        </Row>
                    ) : null}

                    <Row label="Status">
                        <span className={verdictClassName(vote.verdict)}>{vote.label}</span>
                        {vote.explainer ? (
                            <span className="text-muted-foreground"> ({vote.explainer})</span>
                        ) : null}
                    </Row>

                    <Row label="Votes in favour">
                        {vote.voteRounds && vote.noVotes != null ? (
                            <>
                                <span className="text-foreground">
                                    {votePercent(vote.approvals, vote.approvals + vote.noVotes)}%
                                </span>
                                <span className="text-muted-foreground">
                                    {/* Out of votes cast so far, matching the percentage's base —
                                        the full window appears via "needed", whose count implies it. */}
                                    {" · "}{vote.approvals.toLocaleString()}
                                    {" / "}{(vote.approvals + vote.noVotes).toLocaleString()}
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
                            {voting ? (
                                <>
                                    {exists(upgrade.nextProtocolVoteBefore) ? (
                                        <LinkToBlock id={upgrade.nextProtocolVoteBefore} />
                                    ) : (
                                        <span>Round {upgrade.nextProtocolVoteBefore.toLocaleString()}</span>
                                    )}
                                    {/* One less than the distance to the close round — that round
                                        resolves the vote without casting one (see votableRoundsLeft). */}
                                    <span className="text-muted-foreground ml-2">
                                        ({upgrade.roundsRemaining.toLocaleString()} left)
                                    </span>
                                </>
                            ) : (
                                <>
                                    <LinkToBlock id={upgrade.nextProtocolVoteBefore} />
                                    <span className="text-muted-foreground ml-2">(closed)</span>
                                </>
                            )}
                        </Row>
                    ) : null}

                    {/* Only once the outcome is assured: while the vote can still fail, the switch
                        round is speculative — showing it reads as a promise the tally hasn't made. */}
                    {upgrade.nextProtocolSwitchOn > 0 && vote.verdict === "approved" ? (
                        <Row label="Switches on">
                            {/* Live, never a link: the switch round is always in the future here (the
                                hook returns null once the chain reaches it), so it would 404. At a
                                past round, it is a link once the chain has reached it. */}
                            {exists(upgrade.nextProtocolSwitchOn) ? (
                                <LinkToBlock id={upgrade.nextProtocolSwitchOn} />
                            ) : (
                                <>Round {upgrade.nextProtocolSwitchOn.toLocaleString()}</>
                            )}
                        </Row>
                    ) : null}

                    {/* While voting, the remaining count lives in "Voting closes"; this row's count
                        runs to the *switch* round, which only exists once the vote has closed. */}
                    {upgrade.phase === "waiting" ? (
                        <Row label="Rounds remaining">
                            {upgrade.roundsRemaining.toLocaleString()}
                            <span className="text-muted-foreground">
                                {" "}from round {upgrade.round.toLocaleString()}
                            </span>
                        </Row>
                    ) : null}

                    {atRound === undefined ? (
                        <Row label={voting ? "Voting close ETA" : "Estimated switch"}>
                            <UpgradeEta targetEpoch={upgrade.targetEpoch} />
                            <div className="mt-1 text-muted-foreground text-xs">
                                {/* fixedView="local": MultiDateViewer's relative mode always appends
                                    "ago", which reads wrong for a future timestamp. Rounded to the
                                    minute: the seconds digit jittered on every block. */}
                                <MultiDateViewer timestamp={toMinute(upgrade.targetEpoch)} variant="value" fixedView="local" />
                            </div>
                        </Row>
                    ) : reached ? (
                        // At a past round whose phase has since ended: when it did, then what R projected.
                        <Row label={voting ? "Voting closed" : "Switched"}>
                            {endTs !== undefined ? (
                                <MultiDateViewer timestamp={endTs} variant="value" fixedView="local" />
                            ) : (
                                <span className="text-muted-foreground">…</span>
                            )}
                            <div className="mt-1 text-muted-foreground text-xs">
                                Estimated at block {atRound.toLocaleString()}: {formatDate(toMinute(upgrade.targetEpoch), "local")}
                            </div>
                        </Row>
                    ) : (
                        // A countdown from a past block would run from now: count from R instead.
                        <Row label={voting ? "Voting close ETA" : "Estimated switch"}>
                            <span className="text-muted-foreground">~</span>
                            {humanizeDuration(Math.max(0, upgrade.targetEpoch - upgrade.roundTimestamp) * 1000, { largest: 2, round: true })}
                            <span className="text-muted-foreground"> after block {atRound.toLocaleString()}</span>
                            <div className="mt-1 text-muted-foreground text-xs">
                                <MultiDateViewer timestamp={toMinute(upgrade.targetEpoch)} variant="value" fixedView="local" />
                            </div>
                        </Row>
                    )}

                    {earlier.length > 0 ? (
                        <Row label={`Earlier attempts (this is #${found!.attempt})`}>
                            {earlier.slice(0, EARLIER_SHOWN).map((u, i) => (
                                <div key={u.voteBefore} className="flex justify-between gap-2">
                                    <span>
                                        <span className="text-muted-foreground mr-2">#{found!.attempt - 1 - i}</span>
                                        <LinkToBlock id={u.round} />
                                    </span>
                                    <span className="text-muted-foreground">
                                        {u.approvals?.toLocaleString() ?? "?"}
                                        {current.voteRounds ? ` / ${current.voteRounds.toLocaleString()}` : ""}
                                    </span>
                                </div>
                            ))}
                            {earlier.length > EARLIER_SHOWN ? (
                                <div className="text-muted-foreground">+{earlier.length - EARLIER_SHOWN} more</div>
                            ) : null}
                        </Row>
                    ) : null}

                    <Row label="Average round time">
                        {upgrade.avgRoundTime.toFixed(2)}s
                        <span className="text-muted-foreground">
                            {upgrade.avgRoundTimeSource === "constant"
                                ? " (assumed)"
                                : upgrade.avgRoundTimeSource === "liveblocks"
                                    ? " (recent blocks)"
                                    : atRound !== undefined
                                        ? ` (the 100 blocks up to block ${atRound.toLocaleString()})`
                                        : " (live)"}
                        </span>
                    </Row>

                    {found ? (
                        <div className="pt-3">
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-border text-primary hover:bg-primary/10"
                                asChild
                            >
                                <Link noStyle href={`/upgrades#${found.group.anchor}`} keepRound={false}>
                                    <History />
                                    Upgrade history
                                </Link>
                            </Button>
                        </div>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}
