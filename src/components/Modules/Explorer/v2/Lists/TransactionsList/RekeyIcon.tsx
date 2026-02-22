import React from "react";
import { KeyRound } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

export default function RekeyIcon() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center text-muted-foreground">
            <KeyRound size={14} strokeWidth={1.75} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          <p>Rekey transaction</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
