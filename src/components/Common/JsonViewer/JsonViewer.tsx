import './JsonViewer.scss';
import React, {useState,useRef} from "react";
import {Button, Dialog, DialogActions, DialogContent, DialogTitle} from "@mui/material";
import ReactJson from 'react-json-view'
import {copyContent, exportData} from "../../../utils/common";
import {useDispatch} from "react-redux";
import CloseIcon from "@mui/icons-material/Close";
import {theme} from '../../../theme';

interface JsonViewerState{
    show: boolean,
}
const initialState: JsonViewerState & { expand: boolean }= {
    expand: false,
    show: false
};

function JsonViewer(props): JSX.Element {
    const [
        {show, expand},
        setState
    ] = useState(initialState);
    const dispatch = useDispatch();
    const expandButtonRef = useRef<HTMLButtonElement>();

    let {obj, filename, name, title, size, fullWidth, variant} = props;
    if (!obj) {
        obj = {};
    }
    if (!name) {
        name = 'View Raw JSON';
    }
    if (!title) {
        title = 'Raw JSON';
    }
    if (!size) {
        size = 'small';
    }
    if (!fullWidth) {
        fullWidth = false;
    }
    if (!variant) {
        variant = 'contained';
    }

    function handleClose() {
        setState(prevState => ({...prevState, show: false}));
    }

    function toggleExpand() {
        if (expandButtonRef?.current)
            expandButtonRef.current.innerHTML = expand ? "Collapsing" : "Expanding";

        setTimeout(() => {
            setState(prevState => {
                return { ...prevState, expand: !prevState.expand };
            });
        }, 5);

        setTimeout(() => {
            if (expandButtonRef?.current)
                expandButtonRef.current.innerHTML = expand ? "Expand All" : "Collapse";
        }, 10);
    }

    return (<div className={"json-viewer-wrapper"}>
        <div className={"json-viewer-container"}>

            <Button
                variant={variant}
                size={size}
                sx={{backgroundColor: theme.palette.primary.main}}
                fullWidth={fullWidth}
                onClick={() => {
                    setState(prevState => ({...prevState, show: true}));
                }}
            >{name}</Button>

            {show ? <Dialog
                onClose={handleClose}
                fullWidth={true}
                maxWidth={"md"}
                open={show}
            >
                <DialogTitle sx={{backgroundColor: "rgb(3, 26, 22)"}}>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                        <div>
                            <div style={{fontWeight: "bold", fontSize: 18}}>{title}</div>
                        </div>
                        <div>
                            <CloseIcon className="modal-close-button" onClick={handleClose}/>
                        </div>

                    </div>
                </DialogTitle>
                <DialogContent sx={{backgroundColor: "rgb(3, 26, 22)"}}>
                    <div className="json-viewer-content">
                        <div className="json-viewer-content-header">
                            <Button
                                ref={expandButtonRef}
                                variant={"outlined"}
                                size={"small"}
                                color={"primary"}
                                onClick={toggleExpand}
                            >{ !expand ? "Expand All" : "Collapse" }</Button>

                            <div>
                                <Button
                                    variant={"outlined"}
                                    size={"small"}
                                    color={"primary"}
                                    onClick={(ev) => {
                                        copyContent(ev, dispatch, JSON.stringify(obj), 'JSON Copied');
                                    }}
                                >Copy</Button>

                                <Button
                                    variant={"outlined"}
                                    size={"small"}
                                    style={{marginLeft: 10}}
                                    color={"primary"}
                                    onClick={() => {
                                        exportData(obj, filename);
                                    }}
                                >Download</Button>
                            </div>
                        </div>

                        <ReactJson
                            src={obj}
                            name={false}
                            displayObjectSize={false}
                            displayDataTypes={false}
                            enableClipboard={false}
                            iconStyle={"triangle"}
                            groupArraysAfterLength={expand ? 0 : 100}
                            collapsed={expand ? 99 : 1}
                            theme="apathy"
                        />
                    </div>
                </DialogContent>
                <DialogActions>

                </DialogActions>
            </Dialog> : ''}


        </div>
    </div>);
}

export default JsonViewer;
