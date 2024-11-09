import Link from './Link';
import React from "react";
import {ellipseString} from "../../../../../packages/core-sdk/utils";
import './LinkTo.scss';

function LinkToTransaction({id, label = '', strip = 0, sx = {}}): JSX.Element {
    const _label = label !== '' ? label : strip ? ellipseString(id, strip) : id;
    return <Link className="long-id" href={"/transaction/" + id} sx={sx}>{_label}</Link>;
}

export default LinkToTransaction;
