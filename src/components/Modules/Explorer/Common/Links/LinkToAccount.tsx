import Link from './Link';
import React from "react";
import {ellipseString} from "../../../../../packages/core-sdk/utils";
import Copyable from "../../../../Common/Copyable/Copyable";
import './LinkTo.scss';

function LinkToAccount({address, subPage="transactions", copy='right', copySize, strip = 0}): JSX.Element {
    return <>
        { copy === 'left' ? <Copyable size={copySize} value={address} /> : null }
        <Link className="long-id" href={`/account/${address}/${subPage}`}>{strip ? ellipseString(address, strip) : address}</Link>
        { copy === 'right' ? <Copyable size={copySize} value={address} /> : null }
    </>
}

export default LinkToAccount;
