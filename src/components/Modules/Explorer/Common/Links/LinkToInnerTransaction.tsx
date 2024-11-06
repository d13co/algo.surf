import Link from './Link';
import React from "react";
import './LinkTo.scss';

function LinkToInnerTransaction({id, index, name}): JSX.Element {
    return <Link className="long-id" href={"/explorer/transaction/" + id + "/inner-txn/" + index}>{name}</Link>;
}

export default LinkToInnerTransaction;
