import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function StripExplorerFromPath(): JSX.Element {
    const navigate = useNavigate();
    const location = useLocation();

    React.useEffect(() => {
        const startsWithExplorerRegex = /\/+explorer\//;
        if (startsWithExplorerRegex.test(location.pathname)) {
            const target = location.pathname.replace(startsWithExplorerRegex, '/');
            navigate(target);
        }
    }, [location]);

    return <></>;
}
