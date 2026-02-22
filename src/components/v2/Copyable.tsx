import React, { useState, useCallback, useMemo } from "react";
import { ClipboardCopy, ClipboardCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import { cn } from "src/lib/utils";

const copyTitle = "Click to copy";
const checkmarkTitle = "Copied";

export default function Copyable({
  size,
  className,
  value,
  style,
}: {
  size?: "s" | "m";
  className?: string;
  value: string | number;
  style?: React.CSSProperties;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }, [value]);

  const mergedStyle = useMemo(
    () => ({
      fontSize: size === "s" ? "14px" : "inherit",
      ...style,
    }),
    [style, size]
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="copy"
            className={cn(
              "inline-flex items-center justify-center cursor-pointer p-[5px] -my-0.5 align-middle shrink-0",
              className
            )}
            style={mergedStyle}
            onClick={copy}
          >
            {copied ? (
              <ClipboardCheck size="1em" />
            ) : (
              <ClipboardCopy size="1em" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          <p>{copied ? checkmarkTitle : copyTitle}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
