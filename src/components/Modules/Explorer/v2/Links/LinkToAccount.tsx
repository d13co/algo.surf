import Link from "./Link";
import React from "react";
import { ellipseString } from "src/packages/core-sdk/utils";
import Copyable from "src/components/v2/Copyable";
import { useReverseNFD } from "src/components/Common/UseNFD";
import { useAddressBook } from "src/hooks/useAddressBook";
import { getEscrowOf } from "src/hooks/useAccount";
import LinkToApplication from "./LinkToApplication";

function LinkToAccount({
  address,
  noNFD = false,
  nfdOnly = false,
  noEscrow = false,
  shortEscrow = false,
  subPage = "",
  copy = "right",
  copySize = "m",
  strip = 0,
}: {
  address: string;
  noNFD?: boolean;
  nfdOnly?: boolean;
  noEscrow?: boolean;
  shortEscrow?: boolean;
  subPage?: string;
  copy?: "left" | "right" | "none";
  copySize?: "m" | "s";
  strip?: number;
}): JSX.Element {
  const { data: nfd } = useReverseNFD(address);
  const { data: addressBook } = useAddressBook();
  const escrowAppId = getEscrowOf(address);

  // Display-name precedence: address book label, then NFD.
  const label = addressBook?.[address];
  const name = label ?? (noNFD ? null : nfd);

  // Hover text: every identifier we have for this address, one per line.
  const title = [
    label,
    nfd,
    typeof escrowAppId === "number" ? "App " + escrowAppId : null,
    address,
  ]
    .filter(Boolean)
    .join("\n");

  // App escrow only applies when there's no higher-precedence name to show.
  if (typeof escrowAppId === "number" && !noEscrow && !name) {
    const escrowName = shortEscrow
      ? "App " + escrowAppId
      : "App " + escrowAppId + " " + ellipseString(address, strip || 8);
    return <LinkToApplication id={escrowAppId} name={escrowName} address={address} title={title} copy={copy} copySize={copySize} />;
  }

  return (
    <span className="inline-flex items-center min-w-0 max-w-full">
      {copy === "left" ? (
        <Copyable size={copySize} value={address} />
      ) : null}
      <Link
        className="truncate"
        href={`/account/${address}/${subPage}`}
        title={title}
      >
        {name ? name + (nfdOnly ? "" : " ") : null}
        {name && nfdOnly ? null : strip ? ellipseString(address, strip) : address}
      </Link>
      {copy === "right" ? (
        <Copyable size={copySize} value={address} />
      ) : null}
    </span>
  );
}

export default LinkToAccount;
