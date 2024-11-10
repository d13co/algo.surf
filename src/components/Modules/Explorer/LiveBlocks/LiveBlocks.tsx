import './LiveBlocks.scss';
import React from "react";
import {useSelector} from "react-redux";
import {RootState} from "../../../../redux/store";
import {shadedClr} from "../../../../utils/common";
import LinkToBlock from "../Common/Links/LinkToBlock";
import {CoreBlock} from "../../../../packages/core-sdk/classes/core/CoreBlock";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {Chip,Box} from "@mui/material";
import TxnTypeChip from "../Common/TxnTypeChip/TxnTypeChip";

function LiveBlocks(): JSX.Element {
    const liveData = useSelector((state: RootState) => state.liveData);
    const {blocks} = liveData;

    return (<div className={"live-blocks-wrapper"}>
        <div className={"live-blocks-container"}>
            <div className={"live-blocks-header"}>
                <Box sx={{ color: 'primary.main'}}>
                    Latest Blocks
                </Box>

            </div>
            <div className={"live-blocks-body"}>
                <TransitionGroup component="div">
                    {blocks.map((block) => {
                        const blockInstance = new CoreBlock(block);

                        return <CSSTransition key={blockInstance.getRound()} timeout={700} classNames="item">
                            <div className="block" key={blockInstance.getRound()} style={{backgroundColor: shadedClr}}>
                                <div className="round">
                                    <div className="round-header">
                                        <LinkToBlock name={'#' + blockInstance.getRound()} id={blockInstance.getRound()}></LinkToBlock>
                                        <span className="text-right faded">
                                            {blockInstance.getTransactionsCount()} Transactions
                                        </span>
                                    </div>
                                    <div className="round-header" style={{marginTop: "8px"}}>
                                        <div className="sub-text" style={{display: "flex", lineHeight: 5, flexWrap: "wrap", gap:"2px"}}>
                                            {Object.entries(blockInstance.getTransactionsTypesCount()).map(
                                                ([type, count]) => <TxnTypeChip type={type} count={count} />
                                            )}
                                        </div>
                                        <div className="sub-text faded text-right" style={{marginLeft: "2px"}}>
                                            {blockInstance.getTimestampDuration()} ago
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CSSTransition>;
                    })}
                </TransitionGroup>

            </div>
        </div>
    </div>);
}

export default LiveBlocks;
