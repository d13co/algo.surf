import './TransactionNote.scss';
import React, {useState, useMemo} from "react";
import {Button, ButtonGroup, Grid} from "@mui/material";
import {CoreTransaction} from "../../../../../../../packages/core-sdk/classes/core/CoreTransaction";
import {TEXT_ENCODING} from "../../../../../../../packages/core-sdk/constants";
import {shadedClr} from "../../../../../../../utils/common";
import Copyable from '../../../../../../Common/Copyable/Copyable';

interface TransactionNoteState{
    textEncoding: string,
}
const initialState: TransactionNoteState = {
    textEncoding: TEXT_ENCODING.TEXT,
};

function TransactionNote(props): JSX.Element {
    const {transaction} = props;
    const txnInstance = new CoreTransaction(transaction);

    const txnJson = useMemo(() => txnInstance.getNoteJSON(), [txnInstance.getNote()]);

    const [
        {textEncoding},
        setState
    ] = useState(txnJson ? { textEncoding: TEXT_ENCODING.JSON } : initialState);

    function setTextEncoding(encoding: string) {
        setState(prevState => ({...prevState, textEncoding: encoding}));
    }


    return (<div className={"transaction-note-wrapper"}>
        <div className={"transaction-note-container"}>

            {txnInstance.getNote() ? <div className="props" style={{background: shadedClr}}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                        <div className="property">
                            <div className="key">
                                Note
                                <ButtonGroup variant="outlined" size={"small"} style={{marginLeft: 20, marginRight: 15}}>
                                    { txnInstance.getNoteJSON() ? <Button variant={textEncoding === TEXT_ENCODING.JSON ? 'contained' : 'outlined'} onClick={() => {setTextEncoding(TEXT_ENCODING.JSON)}}>JSON</Button> : null }
                                    <Button variant={textEncoding === TEXT_ENCODING.TEXT ? 'contained' : 'outlined'} onClick={() => {setTextEncoding(TEXT_ENCODING.TEXT)}}>Text</Button>
                                    <Button variant={textEncoding === TEXT_ENCODING.BASE64 ? 'contained' : 'outlined'} onClick={() => {setTextEncoding(TEXT_ENCODING.BASE64)}}>Base64</Button>
                                    <Button variant={textEncoding === TEXT_ENCODING.MSG_PACK ? 'contained' : 'outlined'} onClick={() => {setTextEncoding(TEXT_ENCODING.MSG_PACK)}}>Msgpack</Button>
                                    <Button variant={textEncoding === TEXT_ENCODING.HEX ? 'contained' : 'outlined'} onClick={() => {setTextEncoding(TEXT_ENCODING.HEX)}}>Hex</Button>
                                </ButtonGroup>
                                <Copyable value={txnInstance.getNote(textEncoding)} />
                            </div>
                            <div className="value small">
                                <div style={{marginTop: 30, wordBreak: 'break-word',}}>
                                    { textEncoding === TEXT_ENCODING.JSON ? <span style={{whiteSpace: 'pre'}}>
                                        {txnInstance.getNote(textEncoding)}
                                    </span> : txnInstance.getNote(textEncoding) }
                                </div>
                            </div>
                        </div>
                    </Grid>
                </Grid>
            </div> : ''}

        </div>
    </div>);
}

export default TransactionNote;
