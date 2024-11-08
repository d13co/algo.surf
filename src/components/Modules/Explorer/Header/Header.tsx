import './Header.scss';
import React from "react";
import {theme} from '../../../../theme/index';
import {useNavigate, useLocation} from "react-router-dom";
import {Grid, Slide, Typography, Tab, Tabs} from "@mui/material";
import Search from "../Search/Search";
import Logo from "./Logo";

const networkLabel = process.env.REACT_APP_NETWORK;
const primary = theme.palette.primary.main;

const routes = ["home", "accounts", "transactions", "assets", "applications"];

function Header(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();

    const route: string | boolean = React.useMemo(() => {
        const route = location.pathname.substring(1).split('/')[1];
        if (routes.indexOf(route) === -1) {
            return false;
        }
        return route
    }, [location.pathname]);

    return (<div className={"header-wrapper"}>
        <div className={"header-container"}>
            <div>
                <Grid container>
                    <Tabs variant="scrollable" scrollButtons="auto" sx={{marginLeft: '-20px'}} value={route} TabIndicatorProps={{ children: <span className="MuiTabs-indicatorSpan" />}}>
                        <Tab label={<Logo />} value="home" onClick={() => {
                            navigate('/home');
                        }}/>
                        <Tab label="Accounts" value="accounts" onClick={() => {
                            navigate('/accounts');
                        }}/>
                        <Tab label="Txns" value="transactions" onClick={() => {
                            navigate('/transactions');
                        }}/>
                        <Tab label="Assets" value="assets" onClick={() => {
                            navigate('/assets');
                        }}/>
                        <Tab label="Apps" value="applications" onClick={() => {
                            navigate('/applications');
                        }}/>
                    </Tabs>
                </Grid>
            </div>
            { route !== "home" ? 
            <Slide direction="down" in={route !== "home"} mountOnEnter unmountOnExit>
                <div>
                    <Search placeholder={`Search ${networkLabel} [Ctrl+K]`}/>
                </div>
            </Slide> : null }
        </div>
    </div>);
}

export default Header;
