import './CustomError.scss';
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {Button, Grid, Typography} from "@mui/material";
import {Alert} from "@mui/lab";
import {showSettings} from "../../../../../redux/settings/actions/settings";
import {useDispatch} from "react-redux";
import {useNavigate} from "react-router-dom";
import {supportSettings} from "../../../../../utils/nodeConfig";
import {shadedClr} from "../../../../../utils/common";

const network = process.env.REACT_APP_NETWORK;
const isLocalnet =  process.env.REACT_APP_NETWORK === "Localnet";

const TOTAL_RETRIES = 5;

function getRetries(hash: string): number {
    const regex = /retry=(\d)/g
    const match = regex.exec(hash);
    if (match) {
        return parseInt(match[1], 10);
    }
    return 0;
}

function CustomError({ error }: { error?: string }): JSX.Element {
    const location = useLocation();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [retry, setRetry] = useState(0);
    const [countdown, setCountdown] = useState(2);
    const [tmot, setTmot] = useState<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        let tmot;
        if (isLocalnet) {
            const retry = getRetries(location.hash);
            setRetry(retry);
            if (retry < TOTAL_RETRIES) {
                const newLocation = new URL(window.location.href);
                newLocation.hash = `#retry=${retry+1}`;
                setTimeout(() => setCountdown(1), 1_000);
                clearTimeout(tmot);
                tmot = setTimeout(() => {
                    setCountdown(0);
                    window.history.replaceState(null, null, newLocation.toString());
                    window.location.reload();
                }, 2_000);
                setTmot(tmot)
            }
        }
        return () => clearTimeout(tmot ?? 0)
    }, [location.hash]);

    return (<div className={"custom-error-wrapper"}>
        <div className={"custom-error-container"}>


            <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={7} lg={6} xl={6}>
                    <div className="info">
                        <Typography variant={"h4"}>Something went wrong</Typography>
                        <Alert icon={false} sx={{backgroundColor: shadedClr, color: "white"}} style={{marginTop: 20, borderRadius: 10}}>
                            The resource you are looking for is not available.
                        </Alert>
                        { isLocalnet ? <>
                        <Alert icon={false} sx={{backgroundColor: shadedClr, color: "white"}} style={{marginTop: 20, borderRadius: 10}}>
                            Localnet retry {retry} / {TOTAL_RETRIES} &middot;{' '}
                            { retry < TOTAL_RETRIES ? <>Retrying in {countdown} seconds</> : <>Retries exhausted</> }
                        </Alert>
                        </> : null }
                    </div>

                    <div className="actions">
                        <Button color={"primary"} size={"medium"} variant={"outlined"} onClick={() => {
                            navigate('/explorer');
                        }}>Home</Button>
                    </div>

                </Grid>
            </Grid>


        </div>
    </div>);
}

export default CustomError;
