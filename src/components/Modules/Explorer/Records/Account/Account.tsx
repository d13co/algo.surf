import './Account.scss';
import React, {useMemo, useRef, useCallback, useEffect} from "react";
import {matchPath, Outlet, useLocation, useNavigate, useParams} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {loadAccount} from "../../../../../redux/explorer/actions/account";
import {RootState} from "../../../../../redux/store";
import {Chip, Link, Grid, Tab, Tabs} from "@mui/material";
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
import useTitle from "../../../../Common/UseTitle/UseTitle";

const network = process.env.REACT_APP_NETWORK;

function plural(num: number): string {
    return num !== 1 ? "s" : "";
}

function Account(): JSX.Element {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const params = useParams();
    const {address} = params;

    const account = useSelector((state: RootState) => state.account);

    let tabValue = 'transactions';
    const { pathname } = useLocation();

    const hasOptedAssets = account.optedAssets.length
    const hasCreatedAssets = account.createdAssets.length;
    const hasOptedApps = account.optedApplications.length;
    const hasCreatedApps = account.createdApplications.length;
    const numControlledAccounts = account.controllingAccounts.accounts.length;
    const hasAssetOrAppInfo = hasOptedAssets || hasCreatedAssets || hasOptedApps || hasCreatedApps;

    const tabsRef = useRef<HTMLDivElement>();

    const scrollToControllerTo = useCallback((e) => {
        navigate(`/explorer/account/${address}/controller`);
        if (tabsRef?.current)
            tabsRef.current.scrollIntoView();
        e.preventDefault();
        return false;
    }, [tabsRef, address]);

    if (hasOptedAssets && matchPath("/explorer/account/:address/assets", pathname)) {
        tabValue = 'assets';
    } else if (hasCreatedAssets && matchPath("/explorer/account/:address/created-assets", pathname)) {
        tabValue = 'created-assets';
    } else if (hasCreatedApps && matchPath("/explorer/account/:address/created-applications", pathname)) {
        tabValue = 'created-applications';
    } else if (hasOptedApps && matchPath("/explorer/account/:address/opted-applications", pathname)) {
        tabValue = 'opted-applications';
    } else if (numControlledAccounts && matchPath("/explorer/account/:address/controller", pathname)) {
        tabValue = 'controlling-accounts';
    }

    useEffect(() => {
        dispatch(loadAccount(address));
    }, [dispatch, address]);

    useTitle(`Account ${address}`);

    return (<div className={"account-wrapper"}>
        <div className={"account-container"}>

            {account.error ? <CustomError></CustomError> : <div>
                <div className="account-header">
                    <div>
                        Account overview
                    </div>
                    <div>
                        <JsonViewer obj={account.information} filename={`account-${address}.json`} title={`Account ${address.slice(0, 16)}..`}></JsonViewer>
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
                            <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
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
                                <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
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
                            { numControlledAccounts|| account.information['auth-addr'] ? <>
                                <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
                                { numControlledAccounts?
                                    <div className="property">
                                        <div className="key">
                                            Controller of
                                        </div>
                                        <div className="value">
                                            <Link href="#" onClick={scrollToControllerTo}>
                                                {numControlledAccounts}
                                                {' '}
                                                account{plural(numControlledAccounts)}
                                            </Link>
                                        </div>
                                    </div> : null }
                                    { account.information['auth-addr'] ? <>
                                        <div className="property">
                                            <div className="key">
                                                Rekeyed to
                                            </div>
                                            <div className="value">
                                                <LinkToAccount copySize="m" strip={9} address={account.information['auth-addr']} />
                                            </div>
                                        </div>
                                    </> : null }
                                </Grid>
                            </> : null }
                        </Grid>

                        { account.information.amount ?
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
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
                        </Grid> : null }

                        { hasAssetOrAppInfo ? 
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6} md={6} lg={4} xl={4}>
                                    { hasOptedApps ? 
                                    <div className="property">
                                        <div className="key">
                                            Holding assets
                                        </div>
                                        <div className="value padded">
                                            {account.optedAssets.length}
                                        </div>
                                    </div> : null }

                                    { hasCreatedAssets ? 
                                    <div className="property">
                                        <div className="key">
                                            Created assets
                                        </div>
                                        <div className="value padded">
                                            {account.createdAssets.length}
                                        </div>
                                    </div> : null }

                                    { hasCreatedApps ? 
                                    <div className="property">
                                        <div className="key">
                                            Created applications
                                        </div>
                                        <div className="value padded">
                                            {account.createdApplications.length}
                                        </div>
                                    </div> : null }

                                    { hasOptedApps ? 
                                    <div className="property">
                                        <div className="key">
                                            Opted applications
                                        </div>
                                        <div className="value padded">
                                            {account.optedApplications.length}
                                        </div>
                                    </div> : null }
                                </Grid>
                            </Grid> : null }
                    </div>

                    <div className="account-tabs" ref={tabsRef}>
                        <Tabs TabIndicatorProps={{ children: <span className="MuiTabs-indicatorSpan" />}} value={tabValue} className="related-list">
                            <Tab label="Transactions" value="transactions" onClick={() => {
                                navigate('/explorer/account/' + address + '/transactions');
                            }}/>
                            { account.optedAssets.length ?
                            <Tab label="Assets" value="assets" onClick={() => {
                                navigate('/explorer/account/' + address + '/assets');
                            }}/> : null }
                            { account.createdAssets.length ?
                            <Tab label="Created assets" value="created-assets" onClick={() => {
                                navigate('/explorer/account/' + address + '/created-assets');
                            }}/> : null }
                            { account.createdApplications.length ?
                            <Tab label="Created applications" value="created-applications" onClick={() => {
                                navigate('/explorer/account/' + address + '/created-applications');
                            }}/> : null }
                            { account.optedApplications.length ?
                            <Tab label="Opted applications" value="opted-applications" onClick={() => {
                                navigate('/explorer/account/' + address + '/opted-applications');
                            }}/> : null }
                            { account.controllingAccounts.accounts.length ?
                            <Tab label="Controlling accounts" value="controlling-accounts" onClick={() => {
                                navigate('/explorer/account/' + address + '/controller');
                            }}/> : null }
                        </Tabs>

                        <Outlet />

                    </div>
                </div>}
            </div>}


        </div>
    </div>);
}

export default Account;
