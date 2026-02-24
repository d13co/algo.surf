import React from "react";
import { RefreshCw } from "lucide-react";
import humanizeDuration from "humanize-duration";
import dateFormat from "dateformat";
import { TIMESTAMP_DISPLAY_FORMAT } from "src/packages/core-sdk/constants";
import { useDateFormat, DateFormat } from "src/contexts/DateFormatContext";
import Copyable from "src/components/v2/Copyable";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const niceNames: Record<DateFormat, string> = {
  relative: "Relative",
  local: "Local",
  utc: "UTC",
  epoch: "Unix Epoch",
  block: "Block",
};

const nextFormat: Record<DateFormat, DateFormat> = {
  relative: "local",
  local: "utc",
  utc: "epoch",
  epoch: "block",
  block: "relative",
};

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

export default function MultiDateViewer({
  timestamp,
  block,
  switcherSide = "left",
  variant = "default",
}: {
  timestamp: number;
  block?: number;
  switcherSide?: "left" | "right";
  variant?: "default" | "short" | "value";
}): JSX.Element {
  const { format, cycle } = useDateFormat();
  const hasBlock = block != null;
  const effectiveFormat = format === "block" && !hasBlock ? "relative" : format;
  const next = hasBlock ? nextFormat[format] : nextFormat[format === "block" ? "relative" : format];

  if (variant === "value") {
    if (effectiveFormat === "block" && hasBlock) {
      return (
        <span className="inline-flex items-center gap-0.5">
          <span>{block}</span>
          <Copyable value={block} />
        </span>
      );
    }
    const displayValue = formatDate(timestamp, effectiveFormat);
    return (
      <span className="inline-flex items-center gap-0.5">
        <span>{effectiveFormat === "epoch" ? `Unix ${displayValue}` : displayValue}</span>
        <Copyable value={displayValue} />
      </span>
    );
  }

  if (variant === "short") {
    if (effectiveFormat === "block") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="cursor-pointer text-left"
                onClick={cycle}
              >
                {block}
              </button>
            </TooltipTrigger>
            <TooltipContent className="bg-black text-white border-border">
              Block {block} (click to show {niceNames[next]})
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    const shortValue = formatDateShort(timestamp, effectiveFormat);
    const fullValue = formatDate(timestamp, effectiveFormat);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cursor-pointer text-left"
              onClick={cycle}
            >
              {shortValue}
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white border-border">
            {fullValue} (click to show {niceNames[next]})
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (effectiveFormat === "block") {
    const switcher = (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center p-[5px] align-middle opacity-60 group-hover:opacity-100 cursor-pointer"
              onClick={cycle}
            >
              <RefreshCw size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white border-border">
            Showing {niceNames[effectiveFormat]}. Click to show {niceNames[next]}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    return (
      <span className="group gap-0.5 inline-flex items-center">
        {switcherSide === "left" && switcher}
        <span>{block}</span>
        {switcherSide === "right" && switcher}
        <Copyable
          className="opacity-60 group-hover:opacity-100"
          value={block}
        />
      </span>
    );
  }

  const displayValue = formatDate(timestamp, effectiveFormat);

  const switcher = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center p-[5px] align-middle opacity-60 group-hover:opacity-100 cursor-pointer"
            onClick={cycle}
          >
            <RefreshCw size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          Showing {niceNames[effectiveFormat]}. Click to show {niceNames[next]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <span className="group gap-0.5 inline-flex items-center">
      {switcherSide === "left" && switcher}
      <span>{effectiveFormat === "epoch" ? `Unix ${displayValue}` : displayValue}</span>
      {switcherSide === "right" && switcher}
      {effectiveFormat !== "relative" ? (
        <Copyable
          className="opacity-60 group-hover:opacity-100"
          value={displayValue}
        />
      ) : null}
    </span>
  );
}

export function DateSwitcher() {
  const { format, cycle } = useDateFormat();
  const next = nextFormat[format];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center p-[2px] align-middle opacity-60 hover:opacity-100 cursor-pointer"
            onClick={cycle}
          >
            <RefreshCw size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          Showing {niceNames[format]}. Click to show {niceNames[next]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
