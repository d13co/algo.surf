import React from "react";
import {useLiveData} from "../../../../hooks/useLiveData";

const networkLabel = process.env.REACT_APP_NETWORK;

export default function Logo(): JSX.Element {
    const {currentBlock} = useLiveData();
    const pulseClassName = React.useMemo(() => currentBlock % 2 === 0 ? 'pulse' : 'pulse2', [currentBlock]);

    return <span className="whitespace-nowrap">
        <span className={pulseClassName}>Ⱥ</span> Surf{' '}
        <span className="text-primary">{networkLabel}</span>
    </span>;
}
