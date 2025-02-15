import './AppCallTxnLogs.scss';
import React, {useState} from "react";
import {Button, ButtonGroup} from "@mui/material";
import atob from 'atob';
import {shadedClr} from "../../../../../../../../../utils/common";
import MultiFormatViewer from "../../../../../../../../Common/MultiFormatViewer/MultiFormatViewer";

enum TEXT_ENCODING {
    BASE64 = 'base64',
    TEXT = 'text',
    NUM = 'num'
}

interface AppCallTxnLogsState{
    textEncoding: string,
}

const initialState: AppCallTxnLogsState = {
    textEncoding: TEXT_ENCODING.BASE64
};

function parseNum(base64: string) {
    return parseInt(Buffer.from(base64, 'base64').toString("hex"), 16);
}

function AppCallTxnLogs(props): JSX.Element {
    let logs: string[] = props.logs;

    const [
        {textEncoding},
        setState
    ] = useState(initialState);

    function setTextEncoding(encoding: string) {
        setState(prevState => ({...prevState, textEncoding: encoding}));
    }

    return (<div className={"app-call-txn-logs-wrapper"}>
        <div className={"app-call-txn-logs-container"}>
            <div className="props" style={{background: shadedClr}}>
                <div className="property">
                    <div className="key">
                        Logs
                    </div>
                    <ol start={0} className="small">
                        {logs.map((log, index) => {
                            return <li key={index} className="item">
                                <MultiFormatViewer includeNum={true} value={log} />
                            </li>;
                        })}
                    </ol>
                </div>
            </div>

        </div>
    </div>);
}

export default AppCallTxnLogs;
