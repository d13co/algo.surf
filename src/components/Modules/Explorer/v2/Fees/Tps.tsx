import { Bucket } from "src/hooks/useFeesApi";
import SeriesPage, { Stat, formatSig } from "./SeriesPage";
import { GENESIS } from "./periods";

const tps = (b: Bucket) => b.tps;

function Tps(): JSX.Element {
  return (
    <SeriesPage
      title="TPS"
      y={tps}
      format={formatSig}
      label="Transactions per second"
      stats={(totals, view) => {
        // From genesis, which a period or zoom can start before, up to now: a view running to the tip has no blocks
        // past it.
        let seconds = Math.min(view.end ?? Infinity, Date.now() / 1000) - Math.max(view.start ?? 0, GENESIS);
        let txns = totals.txns;
        const [first, last] = [view.buckets[0], view.buckets[view.buckets.length - 1]];
        if (view.interval === "block" && first) {
          // As the API's block tps: each block's txns over the gap before it. A block zoom ends a second after its last
          // block, so its own span would read above the peak.
          seconds = last.ts - first.ts;
          txns -= first.txns;
        }
        const avg = seconds > 0 ? txns / seconds : 0;
        // A partial bucket's tps is over its whole length: it can understate the peak, never overstate it.
        const peak = Math.max(0, ...view.buckets.map(tps));
        return (
          <>
            <Stat label="Average TPS" value={formatSig(avg, avg)} />
            <Stat label={`Peak ${view.interval} TPS`} value={formatSig(peak, peak)} />
            <Stat label="Transactions" value={totals.txns.toLocaleString()} />
            <Stat label="Blocks" value={totals.blocks.toLocaleString()} />
          </>
        );
      }}
    />
  );
}

export default Tps;
