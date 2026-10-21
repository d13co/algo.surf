import Link from "./Link";
import React, { useMemo } from "react";
import { ellipseString } from "src/packages/core-sdk/utils";
import Copyable from "src/components/v2/Copyable";
import { useReverseNFD } from "src/components/Common/UseNFD";
import { useAddressBook } from "src/hooks/useAddressBook";
import { getEscrowOf } from "src/hooks/useAccount";
import LinkToApplication from "./LinkToApplication";
import { useKnownAddressName, useKnownAppName } from "src/hooks/useKnownNames";
import { knownApplicationAccount } from "src/utils/knownPrograms";

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
  // A known deployment's account is an escrow too, before (or without) the escreg lookup.
  const appAccount = useMemo(() => knownApplicationAccount(address), [address]);
  const escrowId = typeof escrowAppId === "number" ? escrowAppId : appAccount?.appId;
  // What the escrow's app is, when known without loading it, e.g. "Tinyman v2 validator".
  const escrowAppName = useKnownAppName(escrowId, false);
  // A known app's account or a logic sig account seen signing, e.g. "xChain 0x4ca8…e32e".
  const knownName = useKnownAddressName(address);
  const showEscrow = escrowId !== undefined && !noEscrow;

  // Display-name precedence: address book label, then NFD, then the known name (an escrow names its app instead).
  const label = addressBook?.[address];
  const name = label ?? (noNFD ? null : nfd) ?? (showEscrow ? null : knownName);

  // Hover text: every identifier we have for this address, one per line.
  const title = [
    label,
    nfd,
    knownName,
    escrowId !== undefined ? "App " + escrowId + (escrowAppName ? ` (${escrowAppName})` : "") : null,
    address,
  ]
    .filter(Boolean)
    .join("\n");

  // App escrow only applies when there's no higher-precedence name to show.
  if (escrowId !== undefined && showEscrow && !name) {
    const appLabel = escrowAppName ?? "App " + escrowId;
    const escrowName = shortEscrow
      ? appLabel
      : appLabel + " " + ellipseString(address, strip || 8);
    return <LinkToApplication id={escrowId} name={escrowName} address={address} title={title} copy={copy} copySize={copySize} />;
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
