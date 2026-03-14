import React from "react";
import {
    useTransactionsPerSecond,
    useAverageRoundTime,
    useTransactionCount,
    useBlockData,
} from "@d13co/algo-metrics-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const NETWORK = process.env.REACT_APP_NETWORK;

function LiveStats(): JSX.Element {
    const tpsValue = useTransactionsPerSecond();
    const avgRoundTime = useAverageRoundTime();
    const txnCount = useTransactionCount();
    const blockData = useBlockData();

    const blockCount = blockData?.length ?? 0;

    const tps = tpsValue != null ? tpsValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "-";
    const avg = avgRoundTime != null
        ? avgRoundTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "s"
        : "-";
    const tc = txnCount != null ? Number(txnCount).toLocaleString() : "-";

    const loading = blockCount < 4;
    const intervalMinutes = avgRoundTime != null && blockCount > 1
        ? Math.round((avgRoundTime * blockCount) / 60)
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
                                <div className="flex justify-between w-[90%] max-md:min-w-[80%] max-md:w-auto mb-2.5 cursor-help text-muted-foreground">
                                    <span>Transactions per second</span>
                                    <span className="text-primary ml-2.5">{tps}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-black text-white border-border">
                                <p>{loading ? "Loading" : `TPS over the last ${blockCount} blocks (~${intervalMinutes} minutes)`}</p>
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
                                <p>{loading ? "Loading" : `Average block time over the last ${blockCount} blocks (~${intervalMinutes} minutes)`}</p>
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
                                    Total transactions on Algorand {NETWORK}
                                    {NETWORK === "Mainnet" ? <>.<br/><br/>Corrected for the transactions performed before the transaction counter (tc) was implemented.</> : null}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

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
