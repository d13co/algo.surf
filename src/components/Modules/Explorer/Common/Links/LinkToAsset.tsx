import React from 'react';
import Link from './Link';
import './LinkTo.scss';

function LinkToAsset({id, name = '', style = undefined}): JSX.Element {
    if (!name) {
        name = id;
    }

    return <Link className="long-id" href={"/asset/" + id} style={style}>{name}</Link>;
}

export default LinkToAsset;
