import './LiveUpgrade.scss';
import React from "react";
import {useSelector} from "react-redux";
import {RootState} from "../../../../redux/store";
import {shadedClr} from "../../../../utils/common";
import LinkToBlock from "../Common/Links/LinkToBlock";
import {CoreBlock} from "../../../../packages/core-sdk/classes/core/CoreBlock";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {Chip,Box} from "@mui/material";
import TxnTypeChip from "../Common/TxnTypeChip/TxnTypeChip";

function LiveUpgrade(): JSX.Element {
    const  { rounds, eta, name } = useSelector((state: RootState) => state.liveData.upgrade);

    return eta?.length ? (
        <div className="upgrade-body">
            <div className="left">
                <span className="primary">Algorand</span>{' '}<span className="grey">v4</span>
            </div>
            <div className="right">
                <div>
                    Upgrade <span className="grey">Countdown</span>
                </div>
                <div><b className="primary">{rounds.toLocaleString()}</b> <span className="">rounds</span></div>
                <div>
                    {eta.map((str, i) =>
                        <span key={`s${i}}`} className={i % 2 === 1 && i !== 1 ? "grey" :
                            ( i === 1 ? "" : "primary")}>
                            {str}{' '}
                        </span>
                    )}
                </div>
            </div>
        </div>
    ) : null;
}

export default LiveUpgrade;
