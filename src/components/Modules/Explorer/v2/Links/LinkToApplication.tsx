import Link from "./Link";
import React from "react";
import Copyable from "src/components/v2/Copyable";
import { ellipseString } from "src/packages/core-sdk/utils";

function LinkToApplication({
  id,
  name = "",
  copy = "",
  copySize = "m",
  address,
  strip = 0,
}: {
  id: number;
  name?: string;
  copy?: string;
  copySize?: "m" | "s";
  address?: string;
  strip?: number;
}): JSX.Element {
  const label = name || String(id);
  const copyValue = address || id;
  return (
    <span className="inline-flex items-center min-w-0 max-w-full">
      {copy === "left" ? <Copyable size={copySize} value={copyValue}/> : null}
      <Link className="truncate" href={"/application/" + id}>
        {label}
      </Link>
      {copy === "right" ? <Copyable size={copySize} value={copyValue}/> : null}
    </span>
  );
}

export default LinkToApplication;
