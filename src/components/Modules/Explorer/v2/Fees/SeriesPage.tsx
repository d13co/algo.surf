import { ReactNode, useMemo } from "react";
import { Settings } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import LoadingTile from "src/components/v2/LoadingTile";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";
import { Bucket, Interval, bucketEnd, bucketStart, useSeries } from "src/hooks/useFees";
import { surfIdxSupported } from "src/utils/surfIdx";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import PeriodMenu from "./PeriodMenu";
import SeriesChart from "./SeriesChart";
import { GENESIS, formatSpan, parsePeriod } from "./periods";

const DAY = 24 * 3600;

// Finest first.
const INTERVALS: { value: Interval; name: string }[] = [
  { value: "block", name: "Per block" },
  { value: "minute", name: "Minutely" },
  { value: "hour", name: "Hourly" },
  { value: "day", name: "Daily" },
  { value: "week", name: "Weekly" },
  { value: "month", name: "Monthly" },
];

// Rolling ranges. No days: since genesis. label: for "Showing …".
const RANGES: { value: string; name: string; label: string; days?: number }[] = [
  { value: "24h", name: "24H", label: "past 24 hours", days: 1 },
  { value: "7d", name: "7D", label: "past 7 days", days: 7 },
  { value: "30d", name: "30D", label: "past 30 days", days: 30 },
  { value: "90d", name: "90D", label: "past 90 days", days: 90 },
  { value: "1y", name: "1Y", label: "past year", days: 365 },
  { value: "all", name: "All", label: "all time" },
];
const DEFAULT_RANGE = RANGES[2];

// ponytail: block is mainnet's ~2.8s round time; older history ran ~4.4s, so those views have fewer bars than planned.
const APPROX_SECONDS: Record<Interval, number> = {
  block: 2.8,
  minute: 60,
  hour: 3600,
  day: DAY,
  week: 7 * DAY,
  month: 30.44 * DAY,
};
// The most bars daily is offered for: 2Y, leap day included. Block, minute and weekly get the same count (~34min, ~12h,
// ~14Y), hourly 32 days, monthly beyond.
const MAX_BARS = 731;
// The longest span each interval is offered for.
const MAX_SPAN: Record<Interval, number> = {
  block: MAX_BARS * APPROX_SECONDS.block,
  minute: MAX_BARS * APPROX_SECONDS.minute,
  hour: 32 * DAY,
  day: MAX_BARS * APPROX_SECONDS.day,
  week: MAX_BARS * APPROX_SECONDS.week,
  month: Infinity,
};

/** Intervals giving at least 2 bars and within their max span, finest first. Blocks for a span too short for any. */
function intervalsFor(span: number): Interval[] {
  const fit = INTERVALS.map((i) => i.value).filter((i) => span / APPROX_SECONDS[i] >= 2 && span <= MAX_SPAN[i]);
  return fit.length ? fit : ["block"];
}

/** A range value's span in seconds: a period's up to its end or now, a rolling range's days, All's since genesis. */
function spanOf(value: string, now: number): number {
  const period = parsePeriod(value, now);
  if (period) return (period.end ?? now) - period.start;
  const days = (RANGES.find((r) => r.value === value) ?? DEFAULT_RANGE).days;
  return days ? days * DAY : now - GENESIS;
}

/** v with 3 significant digits of max, or all its whole digits: a block's fees are hundredths of an ALGO, a year's
 * millions. Values formatted against the same max get the same decimals, e.g. the ticks of an axis. */
export function formatSig(v: number, max: number): string {
  const decimals = max > 0 ? Math.max(0, 2 - Math.floor(Math.log10(max))) : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** A settings menu checkbox. Toggling keeps the menu open. */
export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <DropdownMenuCheckboxItem
      className="cursor-pointer focus:bg-primary/10 focus:text-primary"
      checked={checked}
      onCheckedChange={onChange}
      onSelect={(e) => e.preventDefault()}
    >
      {children}
    </DropdownMenuCheckboxItem>
  );
}

export function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-lg text-primary">{value}</div>
    </div>
  );
}

/** The shown view: its buckets and the params they were fetched with. */
type View = NonNullable<ReturnType<typeof useSeries>["data"]>;

/** Sums over a view's buckets. */
interface Totals {
  fees: number;
  txns: number;
  blocks: number;
}

interface SeriesPageProps {
  title: string;
  /** The plotted value of a bucket. Keep its identity stable. */
  y: (b: Bucket) => number;
  /** v formatted against the largest bar shown. Keep its identity stable. */
  format: (v: number, max: number) => string;
  /** The y axis label. */
  label: string;
  /** Settings menu items above Local time. */
  settings?: ReactNode;
  /** Under the "Showing …" line. */
  note?: ReactNode;
  /** The Stats below the chart. */
  stats: (totals: Totals, view: View) => ReactNode;
}

/** A surf idx series charted over a range, period or zoom, all in the URL. */
function SeriesPage({ title, y, format: formatValue, label, settings, note, stats }: SeriesPageProps): JSX.Element {
  useTitle(title);
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = usePersistenBooleanState("series.localTime", false);
  const now = Math.floor(Date.now() / 1000);
  // A calendar period, else a rolling range.
  const period = parsePeriod(params.get("range") ?? "", now);
  const range = RANGES.find((r) => r.value === params.get("range")) ?? DEFAULT_RANGE;
  const rangeValue = period?.value ?? range.value;
  // A drag-zoomed [start, end) overrides the range or period.
  const zoomStart = Number(params.get("start"));
  const zoomEnd = Number(params.get("end"));
  const zoom = zoomStart > 0 && zoomEnd > zoomStart ? { start: zoomStart, end: zoomEnd } : null;
  const span = zoom ? zoom.end - zoom.start : spanOf(rangeValue, now);
  const intervals = intervalsFor(span);
  // The finest interval keeping a zoom to 1000 bars, anything else to 200.
  const interval =
    intervals.find((i) => i === params.get("interval")) ??
    intervals.find((i) => span / APPROX_SECONDS[i] <= (zoom ? 1000 : 200)) ??
    intervals[intervals.length - 1];
  // A zoom or period has fixed bounds. A rolling range is interval-aligned, so the first bucket is whole and the
  // query key holds for a whole bucket.
  const bounds = zoom ?? period;
  const start = bounds ? bounds.start : range.days ? bucketStart(interval, now - range.days * DAY) : undefined;
  const { data, isPlaceholderData, error } = useSeries(interval, start, bounds?.end);

  const totals = useMemo(() => {
    const t = { fees: 0, txns: 0, blocks: 0 };
    for (const b of data?.buckets ?? []) {
      t.fees += b.fees;
      t.txns += b.txns;
      t.blocks += b.blocks;
    }
    return t;
  }, [data]);
  // Against the largest bar, for the axis and the readout.
  const format = useMemo(() => {
    const max = Math.max(0, ...(data?.buckets ?? []).map(y));
    return (v: number) => formatValue(v, max);
  }, [data, y, formatValue]);

  // Tabs and periods replace the history entry; a zoom pushes one, so Back undoes it. A picked interval carries over
  // where the new span offers it; a default one is worked out again.
  const select = (r: string) => {
    const keep = params.get("interval") === interval && intervalsFor(spanOf(r, now)).includes(interval);
    setParams(keep ? { range: r, interval } : { range: r }, { replace: true });
  };
  const selectInterval = (i: string) =>
    setParams({ ...Object.fromEntries(params), interval: i }, { replace: true });
  const zoomTo = (s: number, e: number) => setParams({ range: rangeValue, start: String(s), end: String(e) });
  const resetZoom = () => setParams({ range: rangeValue }, { replace: true });
  // 12.5% more on each side, out to whole buckets, no further than the buckets holding genesis and the tip.
  const zoomOut = (z: { start: number; end: number }) => {
    const pad = (z.end - z.start) / 8;
    const end = bucketEnd(interval, bucketStart(interval, Math.min(z.end + pad, now) - 1));
    zoomTo(bucketStart(interval, Math.max(z.start - pad, GENESIS)), end);
  };

  if (!surfIdxSupported) return <div className="mt-6 text-muted-foreground">Network not supported</div>;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 border-b border-primary">
        <div className="pb-2 text-xl text-primary">{title}</div>
        <div className="flex flex-wrap gap-x-6 max-w-full">
          <div className="flex max-w-full">
            {/* Manual: with a period or zoom shown no tab is selected, and tabbing onto one would select it. */}
            <TabsUnderline
              listClassName="h-9 border-b-0"
              activationMode="manual"
              value={zoom ? "" : rangeValue}
              onValueChange={select}
              tabs={RANGES}
            />
            <PeriodMenu period={zoom ? undefined : period} now={now} onSelect={select} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1.5 px-3 pt-1.5 pb-2 text-sm font-medium text-muted-foreground hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Settings className="size-4" />
              Settings
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background border-border text-primary">
              {settings}
              <Toggle checked={local} onChange={setLocal}>
                Local time
              </Toggle>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pulled toward the header above and the chart below. */}
      <div className="-mt-3 -mb-3 flex flex-col gap-1 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-x-6">
          <div>
            {zoom ? (
              <>
                Zoomed to {formatSpan(zoom.start, zoom.end, local)} ·{" "}
                <button type="button" className="text-primary hover:underline" onClick={() => zoomOut(zoom)}>
                  Zoom out
                </button>{" "}
                ·{" "}
                <button type="button" className="text-primary hover:underline" onClick={resetZoom}>
                  Reset zoom
                </button>
              </>
            ) : (
              <>
                {/* Calendar periods are UTC days whatever the time setting. */}
                Showing {period?.label ?? range.label}
                {local && period ? " (UTC)" : ""}.{" "}
                <span className="text-muted">Click a bar or drag across the chart to zoom in.</span>
              </>
            )}
          </div>
          <TabsUnderline
            listClassName="h-9 border-b-0"
            value={interval}
            onValueChange={selectInterval}
            tabs={INTERVALS.filter((i) => intervals.includes(i.value))}
          />
        </div>
        {note}
      </div>

      {error ? (
        <div className="text-muted-foreground">Could not load data: {String(error)}</div>
      ) : !data ? (
        <LoadingTile />
      ) : (
        // The previous view stays mounted, dimmed, while the next one loads.
        <div className={`flex flex-col gap-6 transition-opacity ${isPlaceholderData ? "opacity-50" : ""}`}>
          <SeriesChart
            buckets={data.buckets}
            interval={data.interval}
            start={data.start}
            end={data.end}
            y={y}
            format={format}
            label={label}
            local={local}
            onZoom={zoomTo}
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{stats(totals, data)}</div>
        </div>
      )}
    </div>
  );
}

export default SeriesPage;
