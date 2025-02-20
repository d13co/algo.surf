import Link from './Link';
import React from "react";
import './LinkTo.scss';

function LinkToBlock({id, name = <></>}): JSX.Element {
    if (!name) {
        name = id;
    }

    return <Link href={"/block/" + id}>{name}</Link>;
}

export default LinkToBlock;
