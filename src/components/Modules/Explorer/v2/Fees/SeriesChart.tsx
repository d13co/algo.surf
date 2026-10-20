import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { barY, defineChart } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { Chart } from "@tanstack/charts/react";
import { Bucket, Interval, bucketEnd } from "src/hooks/useFees";
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

// The round of a block, else the bucket start in UTC: "10-07 14:03", "2026-10-07", "2026-10".
function formatTick(interval: Interval, x: number): string {
  if (interval === "block") return String(x);
  if (interval === "minute" || interval === "hour") return isoAt(x).slice(5, 16).replace("T", " ");
  return isoAt(x).slice(0, interval === "month" ? 7 : 10);
}

/**
 * One bar per bucket. Partial buckets (in progress, or cut by the range) are drawn hollow so their
 * smaller value doesn't read as a dip. Clicking a bar or dragging across bars calls onZoom. On touch a
 * tap only shows the bar, and a horizontal drag zooms.
 */
function SeriesChart({
  buckets,
  interval,
  start,
  end,
  y,
  format,
  label,
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
        // reads its endpoints from focus. The readout below the plot shows it, not a tooltip.
        focus: "nearest-x",
        maxFocusDistance: Number.POSITIVE_INFINITY,
      }),
    [rows, interval, label, format],
  );

  // The readout and the drag are written to the DOM directly: a render per pointermove would also
  // update the chart. data-dragging on the wrapper shows the drag overlay.
  const wrapper = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const readTitle = useRef<HTMLSpanElement>(null);
  const readValue = useRef<HTMLSpanElement>(null);
  const focused = useRef<Row | null>(null);
  // Whether the chart has a bar under the pointer. focused keeps the last one after the pointer leaves.
  const pointing = useRef(false);
  // The bar the readout describes, if any.
  const described = useRef<Row | null>(null);
  const dragging = useRef(false);

  const readout = (title: string, value = "") => {
    readTitle.current!.textContent = title;
    readValue.current!.textContent = value;
  };
  const describe = (r: Row | null) => {
    described.current = r;
    return r
      ? readout(
          (interval === "block" ? `Round ${r.x} · ` : "") + formatSpan(r.ts, r.end) + (r.partial ? " (partial)" : ""),
          format(r.value),
        )
      : readout("");
  };

  // New rows, e.g. a live update: the focused and described bars become their new rows, so a live bar's readout follows
  // its value. A bar no longer there (another view) is dropped.
  useEffect(() => {
    const current = (r: Row | null) => (r && rows.find((n) => n.x === r.x)) ?? null;
    focused.current = current(focused.current);
    if (!dragging.current) describe(current(described.current));
  }, [rows]);

  // A touch tap only shows the bar, through the chart's own click. Set on a touch press to the bar shown before it, so
  // a second tap on the same block opens it; undefined once the press becomes a drag, or with no touch press.
  const tapFrom = useRef<Row | null | undefined>(undefined);
  // The press being followed, and how to end it. Other fingers, or a mouse during a touch drag, neither start another
  // nor move this one.
  const active = useRef<{ id: number; stop: () => void } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || (active.current && active.current.id !== e.pointerId)) return;
    // The same pointer pressed again: its release was lost, e.g. outside the window.
    active.current?.stop();
    // A touch press has no focus yet: the chart focuses on move or click. The drag takes its start from the first move.
    const touch = e.pointerType === "touch";
    let from = touch ? null : focused.current;
    tapFrom.current = touch ? described.current : undefined;
    if (!onZoom || e.button !== 0 || (!touch && !from)) return;
    const host = wrapper.current!;
    const rect = host.getBoundingClientRect();
    const box = overlay.current!.style;
    const toX = (clientX: number) => Math.max(0, Math.min(rect.width, clientX - rect.left));
    const x0 = toX(e.clientX);
    let x1 = x0;
    // Under this a press is a click or tap, not a drag. A finger wobbles more than a mouse.
    const slop = touch ? 12 : 5;
    const dragged = () => Math.abs(x1 - x0) >= slop;
    // Whether a touch press has been a drag: once past the slop, coming back doesn't make it a tap.
    let started = false;
    // The whole buckets from..to, cut to the shown range: what releasing there zooms to.
    const selection = (lo: Row, hi: Row): [number, number] => {
      if (lo.ts > hi.ts) [lo, hi] = [hi, lo];
      return [Math.max(lo.ts, start ?? lo.ts), Math.min(hi.end, end ?? Infinity)];
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x1 = toX(ev.clientX);
      // The chart's own pointermove has already focused the bar under the pointer.
      from ??= focused.current;
      if (!from) return;
      if (dragged()) {
        started = true;
        tapFrom.current = undefined;
      }
      // Touch shows a selection only where releasing would zoom: once a drag, and off the bar it started on.
      if (touch && (!started || focused.current?.x === from.x)) {
        if (dragging.current) {
          delete host.dataset.dragging;
          dragging.current = false;
          describe(focused.current);
        }
        return;
      }
      box.left = `${Math.min(x0, x1)}px`;
      box.width = `${Math.abs(x1 - x0)}px`;
      host.dataset.dragging = "";
      dragging.current = true;
      if (focused.current) readout(`Zoom to ${formatSpan(...selection(from, focused.current))}`);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const wasDragging = dragging.current;
      stop();
      if (wasDragging || !touch) describe(pointing.current ? focused.current : null);
      if (ev.type === "pointercancel" || !from) return;
      // A tap, or a drag back onto the bar it started on, is left to the chart's click and onClick below.
      if (touch && (!started || !focused.current || focused.current.x === from.x)) return;
      // A click zooms into the bar pressed, a drag across the bars dragged over.
      const to = touch || dragged() ? focused.current : from;
      if (!to) return;
      // Rows are replaced on each update, e.g. live: the same bar is the same x.
      if (to.x === from.x && interval === "block") {
        // No finer interval to zoom into: open the block, in a new tab with Ctrl or Cmd as a link would.
        if (ev.ctrlKey || ev.metaKey) window.open(`/block/${to.x}`, "_blank");
        else navigate(`/block/${to.x}`);
        return;
      }
      onZoom(...selection(from, to));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      active.current = null;
      delete host.dataset.dragging;
      dragging.current = false;
    };
    active.current = { id: e.pointerId, stop };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // After the chart's click has focused the tapped bar: a second tap on the block already shown opens it.
  const onClick = () => {
    const before = tapFrom.current;
    tapFrom.current = undefined;
    const tapped = focused.current;
    if (onZoom && interval === "block" && before && tapped && before.x === tapped.x) navigate(`/block/${tapped.x}`);
  };

  return (
    <div>
      <div
        ref={wrapper}
        onPointerDown={onPointerDown}
        onClick={onClick}
        // Touch: the page keeps vertical scrolling and pinch zoom, and a horizontal drag selects.
        className={`group relative select-none text-muted-foreground ${onZoom ? `touch-pan-y touch-pinch-zoom ${interval === "block" ? "cursor-pointer" : "cursor-crosshair"}` : ""}`}
      >
        <Chart
          definition={definition}
          height={320}
          ariaLabel={`${label} by ${interval}`}
          onFocusChange={(p) => {
            pointing.current = !!p;
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
