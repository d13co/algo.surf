import './Search.scss';
import React, {useCallback,useState} from "react";
import {
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputBase,
    Tooltip,
} from "@mui/material";
import {Search as SearchIcon} from "@mui/icons-material";
import {isValidAddress} from "algosdk";
import {useNavigate} from "react-router-dom";
import {A_ApplicationResult, A_AssetResult, A_BlockResult} from "../../../../packages/core-sdk/types";
import {AssetClient} from "../../../../packages/core-sdk/clients/assetClient";
import {isNumber} from "../../../../utils/common";
import explorer from "../../../../utils/dappflow";
import {ApplicationClient} from "../../../../packages/core-sdk/clients/applicationClient";
import {BlockClient} from "../../../../packages/core-sdk/clients/blockClient";
import {hideLoader, showLoader} from "../../../../redux/common/actions/loader";
import {useDispatch} from "react-redux";
import {showSnack} from "../../../../redux/common/actions/snackbar";
import {theme} from "../../../../theme";
import {ClipboardPaste} from 'lucide-react';
import CloseIcon from "@mui/icons-material/Close";

function getLink(result: A_AssetResult | A_ApplicationResult | A_BlockResult) {
    const { type } = result;
    if (type === "block") {
        return `/explorer/block/${result.round}`;
    } else if (type === "asset" ) {
        return `/explorer/asset/${result.index}/transactions`;
    } else {
        return `/explorer/application/${result.id}/transactions`;
    }
}

interface SettingsState{
    searchStr: string,
    showSearchResults: boolean
}

const initialState: SettingsState = {
    searchStr: '',
    showSearchResults: false
};

interface SearchProps {
    placeholder?: string
    autoFocus?: boolean
}

const defaultPlaceholder = "  Address / Transaction / Asset / Application";

function Search(props: SearchProps): JSX.Element {
    const { autoFocus, placeholder = defaultPlaceholder } = props;

    const navigate = useNavigate();
    const dispatch = useDispatch();

    const [
        {searchStr, showSearchResults},
        setState
    ] = useState(initialState);

    const clearState = useCallback(() => {
        setState({ ...initialState });
    }, []);

    const doSearch = useCallback((override?: string) => {
        (async function () {
            const target = override ?? searchStr;
            if (!target) {
                return;
            }
            if (isValidAddress(target)) {
                setState(prevState => ({...prevState, target: ""}));
                navigate('/explorer/account/' + target);
                return;
            } else if (target.length === 58) {
                dispatch(showSnack({
                    severity: 'error',
                    message: `Address is not valid`
                }));
                return;
            }
            if (target.length === 52) {
                setState(prevState => ({...prevState, target: ""}));
                navigate('/explorer/transaction/' + target);
                return;
            }

            if (isNumber(target)) {
                try {
                    dispatch(showLoader("Searching"));
                    const searchNum = Number(target);
                    const [asset, app, block] = await Promise.all([
                        new AssetClient(explorer.network).search(searchNum),
                        new ApplicationClient(explorer.network).search(searchNum),
                        new BlockClient(explorer.network).search(searchNum),
                    ]);
                    const first = [asset, app, block].find(e => e);

                    if (!first) {
                        dispatch(showSnack({
                            severity: 'error',
                            message: 'No results found'
                        }));
                        dispatch(hideLoader());
                        return;
                    }

                    let destination = getLink(first);

                    if (block && first !== block) {
                        destination += `?dym=block:${block.round}`;
                    }
                    dispatch(hideLoader());
                    console.log("Navigating", destination);
                    navigate(destination);
                } catch (e) {
                    dispatch(showSnack({
                        severity: 'error',
                        message: `Error while searching: ${(e as Error).message}`
                    }));
                    dispatch(hideLoader());
                    return;
                }
            }

            dispatch(showSnack({
                severity: 'error',
                message: `Not something I can search for: ${target}`,
            }));
        })()
    }, [searchStr, dispatch, navigate]);

    const doPasteSearch = useCallback(() => {
        (async function () {
            try {
                const value = await navigator.clipboard.readText();
                setState(s => ({...s, searchStr: value}));
                doSearch(value);
            } catch(_e) {
                const e = _e as Error;
                if (e.message.includes('is not a function')) {
                    dispatch(showSnack({
                        severity: 'error',
                        message: 'Could not paste and search: Your browser does not support this Paste button.'
                    }));
                } else {
                    dispatch(showSnack({
                        severity: 'error',
                        message: `Could not paste and search: ${e.message}`
                    }));
                }
            }
        })()
    }, [doSearch]);

    function handleClose() {
        setState(prevState => ({...prevState, showSearchResults: false}));
    }

    return (<div className={"search-wrapper"}>
        <div className={"search-container"}>
             <InputBase
                 autoFocus={autoFocus}
                 placeholder={placeholder}
                 style={{
                     padding: 3,
                         paddingLeft: 10,
                         fontSize: 14,
                         border: '1px solid ' + theme.palette.grey[500],
                         borderRadius: '64px',
                 }}
                 value={searchStr}
                 startAdornment={
                     <IconButton onClick={() => doSearch() }>
                         <SearchIcon style={{ color: theme.palette.grey[500] }} />
                     </IconButton>
                 }
                 endAdornment={
                     <Tooltip title="Paste and search">
                         <IconButton onClick={() => doPasteSearch() }>
                             <ClipboardPaste size={20} color={theme.palette.grey[500]} />
                         </IconButton>
                     </Tooltip>
                 }
                 onChange={(ev) => {
                     setState(prevState => ({...prevState, searchStr: ev.target.value}));
                     const { length } = ev.target.value;
                     if (length === 52 || length === 58) {
                         doSearch(ev.target.value);
                     }
                 }}
                 onKeyUp={(event) => {
                     if (event.key === 'Enter') {
                         event.preventDefault();
                         doSearch();
                     }
                 }}
            fullWidth/>

            {showSearchResults ? <Dialog
                onClose={handleClose}
                fullWidth={true}
                maxWidth={"xs"}
                open={showSearchResults}
            >
                <DialogTitle >
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                        <div>
                            <div style={{fontWeight: "bold", fontSize: 18}}>Search results</div>
                        </div>
                        <CloseIcon className="modal-close-button" onClick={handleClose}/>
                    </div>
                </DialogTitle>
                <DialogContent>
                    <div className="search-results-wrapper">
                        <div className="search-results-container">
                            <div>
                            </div>
                        </div>
                    </div>
                </DialogContent>
                <DialogActions>

                </DialogActions>
            </Dialog> : ''}


        </div>
    </div>);
}

export default Search;
