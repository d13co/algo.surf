import Link from "./Link";
import React from "react";
import { Link as LinkIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

function LinkToGroup({
  id,
  blockId,
  icon = false,
}: {
  id: string;
  blockId: number;
  icon?: boolean;
}): JSX.Element {
  const href = "/group/" + encodeURIComponent(id) + "/" + blockId;

  if (icon) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href={href} noStyle className="inline-flex items-center justify-center p-1">
              <LinkIcon size={14} />
            </Link>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white border-border">
            <p>Part of an atomic transaction group. Click to view entire group.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return <Link href={href}>{id}</Link>;
}

export default LinkToGroup;
