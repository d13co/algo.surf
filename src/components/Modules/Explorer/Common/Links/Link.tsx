import React from 'react';
import {Link as RouterLink} from "react-router-dom";
import {Link as MuiLink, LinkProps} from "@mui/material";

export default function Link({ href, children, ...props }: LinkProps) {
    // use routerLink for local links, mui link for the rest
    const component = React.useMemo(
        () => href.startsWith('http') || href.startsWith('mailto') ? { href: href } : { component: RouterLink, to: href },
    [href]);

    return <MuiLink {...component} {...props}>{children}</MuiLink>
}
