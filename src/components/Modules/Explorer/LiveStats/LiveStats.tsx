import './LiveStats.scss';
import React from "react";
import {useSelector} from "react-redux";
import {RootState} from "../../../../redux/store";
import {shadedClr} from "../../../../utils/common";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {Tooltip,Box} from "@mui/material";

const NETWORK = process.env.REACT_APP_NETWORK;

function LiveStats(): JSX.Element {
    const liveData = useSelector((state: RootState) => state.liveData);

    const tc = React.useMemo(() => {
        return liveData.blocks.length ? (liveData.blocks[0]["txn-counter"] + (NETWORK === "Mainnet" ? 563279 : 0)).toLocaleString() : "-";
    }, [liveData.blocks]);

    const avg = React.useMemo(() => {
        const { blocks } = liveData;
        if (blocks.length < 4) return "-";
        const [ last ] = blocks;
        const firstIdx = Math.min(9, blocks.length - 1);
        const first = blocks[firstIdx];
        const dt = last.timestamp - first.timestamp
        return (dt / (firstIdx)).toLocaleString(undefined, { maximumFractionDigits: 3 })+"s";
    }, [liveData.blocks]);

    const [tps, tpsBlocks, tpsSec] = React.useMemo(() => {
        const { blocks } = liveData;
        if (blocks.length < 4) return ["-", "-", "-"];
        const [ last ] = blocks;
        const firstIdx = Math.min(10, blocks.length - 1);
        const first = blocks[firstIdx];
        const second = blocks[firstIdx - 1];
        const dt = last.timestamp - first.timestamp
        const dtc = last["txn-counter"] - second["txn-counter"];
        return [
            Math.round(dtc / dt).toLocaleString(),
            firstIdx,
            dt
        ];
    }, [liveData.blocks]);

    console.log(tc);

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
