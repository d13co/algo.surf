import Link from "./Link";
import React from "react";
import { ellipseString } from "src/packages/core-sdk/utils";
import Copyable from "src/components/v2/Copyable";

function LinkToBlockscan({
  address,
  copy = "right",
  copySize = "m",
  strip = 0,
}: {
  address: string;
  copy?: "left" | "right" | "none";
  copySize?: "m" | "s";
  strip?: number;
}): JSX.Element {
  return (
    <span className="inline-flex items-center min-w-0 max-w-full">
      {copy === "left" ? (
        <Copyable size={copySize} value={address} />
      ) : null}
      <Link
        className="truncate"
        href={`https://blockscan.com/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {strip ? ellipseString(address, strip) : address}
      </Link>
      {copy === "right" ? (
        <Copyable size={copySize} value={address} />
      ) : null}
    </span>
  );
}

export default LinkToBlockscan;
