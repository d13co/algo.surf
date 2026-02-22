import Link from "./Link";
import React from "react";
import Copyable from "src/components/v2/Copyable";

function LinkToApplication({
  id,
  name = "",
  copy = "",
  copySize = "m",
}: {
  id: number;
  name?: string;
  copy?: string;
  copySize?: "m" | "s";
}): JSX.Element {
  const label = name || String(id);
  return (
    <span className="inline-flex items-center min-w-0 max-w-full">
      {copy === "left" ? <Copyable size={copySize} value={id} /> : null}
      <Link className="truncate" href={"/application/" + id}>
        {label}
      </Link>
      {copy === "right" ? <Copyable size={copySize} value={id} /> : null}
    </span>
  );
}

export default LinkToApplication;
