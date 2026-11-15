import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import dateFormat from "dateformat";
import { bucketStart, useSeries } from "src/hooks/useFees";
import { roundAsOfTime, seedFromQueryCache } from "src/utils/dateToRound";
import { surfIdxSupported } from "src/utils/surfIdx";
import { cn } from "src/lib/utils";

const HOUR = 3600;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** UTC "Thu 14" for a day's tick. */
const dayLabel = (ts: number) => dateFormat(new Date(ts * 1000), "UTC:ddd d");
const markerLabel = (ts: number) => dateFormat(new Date(ts * 1000), "UTC:d mmm HH:MM");

/**
 * A week of hourly TPS from surf idx with a marker, to travel by: live, the last 7 days up to now;
 * at block `round` (made at `roundTs`), the 7 days around it, or the last 7 when it is closer to
 * now than half a week. Picking a time (click, drag, or arrow keys on the slider) opens the
 * homepage at the last round at or before it.
 */
export default function HomeTimeline({ round, roundTs }: { round?: number; roundTs?: number }): JSX.Element | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = Math.floor(Date.now() / 1000);
  const atRound = round !== undefined;

  // The week shown, hour-aligned so the query key holds for an hour. end undefined: up to now, polled live.
  const view = useMemo(() => {
    if (atRound && roundTs !== undefined && now - roundTs > WEEK / 2) {
      const start = bucketStart("hour", roundTs - WEEK / 2);
      return { start, end: start + WEEK };
    }
    return { start: bucketStart("hour", now - WEEK), end: undefined };
    // The live window slides with the hour, not the second.
  }, [atRound, roundTs, Math.floor(now / HOUR)]);
  const viewEnd = view.end ?? now;
  const live = !atRound;
  const { data, error } = useSeries("hour", view.start, view.end, live, !atRound || roundTs !== undefined);
  const buckets = data?.start === view.start ? data.buckets : undefined;

  const [preview, setPreview] = useState<number>();
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string>();
  const abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);
  // A new round or view drops a time picked but not yet travelled to.
  useEffect(() => setPreview(undefined), [round, view.start]);

  if (!surfIdxSupported) return null;

  const markerTs = preview ?? (atRound ? roundTs : viewEnd);
  const frac = markerTs === undefined ? undefined : Math.min(1, Math.max(0, (markerTs - view.start) / (viewEnd - view.start)));
  const max = Math.max(0, ...(buckets ?? []).map((b) => b.tps));
  const markIndex = markerTs === undefined ? -1 : Math.floor((markerTs - view.start) / HOUR);

  const days: { ts: number; left: number }[] = [];
  for (let d = Math.ceil(view.start / DAY) * DAY; d <= viewEnd; d += DAY) {
    const left = ((d - view.start) / (viewEnd - view.start)) * 100;
    if (left > 4 && left < 96) days.push({ ts: d, left });
  }

  const travel = async (ts: number) => {
    abort.current?.abort();
    const controller = (abort.current = new AbortController());
    setFinding(true);
    setFindError(undefined);
    try {
      // The last moments of a live view are now: the live page.
      if (!atRound && ts >= now - HOUR / 2) {
        setPreview(undefined);
        return;
      }
      seedFromQueryCache(queryClient);
      const r = await roundAsOfTime(ts, controller.signal);
      if (!controller.signal.aborted) navigate(`/?round=${r}`);
    } catch (err) {
      if (!controller.signal.aborted) setFindError((err as Error).message || "Could not find the round");
    } finally {
      if (abort.current === controller) setFinding(false);
    }
  };

  return (
    <section aria-label="Timeline" className="flex flex-col gap-2">
      <div className="flex flex-wrap justify-between gap-x-3 text-[13px] text-muted-foreground">
        <span>
          Transactions per second, hourly · {atRound ? `the week around block ${round.toLocaleString()}` : "last 7 days"}
        </span>
        <span className="flex items-center gap-1.5">
          {finding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {findError ?? (error && !buckets ? `Could not load: ${String(error)}` : "Click or drag to travel")}
        </span>
      </div>
      <div className="relative mt-6 h-[92px] rounded-lg bg-background-muted px-2 pt-2">
        <div className="absolute inset-x-2 bottom-0 top-2 flex items-end gap-px" aria-hidden>
          {(buckets ?? []).map((b, i) => (
            <div
              key={b.ts}
              className={cn("flex-1 rounded-t-sm", i === markIndex ? "bg-foreground" : i < markIndex ? "bg-primary" : "bg-primary/30")}
              style={{ height: `${max ? Math.max(3, (b.tps / max) * 100) : 0}%` }}
              title={`${dateFormat(new Date(b.ts * 1000), "UTC:ddd d mmm HH:00")} UTC · ${b.tps.toFixed(1)} TPS`}
            />
          ))}
        </div>
        {frac !== undefined ? (
          <div aria-hidden className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-foreground" style={{ left: `calc(0.5rem + (100% - 1rem) * ${frac})` }}>
            <div
              className={cn(
                "absolute -top-6 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-xs font-bold text-background",
                frac > 0.85 ? "right-0" : frac < 0.15 ? "left-0" : "left-1/2 -translate-x-1/2",
              )}
            >
              {preview === undefined && !atRound ? "Now" : markerLabel(markerTs!)}
            </div>
          </div>
        ) : null}
        <input
          type="range"
          min={view.start}
          max={viewEnd}
          step={HOUR / 4}
          value={markerTs ?? viewEnd}
          aria-label={atRound ? `Travel within the week around block ${round.toLocaleString()}` : "Travel within the last 7 days"}
          aria-valuetext={markerTs !== undefined ? `${markerLabel(markerTs)} UTC` : undefined}
          onChange={(e) => setPreview(Number(e.target.value))}
          onPointerUp={(e) => travel(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
              travel(Number((e.target as HTMLInputElement).value));
            }
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="relative h-4 text-xs text-muted-foreground" aria-hidden>
        {days.map((d) => (
          <span key={d.ts} className="absolute -translate-x-1/2" style={{ left: `${d.left}%` }}>
            {dayLabel(d.ts)}
          </span>
        ))}
      </div>
    </section>
  );
}
