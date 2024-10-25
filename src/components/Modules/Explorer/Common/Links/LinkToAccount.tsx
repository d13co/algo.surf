import {Link} from "@mui/material";
import React from "react";
import {ellipseString} from "../../../../../packages/core-sdk/utils";
import Copyable from "../../../../Common/Copyable/Copyable";

function LinkToAccount({address, copy='right', strip = 0}): JSX.Element {
    return <>
        { copy === 'left' ? <Copyable value={address} /> : null }
        <Link href={"/explorer/account/" + address}>{strip ? ellipseString(address, strip) : address}</Link>
        { copy === 'right' ? <Copyable value={address} /> : null }
    </>
}

export default LinkToAccount;
