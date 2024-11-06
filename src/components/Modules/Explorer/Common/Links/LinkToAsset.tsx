import React from 'react';
import Link from './Link';
import './LinkTo.scss';

function LinkToAsset({id, name = ''}): JSX.Element {
    if (!name) {
        name = id;
    }

    return <Link className="long-id" href={"/explorer/asset/" + id}>{name}</Link>;
}

export default LinkToAsset;
