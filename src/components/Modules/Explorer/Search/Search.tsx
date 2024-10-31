import './Search.scss';
import React, {useState} from "react";
import {
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputBase
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

function Search(): JSX.Element {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const [
        {searchStr, showSearchResults},
        setState
    ] = useState(initialState);

    const clearState = () => {
        setState({ ...initialState });
    };

    async function doSearch() {
        if (!searchStr) {
            return;
        }
        if (isValidAddress(searchStr)) {
            setState(prevState => ({...prevState, searchStr: ""}));
            navigate('/explorer/account/' + searchStr);
            return;
        }
        if (searchStr.length === 52) {
            setState(prevState => ({...prevState, searchStr: ""}));
            navigate('/explorer/transaction/' + searchStr);
            return;
        }

        if (isNumber(searchStr)) {
            try {
                dispatch(showLoader("Searching"));
                const searchNum = Number(searchStr);
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
            }
        }

    }

    function handleClose() {
        setState(prevState => ({...prevState, showSearchResults: false}));
    }

    return (<div className={"search-wrapper"}>
        <div className={"search-container"}>


             <InputBase
                 placeholder="Address / Transaction / Asset / Application"
                style={{
                    padding: 3,
                    paddingLeft: 10,
                    fontSize: 14,
                    border: '1px solid ' + theme.palette.grey[200],
                    borderRadius: '64px',
                }}
                value={searchStr}
                startAdornment={<IconButton color="primary" onClick={() => {
                    doSearch();
                }}>
                    <SearchIcon />
                </IconButton>}
                onChange={(ev) => {
                    setState(prevState => ({...prevState, searchStr: ev.target.value}));
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
