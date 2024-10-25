import './Account.scss';
import React, {useEffect} from "react";
import {matchPath, Outlet, useLocation, useNavigate, useParams} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {loadAccount} from "../../../../../redux/explorer/actions/account";
import {RootState} from "../../../../../redux/store";
import {Chip, Grid, Tab, Tabs} from "@mui/material";
import NumberFormat from "react-number-format";
import {microalgosToAlgos} from "../../../../../utils/common";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import {CoreAccount} from "../../../../../packages/core-sdk/classes/core/CoreAccount";
import LoadingTile from "../../../../Common/LoadingTile/LoadingTile";
import JsonViewer from "../../../../Common/JsonViewer/JsonViewer";
import CustomError from "../../Common/CustomError/CustomError";
import Copyable from '../../../../Common/Copyable/Copyable';
import LinkToApplication from '../../Common/Links/LinkToApplication';
import LinkToAccount from '../../Common/Links/LinkToAccount';

function Account(): JSX.Element {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const params = useParams();
    const {address} = params;

    const account = useSelector((state: RootState) => state.account);

    let tabValue = 'transactions';
    const { pathname } = useLocation();

    if (matchPath("/explorer/account/:address/assets", pathname)) {
        tabValue = 'assets';
    }
    else if (matchPath("/explorer/account/:address/created-assets", pathname)) {
        tabValue = 'created-assets';
    }
    else if (matchPath("/explorer/account/:address/created-applications", pathname)) {
        tabValue = 'created-applications';
    }
    else if (matchPath("/explorer/account/:address/opted-applications", pathname)) {
        tabValue = 'opted-applications';
    }

    useEffect(() => {
        dispatch(loadAccount(address));
        document.title = `A.O: Account ${address}`
    }, [dispatch, address]);

    return (<div className={"account-wrapper"}>
        <div className={"account-container"}>

            {account.error ? <CustomError></CustomError> : <div>
                <div className="account-header">
                    <div>
                        Account overview
                    </div>
                    <div>
                        <JsonViewer obj={account.information} title="Account"></JsonViewer>
                    </div>
                </div>

                {account.loading ? <LoadingTile></LoadingTile> : <div className="account-body">
                    <div className="address">
                        <div className="id">
                            <div className="long-id">{account.information.address}</div> <Copyable value={account.information.address} />
                        </div>
                        <div style={{marginTop: 10}}>
                            { account.escrowOf ? <LinkToApplication id={account.escrowOf}><Chip className="hover-cursor-pointer" color={"success"} variant="outlined" label={`App Escrow`} size="small" style={{marginRight: '4px'}} /></LinkToApplication> : null }
                            <Chip color={"warning"} variant={"outlined"} label={account.information.status} size={"small"}></Chip>
                        </div>

                    </div>

                    <div className="props">
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                                <div className="property">
                                    <div className="key">
                                        Balance
                                    </div>
                                    <div className="value">
                                        <NumberFormat
                                            value={microalgosToAlgos(new CoreAccount(account.information).getBalance())}
                                            displayType={'text'}
                                            thousandSeparator={true}
                                        ></NumberFormat>
                                        <AlgoIcon></AlgoIcon>
                                        <Copyable value={microalgosToAlgos(new CoreAccount(account.information).getBalance())} />
                                    </div>
                                </div>
                            </Grid>
                            { account.escrowOf ? <>
                                <Grid item xs={12} sm={3} md={1} lg={1} xl={1}></Grid>
                                <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                                    <div className="property">
                                        <div className="key">
                                            Application Escrow
                                        </div>
                                        <div className="value">
                                            <LinkToApplication id={account.escrowOf} />
                                            <Copyable value={account.escrowOf} />
                                        </div>
                                    </div>
                                </Grid>
                            </> : null }
                            { account.information['auth-addr'] ? <>
                                <Grid item xs={12} sm={3} md={1} lg={1} xl={1}></Grid>
                                <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                                    <div className="property">
                                        <div className="key">
                                            Rekeyed to
                                        </div>
                                        <div className="value">
                                            <LinkToAccount strip={9} address={account.information['auth-addr']} />
                                        </div>
                                    </div>
                                </Grid>
                            </> : null }
                        </Grid>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                                <div className="property">
                                    <div className="key">
                                        Minimum balance
                                    </div>
                                    <div className="value">
                                        <NumberFormat
                                            value={microalgosToAlgos(new CoreAccount(account.information).getMinBalance())}
                                            displayType={'text'}
                                            thousandSeparator={true}
                                        ></NumberFormat>
                                        <AlgoIcon></AlgoIcon>
                                        <Copyable value={microalgosToAlgos(new CoreAccount(account.information).getMinBalance())} />
                                    </div>
                                </div>
                            </Grid>
                        </Grid>
                        <Grid container spacing={2} style={{marginTop: 5}}>




                            <Grid item xs={12} sm={6} md={6} lg={3} xl={3}>
                                <div className="property">
                                    <div className="key">
                                        Holding assets
                                    </div>
                                    <div className="value">
                                        {account.optedAssets.length}
                                    </div>
                                </div>

                                <div className="property">
                                    <div className="key">
                                        Created assets
                                    </div>
                                    <div className="value">
                                        {account.createdAssets.length}
                                    </div>
                                </div>
                            </Grid>
                            <Grid item xs={12} sm={3} md={1} lg={1} xl={1}></Grid>
                            <Grid item xs={12} sm={6} md={5} lg={3} xl={3}>
                                <div className="property">
                                    <div className="key">
                                        Created applications
                                    </div>
                                    <div className="value">
                                        {account.createdApplications.length}
                                    </div>
                                </div>

                                <div className="property">
                                    <div className="key">
                                        Opted applications
                                    </div>
                                    <div className="value">
                                        {account.optedApplications.length}
                                    </div>
                                </div>
                            </Grid>


                        </Grid>
                    </div>



                    <div className="account-tabs">

                        <Tabs TabIndicatorProps={{ children: <span className="MuiTabs-indicatorSpan" />}} value={tabValue} className="related-list">
                            <Tab label="Transactions" value="transactions" onClick={() => {
                                navigate('/explorer/account/' + address + '/transactions');
                            }}/>
                            <Tab label="Assets" value="assets" onClick={() => {
                                navigate('/explorer/account/' + address + '/assets');
                            }}/>
                            <Tab label="Created assets" value="created-assets" onClick={() => {
                                navigate('/explorer/account/' + address + '/created-assets');
                            }}/>
                            <Tab label="Created applications" value="created-applications" onClick={() => {
                                navigate('/explorer/account/' + address + '/created-applications');
                            }}/>
                            <Tab label="Opted applications" value="opted-applications" onClick={() => {
                                navigate('/explorer/account/' + address + '/opted-applications');
                            }}/>
                        </Tabs>

                        <Outlet />


                    </div>
                </div>}
            </div>}


        </div>
    </div>);
}

export default Account;
