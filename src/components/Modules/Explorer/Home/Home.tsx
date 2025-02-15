import './Home.scss';
import React from "react";
import Search from '../Search/Search';
import {Grid} from "@mui/material";
import LiveStats from "../LiveStats/LiveStats";
import LiveBlocks from "../LiveBlocks/LiveBlocks";
import LiveUpgrade from "../LiveUpgrade/LiveUpgrade";
import LiveTransactions from "../LiveTransactions/LiveTransactions";
import {theme} from '../../../../theme/index';
import useTitle from "../../../Common/UseTitle/UseTitle";

const network = process.env.REACT_APP_NETWORK;

const primary = theme.palette.primary.light;

function Home(): JSX.Element {
    useTitle("Home");

    return (<div className={"home-wrapper"}>
        <div className={"home-container"}>
            <LiveUpgrade />
            <div className="home-body">
                <img src="/logo.png" className="bg-logo" />
                <div className="tag-line">
                    <span className="grey">Algo</span> Surf <span style={{color: primary}}>{network}</span> 
                </div>
                <div className="search-section">
                    <Search autoFocus={true}></Search>
                </div>
                <div className="live-section">
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={12} md={4} lg={4} xl={4}>
                            <LiveStats></LiveStats>
                        </Grid>
                        <Grid item xs={12} sm={12} md={4} lg={4} xl={4}>
                            <LiveBlocks></LiveBlocks>
                        </Grid>
                        <Grid item xs={12} sm={12} md={4} lg={4} xl={4}>
                            <LiveTransactions></LiveTransactions>
                        </Grid>
                    </Grid>
                </div>
            </div>
        </div>
    </div>);
}

export default Home;
