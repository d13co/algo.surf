import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart } from "@tanstack/charts/react";
import { Bucket, Interval, bucketEnd } from "src/hooks/useFeesApi";
import { formatSpan, isoAt } from "./periods";

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
  /** Times in local time instead of UTC. Days and longer stay UTC days: the API buckets by them. */
  local?: boolean;
  /** Called with [start, end) in unix seconds, covering the whole buckets clicked or dragged across. A block's click
   * opens its page instead. */
  onZoom?: (start: number, end: number) => void;
}

interface Row {
  /** The band: a block's round, else the bucket start. Blocks can share a second. */
  x: number;
  ts: number;
  /** The bucket's end, exclusive. */
  end: number;
  value: number;
  partial: boolean;
}

// The round of a block, else the bucket start: "10-07 14:03" (local time when local), "2026-10-07", "2026-10" (UTC).
function formatTick(interval: Interval, x: number, local: boolean): string {
  if (interval === "block") return String(x);
  if (interval === "minute" || interval === "hour") return isoAt(x, local).slice(5, 16).replace("T", " ");
  return isoAt(x).slice(0, interval === "month" ? 7 : 10);
}

/**
 * One bar per bucket. Partial buckets (in progress, or cut by the range) are drawn hollow so their
 * smaller value doesn't read as a dip. Clicking a bar or dragging across bars calls onZoom.
 */
function SeriesChart({
  buckets,
  interval,
  start,
  end,
  y,
  format,
  label,
  local = false,
  onZoom,
}: SeriesChartProps): JSX.Element {
  const navigate = useNavigate();
  const rows = useMemo((): Row[] => {
    const cut = Math.min(end ?? Infinity, Date.now() / 1000);
    return buckets.map((b) => {
      const to = bucketEnd(interval, b.ts);
      return { x: b.rnd ?? b.ts, ts: b.ts, end: to, value: y(b), partial: b.ts < (start ?? 0) || to > cut };
    });
  }, [buckets, interval, start, end, y]);

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(rows, {
            x: "x",
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
            axis: { ticks: { size: 0, format: (d) => formatTick(interval, d, local) } },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { label, ticks: { format } },
          },
        },
        // Any pointer x resolves to the bucket below it: easy hover on thin bars, and drag-to-zoom
        // reads its endpoints from focus. The readout above the plot shows it, not a tooltip.
        focus: "nearest-x",
        maxFocusDistance: Number.POSITIVE_INFINITY,
      }),
    [rows, interval, label, format, local],
  );

  // The readout and the drag are written to the DOM directly: a render per pointermove would also
  // update the chart. data-dragging on the wrapper shows the drag overlay.
  const wrapper = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const readTitle = useRef<HTMLSpanElement>(null);
  const readValue = useRef<HTMLSpanElement>(null);
  const focused = useRef<Row | null>(null);
  const dragging = useRef(false);

  const readout = (title: string, value = "") => {
    readTitle.current!.textContent = title;
    readValue.current!.textContent = value;
  };
  const describe = (r: Row | null) =>
    r
      ? readout(
          (interval === "block" ? `Round ${r.x} · ` : "") + formatSpan(r.ts, r.end, local) + (r.partial ? " (partial)" : ""),
          format(r.value),
        )
      : readout("");

  useEffect(() => {
    focused.current = null; // a bucket of the previous data
    readout("");
  }, [rows]);

  const onPointerDown = (e: React.PointerEvent) => {
    const from = focused.current;
    // Touch keeps scrolling the page; zoom is mouse and pen only.
    if (!onZoom || e.pointerType === "touch" || e.button !== 0 || !from) return;
    const host = wrapper.current!;
    const rect = host.getBoundingClientRect();
    const box = overlay.current!.style;
    const toX = (clientX: number) => Math.max(0, Math.min(rect.width, clientX - rect.left));
    const x0 = toX(e.clientX);
    let x1 = x0;
    // The whole buckets from..to, cut to the shown range: what releasing there zooms to.
    const selection = (to: Row): [number, number] => {
      const [lo, hi] = from.ts < to.ts ? [from, to] : [to, from];
      return [Math.max(lo.ts, start ?? lo.ts), Math.min(hi.end, end ?? Infinity)];
    };
    const move = (ev: PointerEvent) => {
      x1 = toX(ev.clientX);
      box.left = `${Math.min(x0, x1)}px`;
      box.width = `${Math.abs(x1 - x0)}px`;
      host.dataset.dragging = "";
      dragging.current = true;
      if (focused.current) readout(`Zoom to ${formatSpan(...selection(focused.current), local)}`);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      delete host.dataset.dragging;
      dragging.current = false;
      describe(focused.current);
      // A click zooms into the bar pressed, a drag across the bars dragged over.
      const to = Math.abs(x1 - x0) < 5 ? from : focused.current;
      if (ev.type === "pointercancel" || !to) return;
      if (to === from && interval === "block") {
        // No finer interval to zoom into: open the block, in a new tab with Ctrl or Cmd as a link would.
        if (ev.ctrlKey || ev.metaKey) window.open(`/block/${to.x}`, "_blank");
        else navigate(`/block/${to.x}`);
        return;
      }
      onZoom(...selection(to));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div>
      <div
        ref={wrapper}
        onPointerDown={onPointerDown}
        className={`group relative select-none text-muted-foreground ${onZoom ? (interval === "block" ? "cursor-pointer" : "cursor-crosshair") : ""}`}
      >
        <Chart
          definition={definition}
          height={320}
          ariaLabel={`${label} per ${interval}`}
          onFocusChange={(p) => {
            if (p) focused.current = p.datum;
            if (!dragging.current) describe(p?.datum ?? null);
          }}
        />
        <div
          ref={overlay}
          className="absolute top-0 bottom-0 z-10 hidden group-data-[dragging]:block pointer-events-none bg-primary/20 border-x border-primary"
        />
      </div>
      {/* The focused bar, or the zoom a drag would make. Pinned below the plot so it neither moves nor covers bars. */}
      <div role="status" className="mt-4 flex h-6 items-baseline justify-center gap-3 text-sm">
        <span ref={readTitle} />
        <span ref={readValue} className="text-primary" />
      </div>
    </div>
  );
}

export default SeriesChart;
