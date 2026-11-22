import React from "react";
import { useLatestRound } from "@d13co/algo-metrics-react";

const networkLabel = process.env.REACT_APP_NETWORK;

/** Ⱥ Surf and, after it in the primary color, the network's name, or `label` in its place. */
export default function Logo({ label = networkLabel }: { label?: string }): JSX.Element {
    const currentBlock = useLatestRound();
    const pulseClassName = React.useMemo(() => currentBlock != null && currentBlock % 2n === 0n ? 'pulse' : 'pulse2', [currentBlock]);

    return <span className="whitespace-nowrap">
        <span className={pulseClassName}>Ⱥ</span> Surf{' '}
        <span className="text-primary">{label}</span>
    </span>;
}
