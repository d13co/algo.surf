import Link from './Link';
import React from "react";
import './LinkTo.scss';

const emptyFragment = <></>;

function LinkToBlock({id, name = emptyFragment}): JSX.Element {
    if (name === emptyFragment) {
        name = <>{id}</>;
    }

    return <Link href={"/block/" + id}>{name}</Link>;
}

export default LinkToBlock;
