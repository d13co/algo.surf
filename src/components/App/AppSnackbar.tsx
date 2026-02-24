import React, { useEffect, useState } from "react";
import { useGlobalUI } from "../../contexts/GlobalUIContext";
import Copyable from "../../components/v2/Copyable";

function colorFromSeverity(s: string): string {
    switch(s) {
        case "error": return "border-l-red-500";
        case "warning": return "border-l-warning";
        default: return "border-l-primary";
    }
}

function AppSnackbar(): JSX.Element {
    const { snackbar, hideSnack } = useGlobalUI();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (snackbar.show) {
            setVisible(true);
            const duration = snackbar.severity === "error" ? 10_000 : 5000;
            const timer = setTimeout(() => {
                hideSnack();
            }, duration);
            return () => clearTimeout(timer);
        } else {
            setVisible(false);
        }
    }, [snackbar.show, snackbar.severity, hideSnack]);

    if (!visible) return <></>;

    const borderColor = colorFromSeverity(snackbar.severity);

    return (
        <div className="fixed bottom-5 right-5 z-50">
            <div className={`rounded-[10px] py-5 px-5 min-w-[400px] max-w-[90vw] border border-border ${borderColor} border-l-[5px] bg-background-card flex items-start gap-3`}>
                <div className="grow text-sm" dangerouslySetInnerHTML={{__html: snackbar.message}} />
                <Copyable value={snackbar.message} />
                <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground text-lg leading-none ml-1"
                    onClick={() => hideSnack()}
                    aria-label="Close"
                >
                    &times;
                </button>
            </div>
        </div>
    );
}

export default AppSnackbar;
