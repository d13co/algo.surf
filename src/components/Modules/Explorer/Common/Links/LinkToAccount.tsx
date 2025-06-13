import Link from "./Link";
import React from "react";
import { ellipseString } from "../../../../../packages/core-sdk/utils";
import Copyable from "../../../../Common/Copyable/Copyable";
import "./LinkTo.scss";
import { useReverseNFD } from "../../../../Common/UseNFD";

function LinkToAccount({
  address,
  noNFD = false,
  subPage = "",
  copy = "right",
  copySize = "m",
  strip = 0,
}): JSX.Element {
  const { data : nfd } = useReverseNFD(address)
  return (
    <>
      {copy === "left" ? <Copyable size={copySize as any} value={address} /> : null}
      <Link className="long-id" href={`/account/${address}/${subPage}`}>
        { nfd && !noNFD ? nfd+" " : null}{strip ? ellipseString(address, strip) : address}
      </Link>
      {copy === "right" ? <Copyable size={copySize as any} value={address} /> : null}
    </>
  );
}

export default LinkToAccount;
