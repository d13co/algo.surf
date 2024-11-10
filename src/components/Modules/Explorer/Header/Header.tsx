import './Header.scss';
import React from "react";
import {theme} from '../../../../theme/index';
import {useNavigate, useLocation} from "react-router-dom";
import {Grid, Slide, Typography, Tab, Tabs} from "@mui/material";
import Search from "../Search/Search";
import Logo from "./Logo";
import Link from "../Common/Links/Link";

const networkLabel = process.env.REACT_APP_NETWORK;
const primary = theme.palette.primary.main;

const routes = ["home", "accounts", "transactions", "assets", "applications"];

function Header(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();

    const route: string | boolean = React.useMemo(() => {
        const route = location.pathname.substring(1).split('/')[0];
        if (routes.indexOf(route) === -1) {
            if (route === "") {
                return "home";
            }
            return false;
        }
        return route
    }, [location.pathname]);

    return (<div className={"header-wrapper"}>
        <div className={"header-container"}>
            <div>
                <Grid container>
                    <Tabs variant="scrollable" scrollButtons="auto" sx={{marginLeft: '-20px'}} value={route} TabIndicatorProps={{ children: <span className="MuiTabs-indicatorSpan" />}}>
                        <Tab component={Link} href="/" label={<Logo />} value="home" />
                        <Tab component={Link} href="/accounts" label="Accounts" value="accounts" />
                        <Tab component={Link} href="/transactions" label="Txns" value="transactions" />
                        <Tab component={Link} href="/assets" label="Assets" value="assets" />
                        <Tab component={Link} href="/applications" label="Apps" value="applications" />
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
