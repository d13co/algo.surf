import React from "react";
import { useLatestRound } from "@d13co/algo-metrics-react";

const networkLabel = process.env.REACT_APP_NETWORK;

export default function Logo(): JSX.Element {
    const currentBlock = useLatestRound();
    const pulseClassName = React.useMemo(() => currentBlock != null && currentBlock % 2n === 0n ? 'pulse' : 'pulse2', [currentBlock]);

    return <span className="whitespace-nowrap">
        <span className={pulseClassName}>Ⱥ</span> Surf{' '}
        <span className="text-primary">{networkLabel}</span>
    </span>;
}
