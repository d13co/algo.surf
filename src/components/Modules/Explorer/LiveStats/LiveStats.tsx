import './LiveStats.scss';
import React from "react";
import {useLiveData} from "../../../../hooks/useLiveData";
import {shadedClr} from "../../../../utils/common";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {Tooltip,Box} from "@mui/material";
import {CoreBlock} from "../../../../packages/core-sdk/classes/core/CoreBlock";

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

    return (<div className={"live-stats-wrapper"}>
        <div className={"live-stats-container"}>
            <div className={"live-stats-header"}>
                <Box sx={{ color: 'primary.main'}}>
                    Latest Stats
                </Box>
            </div>
            <div className={"live-stats-body"}>
                <Tooltip placement="top" title={tpsBlocks === "-" ? "Loading" : `TPS over the last ${tpsBlocks} blocks (${tpsSec} seconds)`}>
                    <div className="row help"> <span>Transactions per second</span> <span>{tps}</span> </div>
                </Tooltip>
                <Tooltip placement="top" title={tpsBlocks === "-" ? `Loading` : `Average block time over the last ${tpsBlocks} blocks`}>
                    <div className="row help"> <span>Average Block Time</span> <span>{avg}</span> </div>
                </Tooltip>
                <Tooltip placement="top" title={tpsBlocks === "-" ? `Loading` : <>Total transactions on Algorand {NETWORK}{NETWORK==="Mainnet" ? <>.<br/><br />Corrected for the transactions performed before the transaction counter (tc) was implemented.</> : null}</>}>
                    <div className="row help"> <span>Transactions</span> <span>{tc}</span></div>
                </Tooltip>
                <Tooltip placement="bottom" title={`Algorand transactions are final as soon as they are included in a block`}>
                    <div className="row help"> <span>Confirmation time</span> <span>0 blocks</span> </div>
                </Tooltip>
                <Tooltip placement="bottom" title={`Algorand does not fork`}>
                    <div className="row help"> <span>Last Forked</span> <span>Never</span> </div>
                </Tooltip>
            </div>
        </div>
    </div>);
}

export default LiveStats;
