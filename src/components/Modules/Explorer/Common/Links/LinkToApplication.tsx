import Link from './Link';
import React from "react";
import './LinkTo.scss';

function LinkToApplication({id, className = "", children = undefined, name = ''}): JSX.Element {
    if (!name) {
        name = id;
    }
    return <Link className={`long-id ${className}`} href={"/application/" + id}>{children ?? name}</Link>;
}

export default LinkToApplication;
