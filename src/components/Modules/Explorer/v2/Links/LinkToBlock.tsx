import Link from "./Link";
import React from "react";

/** A block; with `sender`, its transactions list shows only that sender's txns. */
function LinkToBlock({ id, sender }: { id: number; sender?: string }): JSX.Element {
  const href = sender ? `/block/${id}/transactions?sender=${sender}` : "/block/" + id;
  return <Link href={href} title={sender ? `Block ${id}, txns sent by ${sender}` : undefined}>{id}</Link>;
}

export default LinkToBlock;
