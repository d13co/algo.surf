import './ApplicationBoxes.scss';
import React from "react";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "../../../../../../../redux/store";
import BoxesList from "../../../../Lists/BoxesList/BoxesList";

function ApplicationBoxes(): JSX.Element {
    const application = useSelector((state: RootState) => state.application);
    const { boxNames, boxError } = application;

    return (<div className={"application-transactions-wrapper"}>
        <div className={"application-transactions-container"}>
            <div className="application-transactions-body">
                {boxError ? <div className="box-error">{boxError}</div> : <BoxesList boxNames={boxNames}></BoxesList>}
            </div>
        </div>
    </div>);
}

export default ApplicationBoxes;
