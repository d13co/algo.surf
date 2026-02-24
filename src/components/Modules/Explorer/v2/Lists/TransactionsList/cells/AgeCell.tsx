import React from "react";
import { CellContext } from "@tanstack/react-table";
import { indexerModels } from "algosdk";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import { useDateFormat } from "src/contexts/DateFormatContext";
import { RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const niceNames: Record<string, string> = {
  relative: "Relative",
  local: "Local",
  utc: "UTC",
  epoch: "Unix Epoch",
  block: "Block",
};

const nextFormat: Record<string, string> = {
  relative: "local",
  local: "utc",
  utc: "epoch",
  epoch: "block",
  block: "relative",
};

export function AgeHeader() {
  const { format, cycle } = useDateFormat();
  const label = format === "block" ? "Block" : format === "relative" ? "Age" : "Date";
  const next = nextFormat[format];
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center cursor-pointer opacity-60 hover:opacity-100"
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
  const txn = new CoreTransaction(row.original);
  return (
    <MultiDateViewer
      timestamp={txn.getTimestamp()}
      block={txn.getBlock()}
      variant="short"
    />
  );
}
