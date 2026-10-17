import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { useDateFormat, niceNames, nextFormat, DateFormat } from "src/contexts/DateFormatContext";
import { RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

/** What a time column holds in `format`. */
export function ageLabel(format: DateFormat): string {
  return format === "block" ? "Block" : format === "relative" ? "Age" : format === "epoch" ? "Unix" : "Date";
}

/** The date format a time column shows; "block" is relative where the block shows beside it (`noBlock`). */
export function shownFormat(format: DateFormat, noBlock = false): DateFormat {
  return noBlock && format === "block" ? "relative" : format;
}

/**
 * A time column's header, with a switcher cycling the date format. `noBlock`:
 * the column shows the block beside the time, so the cycle skips "block".
 */
export function AgeHeader({
  switcherSide = "right",
  noBlock = false,
  label,
}: {
  switcherSide?: "left" | "right";
  noBlock?: boolean;
  /** In place of ageLabel, given the format shown. */
  label?: (format: DateFormat) => string;
}) {
  const { format: chosen, setFormat } = useDateFormat();
  const format = shownFormat(chosen, noBlock);
  const next = noBlock && nextFormat[format] === "block" ? nextFormat.block : nextFormat[format];
  const cycle = () => setFormat(next);
  return (
    <span className={`inline-flex items-center gap-1${switcherSide === "left" ? " flex-row-reverse" : ""}`}>
      {(label ?? ageLabel)(format)}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center -my-1 cursor-pointer opacity-60 hover:opacity-100"
              onClick={cycle}
            >
              <RefreshCw size={12} />
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white border-border">
            Showing {niceNames[format]}. Click to show {niceNames[next]}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

export default function AgeCell({
  row,
}: CellContext<indexerModels.Transaction, unknown>) {
  const txn = React.useMemo(() => new CoreTransaction(row.original), [row.original]);
  return (
    <MultiDateViewer
      timestamp={txn.getTimestamp()}
      block={txn.getBlock()}
      variant="short"
    />
  );
}
