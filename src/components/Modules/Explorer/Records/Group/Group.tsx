import './Group.scss';
import React, {useEffect} from "react";
import {Outlet, useNavigate, useParams} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "../../../../../redux/store";
import {Grid, Tab, Tabs} from "@mui/material";
import LoadingTile from "../../../../Common/LoadingTile/LoadingTile";
import {loadGroup} from "../../../../../redux/explorer/actions/group";
import {CoreGroup} from "../../../../../packages/core-sdk/classes/core/CoreGroup";
import LinkToBlock from "../../Common/Links/LinkToBlock";
import {Alert} from "@mui/lab";
import useTitle from "../../../../Common/UseTitle/UseTitle";
import TxnTypeChip from "../../Common/TxnTypeChip/TxnTypeChip";

const network = process.env.REACT_APP_NETWORK;

function Group(): JSX.Element {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const params = useParams();
    const {id, blockId} = params;

    const group = useSelector((state: RootState) => state.group);

    const groupInstance = new CoreGroup(group.information);

    const txnTypes = groupInstance.getTransactionsTypesCount();
    const txnTypesList = React.useMemo(() => Object.keys(txnTypes), [txnTypes]);

    useEffect(() => {
        dispatch(loadGroup({id, blockId: Number(blockId)}));
    }, [dispatch, id, blockId]);

    useTitle(`Group Txn ${id}`);

    return (<div className={"group-wrapper"}>
        <div className={"group-container"}>
            <div className="group-header">
                <div>
                    Group transactions overview
                </div>
            </div>

            {group.loading ? <LoadingTile></LoadingTile> : <div className="group-body">
                <div className="id">
                    {groupInstance.getId()}
                </div>


                <div className="props">
                    <div className="property">
                        <div className="key">
                            Block
                        </div>
                        <div className="value">
                            <LinkToBlock id={groupInstance.getBlock()}></LinkToBlock>
                        </div>
                    </div>

                    <div className="property">
                        <div className="key">
                            Timestamp
                        </div>
                        <div className="value">
                            {groupInstance.getTimestampDisplayValue()}
                        </div>
                    </div>

                    <div className="property">
                        <div className="key">
                            Age
                        </div>
                        <div className="value">
                            {groupInstance.getTimestampDuration()} Ago
                        </div>
                    </div>


                    <div className="property">
                        <div className="key nowrap">
                            Total transactions: {groupInstance.getTransactionsCount()}
                        </div>
                        <div className="value flexwrap">
                            {txnTypesList.map((type) => {
                                return <TxnTypeChip parentType="group" type={type} count={txnTypes[type]} />
                            })}
                        </div>
                    </div>

                </div>



                <div className="group-tabs">

                    <Tabs TabIndicatorProps={{ children: <span className="MuiTabs-indicatorSpan" />}} value="transactions" className="related-list">
                        <Tab label="Transactions" value="transactions" onClick={() => {
                            navigate('/block/' + id + '/transactions');
                        }}/>
                    </Tabs>

                    <Outlet />


                </div>
            </div>}

        </div>
    </div>);
}

export default Group;
