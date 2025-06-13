import './Search.scss';
import React, {useCallback,useState,useRef} from "react";
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
import {useNavigate} from "react-router-dom";
import {hideLoader, showLoader} from "../../../../redux/common/actions/loader";
import {useDispatch} from "react-redux";
import {showSnack} from "../../../../redux/common/actions/snackbar";
import {theme} from "../../../../theme";
import {ClipboardPaste} from 'lucide-react';
import CloseIcon from "@mui/icons-material/Close";
import { useHotkeys } from 'react-hotkeys-hook';
import coreSearch from './CoreSearch';

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
    const inputRef = useRef<HTMLInputElement>();

    const onHotkey = useCallback(e => {
        e.preventDefault(); inputRef.current?.focus();
    }, [inputRef]);

    useHotkeys('/', onHotkey);
    useHotkeys('ctrl+k', onHotkey);

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

            dispatch(showLoader("Searching"));
            try {
                const destination = await coreSearch(target);
                setState({ ...initialState });
                inputRef.current?.blur();
                navigate(destination);
            } catch(e) {
                dispatch(showSnack({
                    severity: 'error',
                    message: (e as Error).message,
                }));
            }
            dispatch(hideLoader());

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
                 inputRef={inputRef}
                 autoFocus={autoFocus}
                 placeholder={placeholder}
                 style={{
                     background: 'rgba(18,18,18,0.7)',
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
                     searchStr ? <Tooltip title="Clear">
                         <IconButton onClick={() => clearState() } style={{color: theme.palette.grey[500]}}>
                             <CloseIcon color="inherit" />
                         </IconButton>
                     </Tooltip>
                     : <Tooltip title="Paste and search">
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
                     if (ev.target.value.endsWith(".algo")) {
                        doSearch(ev.target.value.trim())
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
