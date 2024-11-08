import Link from './Link';
import React from "react";
import {ellipseString} from "../../../../../packages/core-sdk/utils";
import './LinkTo.scss';

function LinkToTransaction({id, strip = 0, sx = {}}): JSX.Element {
    return <Link className="long-id" href={"/transaction/" + id} sx={sx}>{strip ? ellipseString(id, strip) : id}</Link>;
}

export default LinkToTransaction;
