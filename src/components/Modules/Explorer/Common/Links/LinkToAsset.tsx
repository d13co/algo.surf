import {Link} from "@mui/material";
import React from "react";
import './LinkTo.scss';

function LinkToAsset({id, name = ''}): JSX.Element {
    if (!name) {
        name = id;
    }

    return <Link className="long-id" href={"/explorer/asset/" + id}>{name}</Link>;
}

export default LinkToAsset;
