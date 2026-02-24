import React from "react";
import {useLiveData} from "../../../../hooks/useLiveData";
import LinkToBlock from "../v2/Links/LinkToBlock";
import {CoreBlock} from "../../../../packages/core-sdk/classes/core/CoreBlock";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import MultiDateViewer from "../../../v2/MultiDateViewer";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const txnTypeMap: Record<string, [string, string]> = {
    appl: ["app", "application"],
    axfer: ["asset", "asset transfer"],
    afrz: ["freeze", "asset freeze"],
    acfg: ["asset cfg", "asset configuration"],
    pay: ["algo", "algo payment"],
    stpf: ["state proof", "state proof"],
    keyreg: ["keyreg", "key registration"],
};

function TxnTypePill({ type, count }: { type: string; count: number }) {
    const [typeToShow, longTypeToShow] = txnTypeMap[type] ?? [type, type];
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="border border-primary text-primary rounded-full px-2 py-0.5 text-xs cursor-default">
                        {count} {typeToShow}
                    </span>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white border-border">
                    <p>This block has {count} {longTypeToShow} transactions</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

function LiveBlocks(): JSX.Element {
    const {blocks} = useLiveData();

    return (
        <div>
            <div className="text-left">
                <div className="text-xl text-primary">
                    Latest Blocks
                </div>
                <div className="mt-5">
                    <TransitionGroup component="div">
                        {blocks.map((block) => {
                            const blockInstance = new CoreBlock(block);

                            return (
                                <CSSTransition key={blockInstance.getRound()} timeout={700} classNames="item">
                                    <div
                                        className="bg-background-card p-4 my-3 flex justify-between border-l-[6px] border-primary rounded overflow-hidden"
                                    >
                                        <div className="w-full">
                                            <div className="flex justify-between items-center flex-wrap">
                                                <LinkToBlock id={blockInstance.getRound()} />
                                                <span className="text-right grow text-muted-foreground">
                                                    {blockInstance.getTransactionsCount()} Transactions
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center flex-wrap mt-2">
                                                <div className="mt-4 text-[13px] flex leading-5 flex-wrap gap-0.5">
                                                    {Object.entries(blockInstance.getTransactionsTypesCount()).map(
                                                        ([type, count]) => <TxnTypePill key={type} type={type} count={count} />
                                                    )}
                                                </div>
                                                <div className="mt-4 text-[13px] text-muted-foreground text-right ml-0.5">
                                                    <MultiDateViewer timestamp={blockInstance.getTimestamp()} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CSSTransition>
                            );
                        })}
                    </TransitionGroup>
                </div>
            </div>
        </div>
    );
}

export default LiveBlocks;
