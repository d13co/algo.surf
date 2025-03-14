import Link from './Link';
import React from "react";
import {ellipseString} from "../../../../../packages/core-sdk/utils";
import './LinkTo.scss';

interface LinkToTransactionProps {
    id: string
    fragment?: string
    label?: string | JSX.Element;
    strip?: number;
    sx?: any
}

function LinkToTransaction({id, fragment, label = '', strip = 0, sx = {}}: LinkToTransactionProps): JSX.Element {
    const _label = label !== '' ? label : strip ? ellipseString(id, strip) : id;
    return <Link className="long-id" href={"/transaction/" + id + (fragment ? `#${fragment}` : '')} sx={sx}>{_label}</Link>;
}

export default LinkToTransaction;
