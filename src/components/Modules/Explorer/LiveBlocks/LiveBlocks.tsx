import React, { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronUp } from "lucide-react";
import { useLatestRound } from "@d13co/algo-metrics-react";
import dateFormat from "dateformat";
import { useRoundHref, useRoundNavigate } from "src/hooks/useRound";
import { useHomeBlocks } from "src/hooks/useHomeBlocks";
import { cn } from "src/lib/utils";
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
                    <span className="shrink-0 whitespace-nowrap border border-primary text-primary rounded-full px-2 py-0.5 text-xs cursor-default">
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

/**
 * When a block was made, against the shown round's: live, how long ago; at a round, the anchor's
 * UTC time and, for the blocks before it, how long before it.
 */
function BlockTime({ block, anchor }: { block: Block; anchor?: Block }): JSX.Element {
    const ts = Number(block.header.timestamp);
    if (!anchor) return <MultiDateViewer timestamp={ts} fixedView="relative" noCopy />;
    const anchorTs = Number(anchor.header.timestamp);
    if (block === anchor) {
        return <span title={dateFormat(new Date(ts * 1000), "UTC:yyyy-mm-dd HH:MM:ss") + " UTC"}>{dateFormat(new Date(ts * 1000), "UTC:HH:MM:ss")} UTC</span>;
    }
    return <span>{anchorTs - ts}s before</span>;
}

function BlockItem({ block, anchor, ...transitionProps }: { block: Block; anchor?: Block } & Record<string, unknown>) {
    const nodeRef = useRef<HTMLAnchorElement>(null);
    const roundHref = useRoundHref();
    const round = Number(block.header.round);
    const { total, counts } = countTxnTypes(block.payset);
    const isAnchor = block === anchor;

    return (
        <CSSTransition {...transitionProps} key={round} timeout={700} classNames="item" nodeRef={nodeRef}>
            <Link
                ref={nodeRef}
                to={roundHref("/block/" + round)}
                aria-current={isAnchor ? "true" : undefined}
                className={cn(
                    "block bg-background-card p-4 my-3 border-l-[6px] border-primary rounded overflow-hidden hover:bg-background-card/80",
                    isAnchor && "outline outline-2 outline-primary outline-offset-2",
                )}
            >
                <div className="w-full">
                    <div className="flex justify-between items-center flex-wrap">
                        <span className="text-primary font-medium">{round}</span>
                        <span className="text-right grow text-muted-foreground">
                            {total} Transactions
                        </span>
                    </div>
                    {/* One line, clipped: a block with many kinds of transaction would wrap onto a second
                        and change the card's height, which made a replay jump. */}
                    <div className="flex justify-between items-center gap-1 mt-6">
                        <div className="text-[13px] flex leading-5 flex-nowrap gap-0.5 min-w-0 overflow-hidden">
                            {Object.entries(counts).map(
                                ([type, count]) => <TxnTypePill key={type} type={type} count={count} />
                            )}
                        </div>
                        <div className="text-[13px] text-muted-foreground text-right ml-0.5 shrink-0 whitespace-nowrap">
                            <BlockTime block={block} anchor={anchor} />
                        </div>
                    </div>
                </div>
            </Link>
        </CSSTransition>
    );
}

function LiveBlocks(): JSX.Element {
    const { round, blocks, isLoading, error } = useHomeBlocks();
    const navigate = useRoundNavigate();
    const navigateLive = useNavigate();
    const latest = useLatestRound();
    // At the tip there is no newer block: the step goes back to the live page.
    const atTip = round !== undefined && latest !== null && round >= Number(latest);
    // At a round, R is the window's newest block once it has loaded.
    // While the next window loads, the one still shown keeps its own anchor, so the cards don't flip to "ago" and back.
    const anchor = round !== undefined ? blocks[0] : undefined;

    return (
        <div>
            <div className="text-left">
                <div className="text-xl text-primary">
                    Blocks
                </div>
                <div className="mt-5">
                    {round !== undefined ? (
                        // One block on: the same page at R + 1.
                        <button
                            type="button"
                            onClick={() => (atTip ? navigateLive("/") : navigate(`/?round=${round + 1}`, { replace: true }))}
                            className="mb-1 flex w-full min-h-11 items-center justify-center gap-1.5 rounded border border-dashed border-primary/50 text-sm text-muted-foreground hover:text-foreground hover:border-primary"
                        >
                            <ChevronUp className="h-4 w-4" />
                            {atTip ? "Latest block: back to live" : `Newer: block ${(round + 1).toLocaleString()}`}
                        </button>
                    ) : null}
                    {error && !blocks.length ? (
                        <div className="text-sm text-muted-foreground">Could not load the blocks up to {round?.toLocaleString()}: {String(error)}</div>
                    ) : null}
                    {round !== undefined && isLoading && !blocks.length ? <div className="text-sm text-muted-foreground">Loading blocks…</div> : null}
                    {/* Live, new blocks slide in. At a round, a step swaps the list in place: an entering
                        and a leaving card side by side changed its height on every step of a replay. */}
                    <TransitionGroup component="div" enter={round === undefined} exit={round === undefined}>
                        {blocks.map((block) => (
                            <BlockItem key={Number(block.header.round)} block={block} anchor={anchor} />
                        ))}
                    </TransitionGroup>
                </div>
            </div>
        </div>
    );
}

export default LiveBlocks;
