import './Application.scss';
import React, {useEffect} from "react";
import {Outlet, useNavigate, useParams} from "react-router-dom";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "../../redux/store";
import {Grid, Link, Tab, Tabs} from "@mui/material";
import {theme} from "../../theme";
import pSBC from 'shade-blend-color';
import {loadApplication} from "../../redux/actions/application";
import {CoreApplication} from "../../packages/core-sdk/classes/CoreApplication";


function Application(): JSX.Element {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const params = useParams();
    const {id} = params;

    const application = useSelector((state: RootState) => state.application);
    const shadedClr = pSBC(0.95, theme.palette.primary.main);
    const applicationInstance = new CoreApplication(application.information);

    useEffect(() => {
        dispatch(loadApplication(Number(id)));
    }, [dispatch, id]);

    return (<div className={"application-wrapper"}>
        <div className={"application-container"}>
            <div className="application-header">
                Application overview
            </div>
            <div className="application-body">
                <div className="id">
                    #{applicationInstance.getId()}
                </div>


                <div className="props" style={{background: shadedClr}}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                            <div className="property">
                                <div className="key">
                                    Approval program
                                </div>
                                <div className="value small" style={{marginTop: 20}}>
                                    {applicationInstance.getApprovalProgram()}
                                </div>
                            </div>
                        </Grid>
                    </Grid>
                </div>

                <div className="props" style={{background: shadedClr}}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={12} md={12} lg={12} xl={12}>
                            <div className="property">
                                <div className="key">
                                    Clear program
                                </div>
                                <div className="value small" style={{marginTop: 20}}>
                                    {applicationInstance.getClearProgram()}
                                </div>
                            </div>
                        </Grid>
                    </Grid>
                </div>


                <div className="props" style={{background: shadedClr}}>
                    <Grid container spacing={2}>

                        <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                            <div className="property center">
                                <div className="key">
                                    Global state byte
                                </div>
                                <div className="value">
                                    {applicationInstance.getGlobalSchemaByte()}
                                </div>
                            </div>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                            <div className="property center">
                                <div className="key">
                                    Global state uint
                                </div>
                                <div className="value">
                                    {applicationInstance.getGlobalSchemaUint()}
                                </div>
                            </div>
                        </Grid>



                        <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                            <div className="property center">
                                <div className="key">
                                    Local state byte
                                </div>
                                <div className="value">
                                    {applicationInstance.getLocalSchemaByte()}
                                </div>
                            </div>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3} lg={3} xl={3}>
                            <div className="property center">
                                <div className="key">
                                    Local state uint
                                </div>
                                <div className="value">
                                    {applicationInstance.getLocalSchemaUint()}
                                </div>
                            </div>
                        </Grid>


                        <Grid item xs={12} sm={6} md={6} lg={6} xl={6}>
                            <div className="property">
                                <div className="key">
                                    Creator
                                </div>
                                <div className="value small">
                                    <Link href={"/account/" + applicationInstance.getCreator()}>{applicationInstance.getCreator()}</Link>
                                </div>
                            </div>
                        </Grid>

                        <Grid item xs={12} sm={6} md={6} lg={6} xl={6}></Grid>
                    </Grid>
                </div>



                <div className="application-tabs">

                    <Tabs value="transactions">
                        <Tab label="Transactions" value="transactions" onClick={() => {
                            navigate('/application/' + id + '/transactions');
                        }}/>
                    </Tabs>

                    <Outlet />


                </div>
            </div>
        </div>
    </div>);
}

export default Application;