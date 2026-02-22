import Link from "./Link";
import React from "react";

function LinkToBlock({ id }: { id: number }): JSX.Element {
  return <Link href={"/block/" + id}>{id}</Link>;
}

export default LinkToBlock;
