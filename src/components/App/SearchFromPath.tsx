import React from 'react';
import { useLocation, useNavigate, } from 'react-router-dom';
import search, { NotFoundError, ServerError, NotSearchableError } from "../Modules/Explorer/Search/CoreSearch";
import Loader from "../Common/LoadingTile/LoadingTile";
import { SearchX, CircleAlert, HeartCrack } from 'lucide-react';
import { theme } from "../../theme/index";
import { useAbelAssetsContext } from '../Common/AbelAssetsProvider';

function Frame({ children }): JSX.Element {
    return <div style={{display: 'flex', width: '100%', height: '70svh', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '25px'}}>
        {children}
    </div>
}

function Error({ icon, children }): JSX.Element {
    return <>
        {icon({ style: { opacity: 0.35 }, size: 256, color: theme.palette.primary.main})}
        {children}
    </>
}

export default function SearchFromPath(): JSX.Element {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { loading: abelLoading, loadedPromise } = useAbelAssetsContext();

    const [loading, setLoading] = React.useState(false);
    const [loadingMessage, setLoadingMessage] = React.useState<string|undefined>();
    const [error, setError] = React.useState<string>();
    const [icon, setIcon] = React.useState<(props: any) => JSX.Element>();

    React.useEffect(() => {
        const [_, target] = pathname.split('/');
        (async() => {
            try {
                setLoading(true);
                let destination: string;
                try {
                    destination = await search(target);

                } catch(e) {
                    if (abelLoading && loadedPromise) {
                        setLoadingMessage("Loading verified asset database...");
                        await loadedPromise;
                        destination = await search(target);
                    } else {
                        throw e
                    }
                }
                setError('');
                setLoading(false);
                navigate(destination);
            } catch (e) {
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
    }, []);

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
