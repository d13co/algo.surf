import Link from "./Link";
import React from "react";
import { ellipseString } from "src/packages/core-sdk/utils";

interface LinkToTransactionProps {
  id: string;
  strip?: number;
}

function LinkToTransaction({ id, strip = 0 }: LinkToTransactionProps): JSX.Element {
  return (
    <Link className="truncate" href={"/transaction/" + id}>
      {strip ? ellipseString(id, strip) : id}
    </Link>
  );
}

export default LinkToTransaction;
