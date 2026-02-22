import React from "react";
import Link from "./Link";

function LinkToAsset({
  id,
  name = "",
  style = undefined,
}: {
  id: string | number;
  name?: string;
  style?: React.CSSProperties;
}): JSX.Element {
  if (!name) {
    name = String(id);
  }

  return (
    <Link
      className="max-w-[calc(100vw-100px)] overflow-hidden text-ellipsis whitespace-nowrap inline-flex items-center flex-nowrap"
      href={"/asset/" + id}
      style={style}
    >
      {name}
    </Link>
  );
}

export default LinkToAsset;
