import {Link} from "@mui/material";
import React from "react";

function LinkToApplication({id, children = undefined, name = ''}): JSX.Element {
    if (!name) {
        name = id;
    }
    return <Link href={"/explorer/application/" + id}>{children ?? name}</Link>;
}

export default LinkToApplication;
