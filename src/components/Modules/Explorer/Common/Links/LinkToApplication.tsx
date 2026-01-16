import Link from './Link';
import React from "react";
import Copyable from "../../../../Common/Copyable/Copyable";

import './LinkTo.scss';

function LinkToApplication({id, className = "", children = undefined, copy = "", copySize = "m", name = ''}): JSX.Element {
    if (!name) {
        name = id;
    }
    return <>
        {copy === "left" ? <Copyable size={copySize as any} value={id} /> : null}
        <Link className={`long-id ${className}`} href={"/application/" + id}>{children ?? name}</Link>
        {copy === "right" ? <Copyable size={copySize as any} value={id} /> : null}

    </>
}

export default LinkToApplication;
