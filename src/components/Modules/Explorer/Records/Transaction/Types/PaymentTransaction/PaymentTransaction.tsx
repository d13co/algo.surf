import './PaymentTransaction.scss';
import React from "react";
import {Grid} from "@mui/material";
import {CoreTransaction} from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import AlgoIcon from "../../../../AlgoIcon/AlgoIcon";
import NumberFormat from "react-number-format";
import LinkToAccount from "../../../../Common/Links/LinkToAccount";
import {microalgosToAlgos,shadedClr} from "../../../../../../../utils/common";
import {useSelector} from "react-redux";
import {RootState} from "../../../../../../../redux/store";
import AccountLabelChip from "../../../../../../Common/AccountLabelChip/AccountLabelChip";

function PaymentTransaction(props): JSX.Element {
    const {transaction} = props;
    const txnInstance = new CoreTransaction(transaction);

    const addressBook = useSelector((state: RootState) => state.addressBook);
    const senderLabel = React.useMemo(() => addressBook.data[transaction.sender], [transaction.sender, addressBook.data]);
    const receiverLabel = React.useMemo(() => transaction["payment-transaction"] ? addressBook.data[transaction["payment-transaction"].receiver] : false, [transaction, addressBook.data]);
    const closeToLabel = React.useMemo(() => transaction["payment-transaction"] ? addressBook.data[transaction["payment-transaction"]["close-remainder-to"]] : false, [transaction, addressBook.data]);

    return (<div className={"payment-transaction-wrapper"}>
        <div className={"payment-transaction-container"}>
            <div className="payment-transaction-header">
                Payment
            </div>
            <div className="payment-transaction-body">

                <div className="props" style={{background: shadedClr}}>
                    <Grid container spacing={2}>

                        <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                            <div className="property">
                                <div className="key">
                                    Sender { senderLabel ? <AccountLabelChip size="small" label={senderLabel} /> : null }
                                </div>
                                <div className="value small">
                                    <LinkToAccount copySize="m" address={txnInstance.getFrom()}></LinkToAccount>
                                </div>
                            </div>
                        </Grid>


                        <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                            <div className="property">
                                <div className="key">
                                    Receiver { receiverLabel ? <AccountLabelChip size="small" label={receiverLabel} />: null }
                                </div>
                                <div className="value small">
                                    <LinkToAccount copySize="m" address={txnInstance.getTo()}></LinkToAccount>
                                </div>
                            </div>
                        </Grid>


                        <Grid item xs={12} sm={6} md={4} lg={4} xl={4}>
                            <div className="property">
                                <div className="key">
                                    Amount
                                </div>
                                <div className="value">
                                    <NumberFormat
                                        value={microalgosToAlgos(txnInstance.getAmount())}
                                        displayType={'text'}
                                        thousandSeparator={true}
                                        style={{marginRight: 5}}
                                    ></NumberFormat>
                                    <AlgoIcon></AlgoIcon>
                                </div>
                            </div>
                        </Grid>


                        {txnInstance.getCloseTo() ? <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                            <div className="property">
                                <div className="key">
                                    Close account { receiverLabel ? <AccountLabelChip size="small" label={receiverLabel} /> : null }
                                </div>
                                <div className="value small">
                                    <LinkToAccount copySize="m" address={txnInstance.getCloseTo()}></LinkToAccount>
                                </div>
                            </div>
                        </Grid> : ''}




                        {txnInstance.getCloseTo() ? <Grid item xs={12} sm={6} md={4} lg={4} xl={4}>
                            <div className="property">
                                <div className="key">
                                    Close amount
                                </div>
                                <div className="value">
                                    <NumberFormat
                                        value={microalgosToAlgos(txnInstance.getCloseAmount())}
                                        displayType={'text'}
                                        thousandSeparator={true}
                                        style={{marginRight: 5}}
                                    ></NumberFormat>
                                    <AlgoIcon></AlgoIcon>
                                </div>
                            </div>
                        </Grid> : ''}



                    </Grid>
                </div>

            </div>
        </div>
    </div>);
}

export default PaymentTransaction;
