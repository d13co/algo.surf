import React from "react";
import { Chip } from "src/components/v2/Chips";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

function XChainBadge(): JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Chip variant="warning" className="cursor-help">xChain</Chip>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border">
          <p>
            xChain Accounts is an Account Abstraction system enabling EVM
            wallet usage on Algorand
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default XChainBadge;
