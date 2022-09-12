import './Dispenser.scss';
import React, {useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "../../../redux/store";
import LoadingTile from "../../Common/LoadingTile/LoadingTile";
import {Alert, Button, FormLabel, Grid, TextField} from "@mui/material";
import {CoreNode} from "../../../packages/core-sdk/classes/core/CoreNode";
import {KmdClient, kmdParams} from "../../../packages/core-sdk/clients/kmdClient";
import {showSnack} from "../../../redux/common/actions/snackbar";
import algosdk, {isValidAddress, SuggestedParams, waitForConfirmation} from "algosdk";
import {hideLoader, showLoader} from "../../../redux/common/actions/loader";
import dappflow from "../../../utils/dappflow";
import LinkToTransaction from "../Explorer/Common/Links/LinkToTransaction";


interface DispenserState{
    address: string,
    success: boolean
    error: boolean,
    txId: string,
    errMsg: string
}

const initialState: DispenserState = {
    address: "",
    success: false,
    error: false,
    txId: "",
    errMsg: ""
};

function Dispenser(): JSX.Element {

    const node = useSelector((state: RootState) => state.node);
    const {loadingVersions, versionsCheck} = node;
    const isSandbox = new CoreNode().isSandbox(versionsCheck);
    const dispenerLinks = new CoreNode().getDispenserLinks(versionsCheck);
    const dispatch = useDispatch();

    const [
        {address, success, error, txId, errMsg},
        setState
    ] = useState(initialState);

    function resetAttempt() {
        setState(prevState => ({...prevState, success: false, error: false, txId: "", errMsg: ""}));
    }

    function setSuccess(txId: string) {
        setState(prevState => ({...prevState, success: true, error: false, txId, errMsg: "", address: ""}));
    }

    function setError(message: string) {
        setState(prevState => ({...prevState, success: false, error: true, txId: "", errMsg: message}));
    }

    async function dispense() {
        const params: kmdParams = {
            port: "4002",
            token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            url: "http://localhost"
        };

        if (!address) {
            dispatch(showSnack({
                severity: 'error',
                message: 'Invalid address'
            }));
            return;
        }
        if (!isValidAddress(address)) {
            dispatch(showSnack({
                severity: 'error',
                message: 'Invalid address'
            }));
            return;
        }

        try {
            resetAttempt();
            dispatch(showLoader("Checking KMD configuration"));
            const dispenserAccount = await new KmdClient(params).getDispenserAccount();
            dispatch(hideLoader());

            dispatch(showLoader("Loading suggested params"));
            const client = dappflow.network.getClient();
            const suggestedParams: SuggestedParams = await client.getTransactionParams().do();
            dispatch(hideLoader());

            const amount = algosdk.algosToMicroalgos(100);

            const enc = new TextEncoder();
            const note = enc.encode("Dispencing algos from dappflow dispenser");

            const unsignedTxn = algosdk.makePaymentTxnWithSuggestedParams(dispenserAccount.addr, address, amount, undefined, note, suggestedParams, undefined);
            const signedTxn = unsignedTxn.signTxn(dispenserAccount.sk);

            dispatch(showLoader("Submitting transaction"));
            const {txId} = await client.sendRawTransaction(signedTxn).do();
            dispatch(hideLoader());

            dispatch(showLoader("Waiting for confirmation"));
            await waitForConfirmation(client, txId, 10);
            dispatch(hideLoader());

            setSuccess(txId);

        }
        catch (e: any) {
            dispatch(hideLoader());
            setError(e.message);
        }

    }

    return (<div className={"dispenser-wrapper"}>
        <div className={"dispenser-container"}>

            <div className={"dispenser-header"}>
                Dispenser
            </div>
            <div className={"dispenser-body"}>
                {loadingVersions ? <div>
                    <Grid container spacing={0}>
                        <Grid item xs={12} sm={6} md={4} lg={4} xl={4}>
                            <LoadingTile></LoadingTile>
                        </Grid>
                    </Grid>
                </div> : <div>
                    {isSandbox ? <div className="sandbox-dispenser">
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={12} md={6} lg={4} xl={4}>
                                <FormLabel sx={{color: 'common.black'}}>Target address</FormLabel>
                                <div>
                                    <TextField
                                        multiline={true}
                                        placeholder="Enter your address"
                                        type={"text"}
                                        required
                                        value={address}
                                        onChange={(ev) => {
                                            setState(prevState => ({...prevState, address: ev.target.value + ""}));
                                        }}
                                        fullWidth
                                        sx={{borderRadius: '10px', marginTop: '10px', fieldset: {borderRadius: '10px'}}}
                                        rows={4}
                                        variant="outlined"
                                    />
                                </div>
                                <div style={{marginTop: '15px', textAlign: "right"}}>
                                    <Button color={"primary"} variant={"contained"} onClick={() => {
                                        dispense();
                                    }
                                    }>Dispense</Button>
                                </div>

                                <div style={{marginTop: '30px', wordBreak: "break-all"}}>
                                    {success ? <div>
                                        <Alert icon={false} color={"success"}>
                                            <div>
                                                Transaction successful :
                                            </div>
                                            <LinkToTransaction id={txId} sx={{color: 'common.black', marginTop: 15}}></LinkToTransaction>
                                        </Alert>

                                    </div> : ''}

                                    {error ? <div>
                                        <Alert icon={false} color={"error"}>
                                            {errMsg}
                                        </Alert>

                                    </div> : ''}
                                </div>
                            </Grid>
                        </Grid>
                    </div> : <div>
                        <Grid container spacing={0}>
                            <Grid item xs={12} sm={6} md={4} lg={4} xl={4}>
                                <Alert icon={false} color={"warning"}>
                                    Dispenser is available only for sandbox environment.
                                    <br/>
                                    {dispenerLinks.length > 0 ? 'Please try below dispensers by community.' : ''}

                                </Alert>
                                {dispenerLinks.map((link, index) => {
                                    return <Button color={"warning"} variant={"outlined"} sx={{marginTop: '15px', marginLeft: '10px'}} onClick={() => {
                                        window.open(link, "_blank")
                                    }
                                    }>
                                        Dispenser {index + 1}
                                    </Button>
                                })}
                            </Grid>
                        </Grid>

                    </div>}
                </div>}
            </div>



        </div>
    </div>);
}

export default Dispenser;
