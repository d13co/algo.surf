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
};

const nextFormat: Record<DateFormat, DateFormat> = {
  relative: "local",
  local: "utc",
  utc: "epoch",
  epoch: "relative",
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
  switcherSide = "left",
  variant = "default",
}: {
  timestamp: number;
  switcherSide?: "left" | "right";
  variant?: "default" | "short";
}): JSX.Element {
  const { format, cycle } = useDateFormat();
  const next = nextFormat[format];

  if (variant === "short") {
    const shortValue = formatDateShort(timestamp, format);
    const fullValue = formatDate(timestamp, format);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cursor-pointer text-left whitespace-nowrap"
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

  const displayValue = formatDate(timestamp, format);

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
          Showing {niceNames[format]}. Click to show {niceNames[next]}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <span className="group gap-0.5 inline-flex items-center">
      {switcherSide === "left" && switcher}
      <span>{format === "epoch" ? `Unix ${displayValue}` : displayValue}</span>
      {switcherSide === "right" && switcher}
      {format !== "relative" ? (
        <Copyable
          className="opacity-60 group-hover:opacity-100"
          value={displayValue}
        />
      ) : null}
    </span>
  );
}
