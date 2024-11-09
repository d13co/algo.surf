import React from "react";
import {useSelector} from "react-redux";
import {RootState} from "../../../../redux/store";
import {theme} from '../../../../theme/index';
import "./Logo.scss";

const networkLabel = process.env.REACT_APP_NETWORK;
const primary = theme.palette.primary.main;

export default function Logo(): JSX.Element {
    const liveData = useSelector((state: RootState) => state.liveData);
    const {currentBlock} = liveData;
    const pulseClassName = React.useMemo(() => currentBlock % 2 === 0 ? 'pulse' : 'pulse2', [currentBlock]);

    return <span style={{whiteSpace: 'nowrap'}}>
        <span className={pulseClassName}>Ⱥ</span> Surf{' '}
        <span style={{color: primary}}>{networkLabel}</span>
    </span>;
}
