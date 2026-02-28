import React, { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import humanizeDuration from "humanize-duration";
import dateFormat from "dateformat";
import { TIMESTAMP_DISPLAY_FORMAT } from "src/packages/core-sdk/constants";
import { useDateFormat, DateFormat, niceNames, nextFormat } from "src/contexts/DateFormatContext";
import Copyable from "src/components/v2/Copyable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

function formatDate(timestamp: number, format: DateFormat): string {
  const date = new Date(timestamp * 1000);
  switch (format) {
    case "relative": {
      // @ts-ignore
      const diff = new Date() - date;
      return humanizeDuration(diff, { largest: 2, round: true }) + " ago";
    }
    case "local":
      return dateFormat(date, TIMESTAMP_DISPLAY_FORMAT);
    case "utc":
      return dateFormat(date, "UTC:" + TIMESTAMP_DISPLAY_FORMAT) + " UTC";
    case "epoch":
      return String(timestamp);
  }
}

function formatDateShort(timestamp: number, format: DateFormat): string {
  const date = new Date(timestamp * 1000);
  switch (format) {
    case "relative": {
      // @ts-ignore
      const diff = new Date() - date;
      return humanizeDuration(diff, { largest: 1, round: true }) + " ago";
    }
    case "local":
      return dateFormat(date, "dd mmm yyyy HH:MM");
    case "utc":
      return dateFormat(date, "UTC:dd mmm yyyy HH:MM") + " UTC";
    case "epoch":
      return String(timestamp);
  }
}

function InlineSwitcher({ format, next, cycle, size = 16 }: {
  format: DateFormat; next: DateFormat; cycle: () => void; size?: number;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center p-[5px] -my-1 align-middle opacity-60 group-hover:opacity-100 cursor-pointer"
            onClick={cycle}
          >
            <RefreshCw size={size} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          Showing {niceNames[format]}. Click to show {niceNames[next]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ShortCycleButton({ onClick, tooltip, children }: {
  onClick: () => void; tooltip: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-pointer text-left" onClick={onClick}>
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function MultiDateViewer({
  timestamp,
  block,
  switcherSide = "left",
  variant = "default",
  fixedView,
  noCopy = false,
}: {
  timestamp: number;
  block?: number;
  switcherSide?: "left" | "right";
  variant?: "default" | "short" | "value";
  fixedView?: DateFormat;
  noCopy?: boolean;
}): JSX.Element {
  const { format: contextFormat, cycle } = useDateFormat();
  const format = fixedView ?? contextFormat;
  const hasBlock = block != null;

  const effectiveFormat = useMemo(
    () => format === "block" && !hasBlock ? "relative" : format,
    [format, hasBlock]
  );

  const next = useMemo(
    () => nextFormat[format === "block" && !hasBlock ? "relative" : format],
    [format, hasBlock]
  );

  const displayValue = useMemo(
    () => formatDate(timestamp, effectiveFormat === "block" ? "relative" : effectiveFormat),
    [timestamp, effectiveFormat]
  );

  if (variant === "value") {
    if (effectiveFormat === "block" && hasBlock) {
      return (
        <span className="inline-flex items-center gap-0.5">
          <span>{block}</span>
          {!noCopy && <Copyable value={block} />}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5">
        <span>{effectiveFormat === "epoch" ? `Unix ${displayValue}` : displayValue}</span>
        {!noCopy && <Copyable value={displayValue} />}
      </span>
    );
  }

  if (variant === "short") {
    const shortValue = formatDateShort(timestamp, effectiveFormat);
    const fullValue = formatDate(timestamp, effectiveFormat);
    const label = effectiveFormat === "block" ? block : shortValue;
    const tooltip = effectiveFormat === "block"
      ? `Block ${block} (click to show ${niceNames[next]})`
      : `${fullValue} (click to show ${niceNames[next]})`;
    if (fixedView) return <span>{label}</span>;
    return <ShortCycleButton onClick={cycle} tooltip={tooltip}>{label}</ShortCycleButton>;
  }

  const content = effectiveFormat === "block" ? block
    : effectiveFormat === "epoch" ? `Unix ${displayValue}` : displayValue;
  const copyValue = effectiveFormat === "block" ? block : displayValue;
  const switcher = fixedView ? null
    : <InlineSwitcher format={effectiveFormat} next={next} cycle={cycle} />;

  return (
    <span className="group gap-0.5 inline-flex items-center">
      {switcherSide === "left" && switcher}
      <span>{content}</span>
      {switcherSide === "right" && switcher}
      {!noCopy && effectiveFormat !== "relative" && (
        <Copyable className="opacity-60 group-hover:opacity-100" value={copyValue} />
      )}
    </span>
  );
}

export function DateSwitcher() {
  const { format, cycle } = useDateFormat();
  const next = nextFormat[format];
  return <InlineSwitcher format={format} next={next} cycle={cycle} size={14} />;
}
