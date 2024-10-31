import './Header.scss';
import React from "react";
import { theme } from '../../../../theme/index';
import {useNavigate, useLocation} from "react-router-dom";
import {Grid, Typography, Tab, Tabs} from "@mui/material";
import Search from "../Search/Search";

const networkLabel = process.env.REACT_APP_NETWORK;
const primary = theme.palette.primary.main;

function Header(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();

    let route: string | boolean = location.pathname;
    route = route.substring(1);
    route = route.split('/')[1];

    const routes = ["home", "accounts", "transactions", "assets", "applications"];
    if (routes.indexOf(route) === -1) {
        route = false;
    }

    return (<div className={"header-wrapper"}>
        <div className={"header-container"}>
            <div>
                <Grid container>
                    <Tabs variant="scrollable" scrollButtons="auto" sx={{marginLeft: '-20px'}} value={route} TabIndicatorProps={{ children: <span className="MuiTabs-indicatorSpan" />}}>
                        <Tab label={<span style={{whiteSpace: 'nowrap'}}>Ⱥ Observer <span style={{color: primary}}>{networkLabel}</span></span> } value="home" onClick={() => {
                            navigate('/explorer/home');
                        }}/>
                        <Tab label="Accounts" value="accounts" onClick={() => {
                            navigate('/explorer/accounts');
                        }}/>
                        <Tab label="Txns" value="transactions" onClick={() => {
                            navigate('/explorer/transactions');
                        }}/>
                        <Tab label="Assets" value="assets" onClick={() => {
                            navigate('/explorer/assets');
                        }}/>
                        <Tab label="Apps" value="applications" onClick={() => {
                            navigate('/explorer/applications');
                        }}/>
                    </Tabs>
                </Grid>
            </div>

            <div>
                <Search placeholder={`Search Algorand ${networkLabel}`}/>
            </div>
        </div>
    </div>);
}

export default Header;
