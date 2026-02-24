import React from "react";
import {useLiveData} from "../../../../hooks/useLiveData";
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import {CoreTransaction} from "../../../../packages/core-sdk/classes/core/CoreTransaction";
import LinkToTransaction from "../v2/Links/LinkToTransaction";
import LinkToAccount from "../v2/Links/LinkToAccount";
import {TXN_TYPES} from "../../../../packages/core-sdk/constants";
import LinkToApplication from "../v2/Links/LinkToApplication";

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
                                    <div className="bg-background-card text-muted-foreground p-4 my-3 flex justify-between border-l-[6px] border-primary rounded overflow-hidden">
                                        <div className="w-full">
                                            <div className="flex justify-between items-center">
                                                <span>{txnInstance.getTypeDisplayValue()}</span>
                                                <LinkToTransaction strip={8} id={txnInstance.getId()} />
                                            </div>
                                            <div className="mt-4 text-[13px] flex justify-between items-center">
                                                <span>From:</span>
                                                <LinkToAccount copySize="m" copy="none" strip={8} nfdOnly address={txnInstance.getFrom()} />
                                            </div>
                                            {type === TXN_TYPES.PAYMENT || type === TXN_TYPES.ASSET_TRANSFER ? (
                                                <div className="mt-4 text-[13px] flex justify-between items-center">
                                                    <span>To:</span>
                                                    <LinkToAccount copySize="m" copy="none" strip={8} nfdOnly address={to} />
                                                </div>
                                            ) : null}
                                            {type === TXN_TYPES.APP_CALL ? (
                                                <div className="mt-4 text-[13px] flex justify-between items-center">
                                                    <span>Application:</span>
                                                    <LinkToApplication id={appId} />
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
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
