import './Home.scss';
import React from "react";
import Search from '../Search/Search';
import {Grid} from "@mui/material";
import LiveBlocks from "../LiveBlocks/LiveBlocks";
import LiveTransactions from "../LiveTransactions/LiveTransactions";
import {theme} from '../../../../theme/index';

const network = process.env.REACT_APP_NETWORK;

const primary = theme.palette.primary.light;

function Home(): JSX.Element {
    return (<div className={"home-wrapper"}>
        <div className={"home-container"}>
            <div className="home-body">
                <div className="tag-line">
                    Algorand <span style={{color: primary}}>{network}</span> Blockchain Observer
                </div>
                <div className="search-section">
                    <Search></Search>
                </div>
                <div className="live-section">
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={12} md={6} lg={4} xl={4}>
                            <LiveBlocks></LiveBlocks>
                        </Grid>
                        <Grid item xs={12} sm={12} md={6} lg={5} xl={5}>
                            <LiveTransactions></LiveTransactions>
                        </Grid>
                    </Grid>
                </div>
            </div>
        </div>
    </div>);
}

export default Home;
