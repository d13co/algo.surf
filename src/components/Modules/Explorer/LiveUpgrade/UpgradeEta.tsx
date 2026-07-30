import React from "react";
import humanizeDuration from "humanize-duration";
import { useCountdown } from "src/hooks/useCountdown";

/**
 * Live "in about 4 hours 20 minutes" readout.
 *
 * Deliberately a leaf: it re-renders every second, so the tick must not live any higher up the tree
 * or the whole homepage would re-render once a second.
 */
export default function UpgradeEta({ targetEpoch }: { targetEpoch: number }): JSX.Element {
    const remaining = useCountdown(targetEpoch);

    if (remaining <= 0) {
        return <span className="text-primary">any moment now</span>;
    }

    return (
        <span>
            <span className="text-muted-foreground">~</span>
            <span className="text-foreground">
                {humanizeDuration(remaining * 1000, { largest: 2, round: true })}
            </span>
        </span>
    );
}
