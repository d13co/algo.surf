import React from "react";
import {useLiveData} from "../../../../hooks/useLiveData";
import {CoreBlock} from "../../../../packages/core-sdk/classes/core/CoreBlock";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const NETWORK = process.env.REACT_APP_NETWORK;

function LiveStats(): JSX.Element {
    const { blocks } = useLiveData();

    const coreBlocks = React.useMemo(() => blocks.map((b) => new CoreBlock(b)), [blocks]);

    const tc = React.useMemo(() => {
        if (!coreBlocks.length) return "-";
        const txnCounter = coreBlocks[0].get().txnCounter ?? 0;
        return (Number(txnCounter) + (NETWORK === "Mainnet" ? 563279 : 0)).toLocaleString();
    }, [coreBlocks]);

    const avg = React.useMemo(() => {
        if (coreBlocks.length < 4) return "-";
        const last = coreBlocks[0];
        const firstIdx = Math.min(9, coreBlocks.length - 1);
        const first = coreBlocks[firstIdx];
        const dt = last.getTimestamp() - first.getTimestamp();
        return (dt / (firstIdx)).toLocaleString(undefined, { maximumFractionDigits: 3 })+"s";
    }, [coreBlocks]);

    const [tps, tpsBlocks, tpsSec] = React.useMemo(() => {
        if (coreBlocks.length < 4) return ["-", "-", "-"];
        const last = coreBlocks[0];
        const firstIdx = Math.min(10, coreBlocks.length - 1);
        const first = coreBlocks[firstIdx];
        const second = coreBlocks[firstIdx - 1];
        const dt = last.getTimestamp() - first.getTimestamp();
        const lastTc = Number(last.get().txnCounter ?? 0);
        const secondTc = Number(second.get().txnCounter ?? 0);
        const dtc = lastTc - secondTc;
        return [
            Math.round(dtc / dt).toLocaleString(),
            firstIdx,
            dt
        ];
    }, [coreBlocks]);

    return (
        <div>
            <div className="text-left mb-1">
                <div className="text-xl text-primary">
                    Latest Stats
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
                                <p>{tpsBlocks === "-" ? "Loading" : `TPS over the last ${tpsBlocks} blocks (${tpsSec} seconds)`}</p>
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
                                <p>{tpsBlocks === "-" ? "Loading" : `Average block time over the last ${tpsBlocks} blocks`}</p>
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
