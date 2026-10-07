import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LoadingTile from "src/components/v2/LoadingTile";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import { Bucket, Interval, bucketStart, feesSupported, useSeries } from "src/hooks/useFeesApi";
import { microalgosToAlgos } from "src/utils/common";
import SeriesChart from "./SeriesChart";

const DAY = 24 * 3600;

const INTERVALS: { value: Interval; name: string }[] = [
  { value: "hour", name: "Hourly" },
  { value: "day", name: "Daily" },
  { value: "week", name: "Weekly" },
  { value: "month", name: "Monthly" },
];

// interval: the default. No days: since genesis.
const RANGES: { value: string; name: string; days?: number; interval: Interval }[] = [
  { value: "24h", name: "24H", days: 1, interval: "hour" },
  { value: "7d", name: "7D", days: 7, interval: "hour" },
  { value: "30d", name: "30D", days: 30, interval: "day" },
  { value: "90d", name: "90D", days: 90, interval: "day" },
  { value: "1y", name: "1Y", days: 365, interval: "week" },
  { value: "all", name: "All", interval: "month" },
];
const DEFAULT_RANGE = RANGES[2];

const APPROX_SECONDS: Record<Interval, number> = { hour: 3600, day: DAY, week: 7 * DAY, month: 30.44 * DAY };
// The longest span each interval is offered for: daily up to 2Y (leap day included), weekly at finest beyond.
const MAX_SPAN: Record<Interval, number> = { hour: 125 * DAY, day: 731 * DAY, week: Infinity, month: Infinity };

/** Intervals giving at least 2 bars and within their max span, finest first. */
function intervalsFor(span: number): Interval[] {
  const fit = INTERVALS.map((i) => i.value).filter((i) => span / APPROX_SECONDS[i] >= 2 && span <= MAX_SPAN[i]);
  return fit.length ? fit : ["hour"];
}

const rangeSpan = (r: (typeof RANGES)[number]) => (r.days ?? Infinity) * DAY;

// "2026-09-07" at midnight, else "2026-09-07 14:00".
function formatTs(ts: number): string {
  const iso = new Date(ts * 1000).toISOString();
  return iso.slice(11, 16) === "00:00" ? iso.slice(0, 10) : iso.slice(0, 16).replace("T", " ");
}

const feesInAlgo = (b: Bucket) => microalgosToAlgos(b.fees);
const formatAlgo = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-lg text-primary">{value}</div>
    </div>
  );
}

function Fees(): JSX.Element {
  useTitle("Fees");
  const [params, setParams] = useSearchParams();
  const range = RANGES.find((r) => r.value === params.get("range")) ?? DEFAULT_RANGE;
  // A drag-zoomed [start, end) overrides the range preset.
  const zoomStart = Number(params.get("start"));
  const zoomEnd = Number(params.get("end"));
  const zoom = zoomStart > 0 && zoomEnd > zoomStart ? { start: zoomStart, end: zoomEnd } : null;
  const intervals = intervalsFor(zoom ? zoom.end - zoom.start : rangeSpan(range));
  // A zoom defaults to the finest interval that keeps it to 1000 bars.
  const interval =
    intervals.find((i) => i === params.get("interval")) ??
    (zoom
      ? intervals.find((i) => (zoom.end - zoom.start) / APPROX_SECONDS[i] <= 1000) ?? intervals[intervals.length - 1]
      : range.interval);
  // Interval-aligned, so the first bucket is whole and the query key holds for a whole bucket.
  const start = zoom
    ? zoom.start
    : range.days
      ? bucketStart(interval, Math.floor(Date.now() / 1000) - range.days * DAY)
      : undefined;
  const { data, isPlaceholderData, error } = useSeries(interval, start, zoom?.end);

  const totals = useMemo(() => {
    const t = { fees: 0, txns: 0, blocks: 0 };
    for (const b of data?.buckets ?? []) {
      t.fees += b.fees;
      t.txns += b.txns;
      t.blocks += b.blocks;
    }
    return t;
  }, [data]);

  // Tabs replace the history entry; a zoom pushes one, so Back undoes it.
  const select = (r: string, i: string) => setParams({ range: r, interval: i }, { replace: true });
  const selectInterval = (i: string) =>
    setParams({ ...Object.fromEntries(params), interval: i }, { replace: true });
  const zoomTo = (s: number, e: number) => setParams({ range: range.value, start: String(s), end: String(e) });
  const resetZoom = () => setParams({ range: range.value }, { replace: true });

  if (!feesSupported) return <div className="mt-6 text-muted-foreground">Network not supported</div>;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 border-b border-primary">
        <div className="pb-2 text-xl text-primary">Fees</div>
        <div className="flex flex-wrap gap-x-6 max-w-full">
          <TabsUnderline
            listClassName="h-9 border-b-0"
            value={zoom ? "" : range.value}
            onValueChange={(v) => {
              const next = RANGES.find((r) => r.value === v)!;
              select(v, intervalsFor(rangeSpan(next)).includes(interval) ? interval : next.interval);
            }}
            tabs={RANGES}
          />
          <TabsUnderline
            listClassName="h-9 border-b-0"
            value={interval}
            onValueChange={selectInterval}
            tabs={INTERVALS.filter((i) => intervals.includes(i.value))}
          />
        </div>
      </div>

      <div className="-mt-3 text-sm text-muted-foreground">
        {zoom ? (
          <>
            Zoomed to {formatTs(zoom.start)} – {formatTs(zoom.end)} UTC ·{" "}
            <button type="button" className="text-primary hover:underline" onClick={resetZoom}>
              Reset zoom
            </button>
          </>
        ) : (
          "Drag across the chart to zoom in."
        )}
      </div>

      {error ? (
        <div className="text-muted-foreground">Could not load fees: {String(error)}</div>
      ) : !data ? (
        <LoadingTile />
      ) : (
        // The previous view stays mounted, dimmed, while the next one loads.
        <div className={`flex flex-col gap-6 transition-opacity ${isPlaceholderData ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total fees" value={`${formatAlgo(microalgosToAlgos(totals.fees))} ALGO`} />
            <Stat label="Transactions" value={totals.txns.toLocaleString()} />
            <Stat
              label="Avg fee per txn"
              value={totals.txns ? `${(microalgosToAlgos(totals.fees) / totals.txns).toFixed(6)} ALGO` : "-"}
            />
            <Stat label="Blocks" value={totals.blocks.toLocaleString()} />
          </div>
          <SeriesChart
            buckets={data.buckets}
            interval={data.interval}
            start={data.start}
            end={data.end}
            y={feesInAlgo}
            format={formatAlgo}
            label="Fees (ALGO)"
            onZoom={zoomTo}
          />
        </div>
      )}
    </div>
  );
}

export default Fees;
