import { useEffect, useMemo, useRef } from "react";
import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/charts/react";
import { Bucket, Interval, bucketEnd } from "src/hooks/useFeesApi";

interface SeriesChartProps {
  buckets: readonly Bucket[];
  interval: Interval;
  /** The queried range in unix seconds; buckets it cuts are drawn as partial. */
  start?: number;
  end?: number;
  /** The plotted value of a bucket, e.g. fees in ALGO or tps. Keep its identity stable. */
  y: (b: Bucket) => number;
  format: (v: number) => string;
  label: string;
  /** Called with [start, end) in unix seconds, covering the whole buckets dragged across. */
  onZoom?: (start: number, end: number) => void;
}

// UTC, cut to the bucket's precision: "2026-10-07 14:00", "2026-10-07", "2026-10".
function formatBucket(interval: Interval, date: Date): string {
  const iso = date.toISOString();
  if (interval === "hour") return iso.slice(0, 16).replace("T", " ");
  if (interval === "month") return iso.slice(0, 7);
  return iso.slice(0, 10);
}

function formatTick(interval: Interval, date: Date): string {
  return interval === "hour" ? formatBucket(interval, date).slice(5) : formatBucket(interval, date);
}

/**
 * One bar per bucket. Partial buckets (in progress, or cut by the range) are drawn hollow so their
 * smaller value doesn't read as a dip. Dragging across bars calls onZoom.
 */
function SeriesChart({ buckets, interval, start, end, y, format, label, onZoom }: SeriesChartProps): JSX.Element {
  const rows = useMemo(() => {
    const cut = Math.min(end ?? Infinity, Date.now() / 1000);
    return buckets.map((b) => ({
      ts: b.ts,
      date: new Date(b.ts * 1000),
      value: y(b),
      partial: b.ts < (start ?? 0) || bucketEnd(interval, b.ts) > cut,
    }));
  }, [buckets, interval, start, end, y]);

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(rows, {
            x: "date",
            y: "value",
            fill: (d) => (d.partial ? "var(--color-primary-dark)" : "var(--color-primary)"),
            stroke: (d) => (d.partial ? "var(--color-primary)" : "none"),
            strokeDasharray: (d) => (d.partial ? "3 2" : "none"),
            radius: { end: 4 },
          }),
        ],
        scales: {
          x: {
            scale: () => scaleBand().padding(0.2),
            axis: { ticks: { size: 0, format: (d) => formatTick(interval, d) } },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label, ticks: { format } },
          },
        },
        // Any pointer x resolves to the bucket below it: easy hover on thin bars, and drag-to-zoom
        // reads its endpoints from focus.
        focus: "nearest-x",
        maxFocusDistance: Number.POSITIVE_INFINITY,
        tooltip: {
          use: tooltip,
          sticky: false, // a click would otherwise pin the tooltip at the end of every drag
          content: ([p]) => ({
            title: formatBucket(interval, p.datum.date) + (interval === "hour" ? " UTC" : ""),
            rows: [
              { label, value: format(p.datum.value) },
              ...(p.datum.partial ? [{ label: "Bucket", value: "partial" }] : []),
            ],
          }),
        },
      }),
    [rows, interval, format, label],
  );

  // Drag to zoom: endpoints are the focused buckets at press and release. The drag runs outside
  // React and paints the overlay directly: a render per pointermove would also update the chart.
  const wrapper = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const focused = useRef<(typeof rows)[number] | null>(null);
  useEffect(() => {
    focused.current = null; // a bucket of the previous data
  }, [rows]);

  const onPointerDown = (e: React.PointerEvent) => {
    const from = focused.current;
    // Touch keeps scrolling the page; zoom is mouse and pen only.
    if (!onZoom || e.pointerType === "touch" || e.button !== 0 || !from) return;
    const rect = wrapper.current!.getBoundingClientRect();
    const box = overlay.current!.style;
    const toX = (clientX: number) => Math.max(0, Math.min(rect.width, clientX - rect.left));
    const x0 = toX(e.clientX);
    let x1 = x0;
    const move = (ev: PointerEvent) => {
      x1 = toX(ev.clientX);
      box.left = `${Math.min(x0, x1)}px`;
      box.width = `${Math.abs(x1 - x0)}px`;
      box.display = "block";
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      box.display = "";
      const to = focused.current;
      if (ev.type === "pointercancel" || !to || Math.abs(x1 - x0) < 5) return; // a click, not a drag
      const lo = Math.min(from.ts, to.ts);
      const hi = Math.max(from.ts, to.ts);
      if (lo === hi && interval === "hour") return; // no finer interval to zoom into
      onZoom(Math.max(lo, start ?? lo), Math.min(bucketEnd(interval, hi), end ?? Infinity));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      ref={wrapper}
      onPointerDown={onPointerDown}
      className={`relative select-none text-muted-foreground ${onZoom ? "cursor-crosshair" : ""} [--ts-chart-tooltip-background:#000] [--ts-chart-tooltip-color:#fff] [--ts-chart-tooltip-border:1px_solid_var(--color-border)]`}
    >
      <Chart
        definition={definition}
        height={320}
        ariaLabel={`${label} per ${interval}`}
        onFocusChange={(p) => {
          if (p) focused.current = p.datum;
        }}
      />
      <div
        ref={overlay}
        className="absolute top-0 bottom-0 z-10 hidden pointer-events-none bg-primary/20 border-x border-primary"
      />
    </div>
  );
}

export default SeriesChart;
