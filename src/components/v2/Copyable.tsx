import React, { useState, useCallback, useMemo } from "react";
import { ClipboardCopy, ClipboardCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import { cn } from "src/lib/utils";

function fallbackCopy(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(el);
}

const copyTitle = "Click to copy";
const checkmarkTitle = "Copied";

export default function Copyable({
  size,
  className,
  value,
  style,
  children,
}: {
  size?: "s" | "m";
  className?: string;
  value: string | number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    const text = String(value);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
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
              "inline-flex items-center cursor-pointer px-[2px] -my-0.5 align-middle",
              children ? "min-w-0 overflow-hidden gap-1" : "justify-center shrink-0",
              className
            )}
            style={mergedStyle}
            onClick={copy}
          >
            {children}
            <span className="shrink-0">
              {copied ? (
                <ClipboardCheck size="1em" />
              ) : (
                <ClipboardCopy size="1em" />
              )}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          <p>{copied ? checkmarkTitle : copyTitle}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
