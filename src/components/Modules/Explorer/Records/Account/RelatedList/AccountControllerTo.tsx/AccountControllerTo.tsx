import './AccountControllerTo.scss';
import React from "react";
import {useDispatch,useSelector} from "react-redux";
import {RootState} from "../../../../../../../redux/store";
import AccountList from "../../../../Lists/AccountsList/AccountsList";
import {loadAuthAddressTo} from "../../../../../../../redux/explorer/actions/account";

function AccountControllerTo(): JSX.Element {
    const account = useSelector((state: RootState) => state.account);
    const { controllingAccounts: { accounts, loading, } } = account;
    const dispatch = useDispatch();

    function reachedLastPage(value) {
        dispatch(loadAuthAddressTo(account.information));
    }

    return (<div className={"account-controller-to-wrapper"}>
        <div className={"account-controller-to-container"}>
            <div className="account-controller-to-body">
                <AccountList accounts={accounts} reachedLastPage={reachedLastPage} loading={loading}></AccountList>
            </div>
        </div>
    </div>);
}

export default AccountControllerTo;
