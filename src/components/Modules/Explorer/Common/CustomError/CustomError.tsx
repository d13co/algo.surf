import './CustomError.scss';
import React from "react";
import {Button, Grid, Typography} from "@mui/material";
import {Alert} from "@mui/lab";
import {showSettings} from "../../../../../redux/settings/actions/settings";
import {useDispatch} from "react-redux";
import {useNavigate} from "react-router-dom";
import {supportSettings} from "../../../../../utils/nodeConfig";
import {shadedClr} from "../../../../../utils/common";

function CustomError({ error }: { error?: string }): JSX.Element {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    return (<div className={"custom-error-wrapper"}>
        <div className={"custom-error-container"}>


            <Grid container spacing={2}>
                <Grid item xs={12} sm={12} md={6} lg={6} xl={6}>
                    <div className="info">
                        <Typography variant={"h4"}>Something went wrong</Typography>
                        <Alert icon={false} sx={{backgroundColor: shadedClr, color: "white"}} style={{marginTop: 20, borderRadius: 10}}>
                            The resource you are looking for is not available.
                        </Alert>
                    </div>

                    <div className="actions">
                        <Button color={"primary"} size={"medium"} variant={"outlined"} onClick={() => {
                            navigate('/explorer');
                        }}>Home</Button>
                    </div>

                </Grid>
            </Grid>


        </div>
    </div>);
}

export default CustomError;
