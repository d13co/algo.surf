import { useEffect, useState } from "react";

/**
 * Seconds remaining until a unix timestamp, ticking once a second and clamped at zero.
 *
 * Keep this in a leaf component: it re-renders its owner every second, so pulling it up into a
 * shared hook would re-render every consumer of that hook once a second too.
 */
export function useCountdown(targetEpochSeconds: number, enabled = true): number {
    const remainingNow = () => Math.max(0, Math.round(targetEpochSeconds - Date.now() / 1000));
    const [remaining, setRemaining] = useState(remainingNow);

    useEffect(() => {
        if (!enabled) return;
        // Resync immediately: the target may have changed, or we may have been unmounted a while.
        setRemaining(remainingNow());
        if (remainingNow() <= 0) return;

        const id = setInterval(() => {
            const next = remainingNow();
            setRemaining(next);
            if (next <= 0) clearInterval(id);
        }, 1000);

        return () => clearInterval(id);
    }, [targetEpochSeconds, enabled]);

    return remaining;
}

export default useCountdown;
