import './ApplicationActions.scss';
import React from "react";
import JsonViewer from "../../../../../../Common/JsonViewer/JsonViewer";
import OpenInMenu from '../../../../../../Common/OpenIn/OpenInMenu';



function ApplicationActions(props): JSX.Element {
    const {application} = props;
    const id = application?.information?.id;

    return (<div className={"application-actions-wrapper"}>
        <div className={"application-actions-container"}>
            <JsonViewer obj={application.information} filename={`app-${id}.json`} title={`Application ${id}`}></JsonViewer>
            <OpenInMenu pageType={"application"} id={id}></OpenInMenu>
        </div>
    </div>);
}

export default ApplicationActions;
