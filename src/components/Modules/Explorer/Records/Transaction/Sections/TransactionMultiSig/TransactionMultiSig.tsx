import './TransactionMultiSig.scss';
import React from "react";
import {Tooltip,Grid} from "@mui/material";
import {CoreTransaction} from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import {shadedClr} from "../../../../../../../utils/common";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import { PencilOff, Pencil } from "lucide-react";
import {theme} from '../../../../../../../theme/index';

const signerTooltip = [
    "This account did not sign for this transaction",
    "This account signed for this transaction"
];

function SubSigner({ signed, children, }: { signed: boolean, children: React.ReactNode }) {
    const title = signerTooltip[signed ? 1 : 0];
    const icon = signed ? <Pencil size={18} className="icon" /> : <PencilOff size={14} className="icon off" />
    return <Tooltip title={title} placement="top">
        <span>
            {icon}
            {children}
        </span>
    </Tooltip>
}

function TransactionMultiSig(props): JSX.Element {
    const {transaction} = props;
    const txnInstance = new CoreTransaction(transaction);
    const sig = txnInstance.getSig();

    return (<div className={"transaction-multi-sig-wrapper"}>
        <div className={"transaction-multi-sig-container"}>

            {txnInstance.isMultiSig() ? <div>
                <div className="transaction-multi-sig-header">
                    MultiSig
                </div>
                <div className="transaction-multi-sig-body">
                    <div className="props" style={{background: shadedClr}}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                                <div className="property">
                                    <div className="key">
                                        Version
                                    </div>
                                    <div className="value">
                                        {sig.multisig.version}
                                    </div>
                                </div>
                            </Grid>
                            <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                                <div className="property">
                                    <div className="key">
                                        Threshold
                                    </div>
                                    <div className="value">
                                        {sig.multisig.threshold}
                                    </div>
                                </div>
                            </Grid>
                            <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                                <div className="property">
                                    <div className="key">
                                        Subsignatures
                                    </div>
                                    <div className="value column">
                                        {txnInstance.getMultiSigSubSignatures().map(([addr, signed]) => {
                                            return <div className="sub-sig" key={addr}>
                                                <SubSigner signed={signed}>
                                                    <LinkToAccount copySize="m" address={addr}></LinkToAccount>
                                                </SubSigner>
                                            </div>;
                                        })}
                                    </div>
                                </div>
                            </Grid>
                        </Grid>
                    </div>
                </div>
            </div> : ''}
        </div>
    </div>);
}

export default TransactionMultiSig;
