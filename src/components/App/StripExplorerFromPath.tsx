import React from 'react';
import { useLocation } from 'react-router-dom';
import { useRoundNavigate } from 'src/hooks/useRound';

export default function StripExplorerFromPath(): JSX.Element {
    const navigate = useRoundNavigate();
    const location = useLocation();

    React.useEffect(() => {
        const startsWithExplorerRegex = /\/+explorer\//;
        if (startsWithExplorerRegex.test(location.pathname)) {
            const target = location.pathname.replace(startsWithExplorerRegex, '/');
            // In place of the old URL: a step back to it would only come here again.
            navigate(target, { replace: true });
        }
    }, [location]);

    return <></>;
}
