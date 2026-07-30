import React from "react";
import { ExternalLink } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import { cn } from "src/lib/utils";
import { ConsensusVersionInfo } from "src/packages/core-sdk/consensusVersions";

/**
 * Renders a consensus protocol as "Consensus v41" with an optional "AVM 12" line beneath.
 * Shared by the homepage upgrade tile, the upgrade dialog and the block upgrade card, so protocol
 * naming looks identical everywhere.
 */
export default function ConsensusVersion({
    info,
    showAvm = true,
    showLink = false,
    size = "default",
    className,
}: {
    info: ConsensusVersionInfo;
    showAvm?: boolean;
    showLink?: boolean;
    size?: "default" | "lg";
    className?: string;
}): JSX.Element {
    // Unrecognised protocols show the raw string on hover — the truncated name alone isn't enough
    // to identify which upgrade it is.
    const tooltip = info.known ? info.description : info.protocol;

    const name = (
        <span className={cn("text-primary", size === "lg" ? "text-xl" : undefined)}>
            Consensus {info.name}
        </span>
    );

    return (
        <div className={cn("inline-flex flex-col", className)}>
            <div className="inline-flex items-center gap-1.5">
                {tooltip ? (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="cursor-help">{name}</span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-border max-w-xs">
                                <p className={info.known ? undefined : "break-all"}>{tooltip}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    name
                )}
                {showLink && info.specUrl ? (
                    <a
                        href={info.specUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Protocol specification"
                        className="text-muted-foreground hover:text-primary shrink-0"
                    >
                        <ExternalLink size={14} />
                    </a>
                ) : null}
            </div>
            {showAvm && info.avm != null ? (
                <span className="text-muted-foreground text-[13px]">AVM {info.avm}</span>
            ) : null}
        </div>
    );
}
