import React from "react";
import { Link } from "react-router-dom";
import {useLiveData} from "../../../../hooks/useLiveData";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {CoreTransaction} from "../../../../packages/core-sdk/classes/core/CoreTransaction";
import {TXN_TYPES} from "../../../../packages/core-sdk/constants";
import { ellipseString } from "src/packages/core-sdk/utils";

function LiveTransactions(): JSX.Element {
    const {transactions} = useLiveData();

    return (
        <div>
            <div className="text-left">
                <div className="text-xl text-primary">
                    Latest Transactions
                </div>
                <div className="mt-5">
                    <TransitionGroup component="div">
                        {transactions.map((transaction) => {
                            const txnInstance = new CoreTransaction(transaction);

                            const to = txnInstance.getTo();
                            const type = txnInstance.getType();
                            const appId = txnInstance.getAppId();

                            return (
                                <CSSTransition key={txnInstance.getId()} timeout={700} classNames="item">
                                    <Link to={"/transaction/" + txnInstance.getId()} className="block bg-background-card text-muted-foreground p-4 my-3 border-l-[6px] border-primary rounded overflow-hidden hover:bg-background-card/80">
                                        <div className="flex justify-between items-center">
                                            <span>{txnInstance.getTypeDisplayValue()}</span>
                                            <span className="text-primary font-mono text-sm">{ellipseString(txnInstance.getId(), 8)}</span>
                                        </div>
                                        <div className="mt-4 text-[13px] flex justify-between items-center">
                                            <span>From:</span>
                                            <span className="font-mono text-xs">{ellipseString(txnInstance.getFrom(), 8)}</span>
                                        </div>
                                        {type === TXN_TYPES.PAYMENT || type === TXN_TYPES.ASSET_TRANSFER ? (
                                            <div className="mt-4 text-[13px] flex justify-between items-center">
                                                <span>To:</span>
                                                <span className="font-mono text-xs">{ellipseString(to, 8)}</span>
                                            </div>
                                        ) : null}
                                        {type === TXN_TYPES.APP_CALL ? (
                                            <div className="mt-4 text-[13px] flex justify-between items-center">
                                                <span>Application:</span>
                                                <span>{appId}</span>
                                            </div>
                                        ) : null}
                                    </Link>
                                </CSSTransition>
                            );
                        })}
                    </TransitionGroup>
                </div>
            </div>
        </div>
    );
}

export default LiveTransactions;
