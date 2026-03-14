import React, { useRef } from "react";
import { Link } from "react-router-dom";
import { useLiveBlocks } from "../../../../hooks/useLiveBlocks";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import MultiDateViewer from "../../../v2/MultiDateViewer";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import type { modelsv2 } from "algosdk";

type Block = modelsv2.BlockResponse["block"];
type SignedTxnWithAD = Block["payset"][number]["signedTxn"];

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

function countTxnTypes(payset: Block["payset"]) {
    const counts: Record<string, number> = {};
    let total = 0;

    function walk(items: SignedTxnWithAD[]) {
        for (const item of items) {
            total++;
            const type = item.signedTxn.txn.type;
            counts[type] = (counts[type] ?? 0) + 1;
            const innerTxns = item.applyData?.evalDelta?.innerTxns;
            if (innerTxns?.length) {
                walk(innerTxns);
            }
        }
    }

    walk(payset.map((s) => s.signedTxn));
    return { total, counts };
}

function BlockItem({ block, ...transitionProps }: { block: Block } & Record<string, unknown>) {
    const nodeRef = useRef<HTMLAnchorElement>(null);
    const round = Number(block.header.round);
    const { total, counts } = countTxnTypes(block.payset);

    return (
        <CSSTransition {...transitionProps} key={round} timeout={700} classNames="item" nodeRef={nodeRef}>
            <Link ref={nodeRef} to={"/block/" + round} className="block bg-background-card p-4 my-3 border-l-[6px] border-primary rounded overflow-hidden hover:bg-background-card/80">
                <div className="w-full">
                    <div className="flex justify-between items-center flex-wrap">
                        <span className="text-primary font-medium">{round}</span>
                        <span className="text-right grow text-muted-foreground">
                            {total} Transactions
                        </span>
                    </div>
                    <div className="flex justify-between items-center flex-wrap mt-2">
                        <div className="mt-4 text-[13px] flex leading-5 flex-wrap gap-0.5">
                            {Object.entries(counts).map(
                                ([type, count]) => <TxnTypePill key={type} type={type} count={count} />
                            )}
                        </div>
                        <div className="mt-4 text-[13px] text-muted-foreground text-right ml-0.5">
                            <MultiDateViewer timestamp={Number(block.header.timestamp)} fixedView="relative" noCopy />
                        </div>
                    </div>
                </div>
            </Link>
        </CSSTransition>
    );
}

function LiveBlocks(): JSX.Element {
    const { blocks } = useLiveBlocks();

    return (
        <div>
            <div className="text-left">
                <div className="text-xl text-primary">
                    Blocks
                </div>
                <div className="mt-5">
                    <TransitionGroup component="div">
                        {blocks.map((block) => (
                            <BlockItem key={Number(block.header.round)} block={block} />
                        ))}
                    </TransitionGroup>
                </div>
            </div>
        </div>
    );
}

export default LiveBlocks;
