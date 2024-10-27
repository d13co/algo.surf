import {Link} from "@mui/material";
import React from "react";
import './LinkTo.scss';

function LinkToBlock({id, name = ''}): JSX.Element {
    if (!name) {
        name = id;
    }

    return <Link className="long-id" href={"/explorer/block/" + id}>{name}</Link>;
}

export default LinkToBlock;
