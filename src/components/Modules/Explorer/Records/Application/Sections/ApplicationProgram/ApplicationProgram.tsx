import './ApplicationProgram.scss';
import React, {useState} from "react";
import {shadedClr} from "../../../../../../../utils/common";
import { theme } from "../../../../../../../theme/index";
import {Button, ButtonGroup, Grid} from "@mui/material";
import {PROGRAM_ENCODING} from "../../../../../../../packages/core-sdk/constants";
import {ApplicationClient} from "../../../../../../../packages/core-sdk/clients/applicationClient";
import explorer from "../../../../../../../utils/dappflow";
import {useDispatch} from "react-redux";
import {hideLoader, showLoader} from "../../../../../../../redux/common/actions/loader";
import {handleException} from "../../../../../../../redux/common/actions/exception";
import {CodeBlock, tomorrowNightBright} from "react-code-blocks";
import Copyable from "../../../../../../Common/Copyable/Copyable";

const myTheme = {
    ...tomorrowNightBright,
    backgroundColor: shadedClr,
    literalColor: theme.palette.primary.main,
    builtInColor: theme.palette.primary.main,
    typeColor: theme.palette.primary.main,
    metaColor: theme.palette.primary.light,
    numberColor: theme.palette.primary.light,
    commentColor: theme.palette.primary.dark,
}

interface ApplicationApprovalProgramState{
    encoding: string,
    prg: string
}
const initialState: ApplicationApprovalProgramState = {
    encoding: PROGRAM_ENCODING.BASE64,
    prg: ''
};

function ApplicationProgram(props): JSX.Element {
    const {name, program} = props;
    const dispatch = useDispatch();

    const [
        {encoding, prg},
        setState
    ] = useState({
        ...initialState,
        prg: program
    });

    React.useEffect(() => {
        if (name === "Approval program") {
            setTextEncoding(PROGRAM_ENCODING.TEAL);
        }
    }, [name]);

    async function setTextEncoding(encoding: string) {
        if (encoding === PROGRAM_ENCODING.BASE64) {
            setState(prevState => ({...prevState, prg: program, encoding}));
        } else if (encoding === PROGRAM_ENCODING.TEAL) {
            try {
                dispatch(showLoader("Decompiling ..."));
                const applicationClient = new ApplicationClient(explorer.network);
                const result = await applicationClient.decompileProgram(program);
                dispatch(hideLoader());
                setState(prevState => ({...prevState, prg: result.data.result, encoding}));
            }
            catch (e: any) {
                dispatch(hideLoader());
                dispatch(handleException(e));
            }

        }
    }

    return (<div className={"application-program-wrapper"}>
        <div className={"application-program-container"}>

            <div className="props" style={{background: shadedClr}}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                        <div className="property">
                            <div className="key">
                                {name}

                                <ButtonGroup variant="outlined" size={"small"} style={{marginLeft: 20}}>
                                    <Button variant={encoding === PROGRAM_ENCODING.BASE64 ? 'contained' : 'outlined'} onClick={() => {setTextEncoding(PROGRAM_ENCODING.BASE64)}}>Base 64</Button>
                                    <Button variant={encoding === PROGRAM_ENCODING.TEAL ? 'contained' : 'outlined'} onClick={() => {setTextEncoding(PROGRAM_ENCODING.TEAL)}}>Teal</Button>
                                </ButtonGroup>
                                <Copyable value={prg} style={{marginLeft: "20px"}} />
                            </div>
                            <div className="value small" style={{marginTop: 20}}>
                                {encoding === PROGRAM_ENCODING.BASE64 ? prg : <div className="source">
                                    <CodeBlock
                                        text={prg}
                                        theme={myTheme}
                                        language="swift"
                                        showLineNumbers={false}
                                    />
                                </div>}

                            </div>
                        </div>
                    </Grid>
                </Grid>
            </div>

        </div>
    </div>);
}

export default ApplicationProgram;
