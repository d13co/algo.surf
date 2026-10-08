import { Bucket } from "src/hooks/useFeesApi";
import { microalgosToAlgos } from "src/utils/common";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import SeriesPage, { Stat, Toggle, formatSig } from "./SeriesPage";

// ponytail: a fixed snapshot of the price, applied to all history, until there's a price feed.
const USD_PER_ALGO = 0.13;

const feesInAlgo = (b: Bucket) => microalgosToAlgos(b.fees);
const feesInUsd = (b: Bucket) => microalgosToAlgos(b.fees) * USD_PER_ALGO;
const formatUsd = (v: number, max: number) => `$${formatSig(v, max)}`;

function Fees(): JSX.Element {
  const [usd, setUsd] = usePersistenBooleanState("fees.usd", false);
  const format = usd ? formatUsd : formatSig;

  return (
    <SeriesPage
      title="Fees"
      y={usd ? feesInUsd : feesInAlgo}
      format={format}
      label={usd ? "Fees (USD)" : "Fees (ALGO)"}
      settings={
        <Toggle checked={usd} onChange={setUsd}>
          USD at {USD_PER_ALGO} per ALGO
        </Toggle>
      }
      note={
        usd && (
          <div className="text-xs text-muted">
            USD at {USD_PER_ALGO} per ALGO: a current price snapshot applied to all of history, not the price at the
            time.
          </div>
        )
      }
      stats={(totals) => {
        const algos = microalgosToAlgos(totals.fees);
        const total = usd ? algos * USD_PER_ALGO : algos;
        return (
          <>
            <Stat label="Total fees" value={format(total, total) + (usd ? "" : " ALGO")} />
            <Stat label="Transactions" value={totals.txns.toLocaleString()} />
            <Stat
              label="Avg fee per txn"
              value={
                !totals.txns
                  ? "-"
                  : usd
                    ? `$${(total / totals.txns).toFixed(6)}`
                    : `${(total / totals.txns).toFixed(6)} ALGO`
              }
            />
            <Stat label="Blocks" value={totals.blocks.toLocaleString()} />
          </>
        );
      }}
    />
  );
}

export default Fees;
