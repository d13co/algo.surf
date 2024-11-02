import './Home.scss';
import React from "react";
import Search from '../Search/Search';
import {Grid} from "@mui/material";
import LiveBlocks from "../LiveBlocks/LiveBlocks";
import LiveTransactions from "../LiveTransactions/LiveTransactions";
import {theme} from '../../../../theme/index';
import useTitle from "../../../Common/UseTitle/UseTitle";

const network = process.env.REACT_APP_NETWORK;

const primary = theme.palette.primary.light;

function Home(): JSX.Element {
    useTitle("Home");

    return (<div className={"home-wrapper"}>
        <div className={"home-container"}>
            <div className="home-body">
                <div className="tag-line">
                    Algorand <span style={{color: primary}}>{network}</span> <span className="grey">Observer</span>
                </div>
                <div className="search-section">
                    <Search autoFocus={true}></Search>
                </div>
                <div className="live-section">
                    <Grid container spacing={2} style={{maxWidth:"840px"}}>
                        <Grid item xs={12} sm={12} md={6} lg={6} xl={6}>
                            <LiveBlocks></LiveBlocks>
                        </Grid>
                        <Grid item xs={12} sm={12} md={6} lg={6} xl={6}>
                            <LiveTransactions></LiveTransactions>
                        </Grid>
                    </Grid>
                </div>
            </div>
        </div>
    </div>);
}

export default Home;
