import './LiveStats.scss';
import React from "react";
import {useSelector} from "react-redux";
import {RootState} from "../../../../redux/store";
import {shadedClr} from "../../../../utils/common";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {Box} from "@mui/material";

function LiveStats(): JSX.Element {
    const liveData = useSelector((state: RootState) => state.liveData);

    return (<div className={"live-stats-wrapper"}>
        <div className={"live-stats-container"}>
            <div className={"live-stats-header"}>
                <Box sx={{ color: 'primary.main'}}>
                    Latest Stats
                </Box>
            </div>
            <div className={"live-stats-body"}>
                <div className="row"> <span>Transactions per second</span> <span>100</span> </div>
                <div className="row"> <span>Average Block Time</span> <span>2.9s</span> </div>
                <div className="row"> <span>Total Transactions</span> <span>100</span> </div>
                <div className="row"> <span>Confirmation time</span> <span>0 blocks</span> </div>
                <div className="row"> <span>Last Forked</span> <span>Never</span> </div>
            </div>
        </div>
    </div>);
}

export default LiveStats;
