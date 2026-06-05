import React from "react";
import Link from "./Link";
import { cn } from "src/lib/utils";

function LinkToAsset({
  id,
  name = "",
  style = undefined,
  className = undefined,
}: {
  id: string | number;
  name?: string;
  style?: React.CSSProperties;
  className?: string;
}): JSX.Element {
  if (!name) {
    name = String(id);
  }

  return (
    <Link
      // inline-block + truncate so a long name ellipsizes within its container
      // (e.g. a grid column on mobile) instead of overflowing into siblings.
      className={cn(
        "inline-block align-bottom max-w-full overflow-hidden text-ellipsis whitespace-nowrap",
        className,
      )}
      href={"/asset/" + id}
      style={style}
    >
      {name}
    </Link>
  );
}

export default LinkToAsset;
