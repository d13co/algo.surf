import { useEffect } from 'react';
import './ArcPortal.scss';
import {useLocation, Outlet} from "react-router-dom";
import {useDispatch} from "react-redux";
import {loadArcs} from "../../../../redux/arcPortal/actions/arcs";
import useTitle from "../../../Common/UseTitle/UseTitle";

function ArcPortal(): JSX.Element {
    const location = useLocation();
    const dispatch = useDispatch();
    dispatch(loadArcs());

    useTitle('A.O: ARC Portal', true);

    return (
        <div className="arc-portal-root">
        <div className={"arc-portal-header"}>
        <div>
        ARC Portal
        </div>
        </div>
            <Outlet />
        </div>
    );
}

export default ArcPortal;
