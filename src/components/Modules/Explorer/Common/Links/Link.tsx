import React from 'react';
import {Link as RouterLink} from "react-router-dom";
import {Link as MuiLink, LinkProps as MuiLinkProps} from "@mui/material";

interface LinkProps extends MuiLinkProps {
    noStyle?: true,
}

export default function Link({ href, noStyle, children, ...props }: LinkProps) {
    // use routerLink for local links, mui link for the rest
    const component = React.useMemo(
        () => href.startsWith('http') || href.startsWith('mailto') ? { href: href } : { component: RouterLink, to: href },
    [href]);

    const style = React.useMemo(
        () => {
            return {
                ...props?.style,
                ...(noStyle ? { color: "inherit", textDecoration: "none",} : null),
            }
        }
    , [noStyle, props?.style]);

    return <MuiLink {...component} {...props} style={style}>{children}</MuiLink>
}
