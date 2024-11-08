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
        <div className="sub-sig">
            {icon}
            {children}
        </div>
    </Tooltip>;
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
                        <div className="threshold-version-container">
                            <div className="HFlex">
                                <span>Version</span><span className="value">{sig.multisig.version}</span>
                            </div>
                            <div className="HFlex">
                                <span>Threshold</span><span className="value">{sig.multisig.threshold}</span>
                            </div>
                        </div>
                        <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                            <div className="property">
                                <div className="key" style={{fontSize: '110%'}}>
                                    Subsignatures
                                </div>
                                <div className="value column">
                                    {txnInstance.getMultiSigSubSignatures().map(([addr, signed]) =>
                                        <SubSigner signed={signed} key={addr}>
                                            <LinkToAccount copySize="m" address={addr}></LinkToAccount>
                                        </SubSigner>
                                    )}
                                </div>
                            </div>
                        </Grid>
                    </div>
                </div>
            </div> : ''}
        </div>
    </div>);
}

export default TransactionMultiSig;
