import Link from "./Link";
import React from "react";
import { ellipseString } from "src/packages/core-sdk/utils";
import Copyable from "src/components/v2/Copyable";
import { useReverseNFD } from "src/components/Common/UseNFD";
import { getEscrowOf } from "src/hooks/useAccount";
import LinkToApplication from "./LinkToApplication";

function LinkToAccount({
  address,
  noNFD = false,
  noEscrow = false,
  subPage = "",
  copy = "right",
  copySize = "m",
  strip = 0,
}: {
  address: string;
  noNFD?: boolean;
  noEscrow?: boolean;
  subPage?: string;
  copy?: "left" | "right" | "none";
  copySize?: "m" | "s";
  strip?: number;
}): JSX.Element {
  const { data: nfd } = useReverseNFD(address);
  const escrowAppId = getEscrowOf(address);

  if (typeof escrowAppId === "number" && !noEscrow) {
    return <LinkToApplication id={escrowAppId} name={"App " + escrowAppId} />;
  }

  return (
    <span className="inline-flex items-center min-w-0 max-w-full">
      {copy === "left" ? (
        <Copyable size={copySize} value={address} />
      ) : null}
      <Link
        className="truncate"
        href={`/account/${address}/${subPage}`}
      >
        {nfd && !noNFD ? nfd + " " : null}
        {strip ? ellipseString(address, strip) : address}
      </Link>
      {copy === "right" ? (
        <Copyable size={copySize} value={address} />
      ) : null}
    </span>
  );
}

export default LinkToAccount;
