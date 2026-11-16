import React from "react";
import {
    useTransactionsPerSecond,
    useAverageRoundTime,
    useTransactionCount,
    useBlockData,
    useBlockDataAt,
    useOnlineStake,
} from "@d13co/algo-metrics-react";
import { useRound, useRoundHref } from "src/hooks/useRound";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import { Link } from "react-router-dom";
import { useFeeTotal } from "src/hooks/useFees";
import { surfIdxSupported } from "src/utils/surfIdx";
import { microalgosToAlgos } from "src/utils/common";

const NETWORK = process.env.REACT_APP_NETWORK;

const FEE_PERIODS = [
    { period: "24h", label: "Fees 24h", span: "24 hours" },
    { period: "7d", label: "Fees 7d", span: "7 days" },
    { period: "30d", label: "Fees 30d", span: "30 days" },
] as const;

function FeeRow({ period, label, span }: (typeof FEE_PERIODS)[number]): JSX.Element {
    const { data } = useFeeTotal(period);
    const roundHref = useRoundHref();
    const value = data
        ? microalgosToAlgos(data.fees).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " ALGO"
        : "-";

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Link to={roundHref("/fees")} className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 text-muted-foreground hover:text-foreground">
                        <span>{label}</span>
                        <span className="text-primary ml-2.5">{value}</span>
                    </Link>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black text-white border-border">
                    <p>Fees paid over the last {span}, inner transactions included. Click for charts.</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

/** Rounds the TPS and block-time stats span. */
const STATS_SPAN = 100;

const compactAlgo = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 });

function LiveStats(): JSX.Element {
    // The 100 rounds up to ?round=R (read from the time-travel node), else the last 100 of the live window, which
    // stays at 1,000 blocks for the ETAs that average over it (upgrade countdown, key expiry).
    const { round } = useRound();
    const roundHref = useRoundHref();
    const at = { round, span: STATS_SPAN };
    const tpsValue = useTransactionsPerSecond(at);
    const avgRoundTime = useAverageRoundTime(at);
    const txnCount = useTransactionCount(at);
    const blockData = useBlockData(at);
    const onlineStake = useOnlineStake(at);
    // Same read as the hooks above (same round and span), so no extra request: only its error is new.
    const { error: atError } = useBlockDataAt(round, STATS_SPAN);

    const blockCount = blockData?.length ?? 0;
    const spanBlocks = Math.max(0, blockCount - 1);
    const windowText = round !== undefined ? `the ${spanBlocks} blocks up to ${round.toLocaleString()}` : `the last ${spanBlocks} blocks`;
    const pendingText = atError
        ? `Could not read ${round !== undefined ? `the blocks up to ${round.toLocaleString()}` : "the latest blocks"}: ${(atError as Error).message}`
        : "Loading";

    const tps = tpsValue != null ? tpsValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "-";
    const avg = avgRoundTime != null
        ? avgRoundTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "s"
        : "-";
    const tc = txnCount != null ? Number(txnCount).toLocaleString() : "-";

    // Near genesis the window holds fewer: blocks 0 … R
    const loading = blockCount < (round !== undefined ? Math.min(4, round + 1) : 4);
    // Window duration from actual timestamps — immune to round gaps in the data
    const intervalMinutes = blockData != null && blockCount > 1
        ? Math.round((blockData[blockCount - 1].ts - blockData[0].ts) / 60)
        : null;

    return (
        <div>
            <div className="text-left mb-1">
                <div className="text-xl text-primary">
                    Stats
                </div>
                <div className="mt-4 max-md:flex max-md:flex-col max-md:items-center">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {surfIdxSupported ? (
                                    <Link to={roundHref("/tps")} className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 text-muted-foreground hover:text-foreground">
                                        <span>Transactions per second</span>
                                        <span className="text-primary ml-2.5">{tps}</span>
                                    </Link>
                                ) : (
                                    <div className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 cursor-help text-muted-foreground">
                                        <span>Transactions per second</span>
                                        <span className="text-primary ml-2.5">{tps}</span>
                                    </div>
                                )}
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-black text-white border-border">
                                <p>{loading ? pendingText : `TPS over ${windowText} (~${intervalMinutes} minutes)`}{surfIdxSupported ? ". Click for charts." : ""}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 cursor-help text-muted-foreground">
                                    <span>Average Block Time</span>
                                    <span className="text-primary ml-2.5">{avg}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-black text-white border-border">
                                <p>{loading ? pendingText : `Average block time over ${windowText} (~${intervalMinutes} minutes)`}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 cursor-help text-muted-foreground">
                                    <span>Transactions</span>
                                    <span className="text-primary ml-2.5">{tc}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-black text-white border-border max-w-xs">
                                <p>
                                    Total transactions on Algorand {NETWORK}{round !== undefined ? ` up to block ${round.toLocaleString()}` : ""}
                                    {NETWORK === "Mainnet" ? <>.<br/><br/>Corrected for the transactions performed before the transaction counter (tc) was implemented.</> : null}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {/* The fee totals end now: hidden at a past round rather than shown beside its stats. */}
                    {surfIdxSupported && round === undefined ? FEE_PERIODS.map((p) => <FeeRow key={p.period} {...p} />) : null}

                    {/* Always a row ("-" while it loads), so stepping through rounds doesn't move the panel. */}
                    {(
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 cursor-help text-muted-foreground">
                                        <span>Online stake</span>
                                        <span className="text-primary ml-2.5">{onlineStake != null ? `${compactAlgo.format(Number(onlineStake / 1000n) / 1000)} ALGO` : "-"}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="bg-black text-white border-border">
                                    <p>Total stake of online accounts{round !== undefined ? ` at block ${round.toLocaleString()}` : ""}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 cursor-help text-muted-foreground">
                                    <span>Confirmation time</span>
                                    <span className="text-primary ml-2.5">0 blocks</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-black text-white border-border">
                                <p>Algorand transactions are final as soon as they are included in a block</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 cursor-help text-muted-foreground">
                                    <span>Last Forked</span>
                                    <span className="text-primary ml-2.5">Never</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-black text-white border-border">
                                <p>Algorand does not fork</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </div>
    );
}

export default LiveStats;
