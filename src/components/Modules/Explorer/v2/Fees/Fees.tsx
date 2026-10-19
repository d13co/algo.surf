import { Bucket } from "src/hooks/useFees";
import { microalgosToAlgos } from "src/utils/common";
import SeriesPage, { Stat, formatSig } from "./SeriesPage";

const feesInAlgo = (b: Bucket) => microalgosToAlgos(b.fees);

function Fees(): JSX.Element {
  return (
    <SeriesPage
      title="Fees"
      y={feesInAlgo}
      format={formatSig}
      label="Fees (ALGO)"
      stats={(totals) => {
        const total = microalgosToAlgos(totals.fees);
        return (
          <>
            <Stat label="Total fees" value={`${formatSig(total, total)} ALGO`} />
            <Stat label="Transactions" value={totals.txns.toLocaleString()} />
            <Stat label="Avg fee per txn" value={totals.txns ? `${(total / totals.txns).toFixed(6)} ALGO` : "-"} />
            <Stat label="Blocks" value={totals.blocks.toLocaleString()} />
          </>
        );
      }}
    />
  );
}

export default Fees;
