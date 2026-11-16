import React from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRound, useRoundNavigate } from 'src/hooks/useRound';
import { useNfdSearchReader } from 'src/components/Common/UseNFD';
import { useGlobalUI } from 'src/contexts/GlobalUIContext';
import search, { AmbiguousError, NotFoundError, ServerError, NotSearchableError, searchResultsHref } from "../Modules/Explorer/Search/CoreSearch";
import Loader from "src/components/v2/LoadingTile";
import { SearchX, CircleAlert, HeartCrack } from 'lucide-react';
import { useAbelAssetsContext } from '../Common/AbelAssetsProvider';

function Frame({ children }): JSX.Element {
    return <div style={{display: 'flex', width: '100%', height: '70svh', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '25px'}}>
        {children}
    </div>
}

function Error({ icon, children }): JSX.Element {
    return <>
        {icon({ style: { opacity: 0.35 }, size: 256, color: '#12afac'})}
        {children}
    </>
}

export default function SearchFromPath(): JSX.Element {
    const { pathname } = useLocation();
    const navigate = useRoundNavigate();
    const { loading: abelLoading, loadedPromise } = useAbelAssetsContext();
    const nfd = useNfdSearchReader();
    const queryClient = useQueryClient();
    const { round } = useRound();
    const { showSnack } = useGlobalUI();
    const onNotice = (message: string) => showSnack({ severity: "warning", message });

    const [loading, setLoading] = React.useState(false);
    const [loadingMessage, setLoadingMessage] = React.useState<string|undefined>();
    const [error, setError] = React.useState<string>();
    const [icon, setIcon] = React.useState<(props: any) => JSX.Element>();

    React.useEffect(() => {
        const [_, target] = pathname.split('/');
        // Leaving the page while it searches: it must not take the user back
        let left = false;
        const options = { nfd, round, onNotice, queryClient };
        (async() => {
            try {
                setLoading(true);
                setError('');
                let destination: string;
                try {
                    destination = await search(target, options);
                } catch(e) {
                    if (left) return;
                    if (abelLoading && loadedPromise) {
                        console.error("First search failed with:", e)
                        setLoadingMessage("Loading verified asset database...");
                        await loadedPromise;
                        if (left) return;
                        destination = await search(target, options);
                    } else {
                        throw e
                    }
                }
                if (left) return;
                setError('');
                setLoading(false);
                navigate(destination);
            } catch (e) {
                if (left) return;
                // Several hits: the results page lists them. A miss for a lone
                // search term: the results page looks further. A miss on a
                // deeper path is a mistyped page, and an NFD miss explains itself.
                const lone = pathname.split('/').filter(Boolean).length === 1;
                const miss = e instanceof NotFoundError || e instanceof NotSearchableError;
                if (e instanceof AmbiguousError || (lone && miss && !target.endsWith('.algo'))) {
                    let term = target;
                    try { term = decodeURIComponent(target); } catch { /* keep it as typed */ }
                    navigate(searchResultsHref(term), { replace: true });
                    return;
                }
                setLoading(false);
                let suffix = "";
                let msg = (e as Error).message;
                if (e instanceof NotFoundError) {
                    setIcon(() => { return props => <SearchX {...props} /> });
                    suffix = ` for ${target}`;
                } else if (e instanceof ServerError) {
                    setIcon(() => { return props => <CircleAlert {...props} /> });
                } else if (e instanceof NotSearchableError) {
                    setIcon(() => { return props => <HeartCrack {...props} /> });
                    msg = `Page not found: ${pathname}`;
                } else {
                    setIcon(() => { return props => <CircleAlert {...props} /> });
                }
                setError(msg+suffix);
            }
        })()
        return () => { left = true; };
    }, [pathname]);

    return <Frame>
        {loading ? <>
            <div style={{alignSelf: 'stretch'}}><Loader /></div>
            <div style={{fontSize: 14, opacity: 0.7}}>
                {loadingMessage}
            </div>
        </> : 
        (error ?  <Error icon={icon}>{error}</Error> : null) }
    </Frame>;
}
