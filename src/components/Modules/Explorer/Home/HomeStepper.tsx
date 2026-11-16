import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLatestRound } from "@d13co/algo-metrics-react";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play } from "lucide-react";
import { useBlockHeader } from "src/hooks/useBlock";
import { BLOCK_TIME } from "src/packages/core-sdk/constants";
import { roundAsOfTime, seedFromQueryCache } from "src/utils/dateToRound";

const DAY = 24 * 3600;

const STEP =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-primary/40 bg-background-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground hover:border-primary disabled:opacity-50 disabled:pointer-events-none";

/**
 * Moves the homepage through time from block `round`: a day, a thousand or one block either way, a
 * typed round, or a replay one block per block time. Stepping replaces the history entry (Back
 * leaves time travel rather than undoing each step); a typed round pushes one. Past the latest
 * block, the page goes back to live.
 */
export default function HomeStepper({ round }: { round: number }): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const latestRaw = useLatestRound();
  const latest = latestRaw !== null ? Number(latestRaw) : undefined;
  const { data: header } = useBlockHeader(round);
  const [draft, setDraft] = useState<string>();
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);

  const go = (r: number, replace = true) => {
    setError(undefined);
    if (latest !== undefined && r > latest) {
      setPlaying(false);
      navigate("/");
      return;
    }
    navigate(`/?round=${Math.max(1, r)}`, { replace });
  };

  /** A step by hand (or a typed round) pauses a replay. */
  const move = (r: number, replace = true) => {
    setPlaying(false);
    go(r, replace);
  };

  // A replay steps one block per block time, and goes live at the tip. Any other move to a round (the
  // blocks' "Newer", the timeline, Back) pauses it.
  const replayNext = useRef<number>();
  useEffect(() => {
    if (!playing) return;
    if (replayNext.current !== undefined && round !== replayNext.current) {
      replayNext.current = undefined;
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => {
      replayNext.current = round + 1;
      go(round + 1);
    }, BLOCK_TIME * 1000);
    return () => clearTimeout(id);
    // `go` reads the latest round and navigate; re-arming on round is the step.
  }, [playing, round]);

  const byDay = async (days: number) => {
    const ts = header?.timestamp ? Number(header.timestamp) : undefined;
    if (ts === undefined) return;
    abort.current?.abort();
    const controller = (abort.current = new AbortController());
    setFinding(true);
    setError(undefined);
    try {
      seedFromQueryCache(queryClient);
      const r = await roundAsOfTime(ts + days * DAY, controller.signal);
      if (!controller.signal.aborted) move(r);
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message || "Could not find the round");
    } finally {
      if (abort.current === controller) setFinding(false);
    }
  };

  const input = draft ?? String(round);
  const onGo = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d+$/.test(input.trim())) return;
    setDraft(undefined);
    move(Number(input.trim()), false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Move through time">
        <button type="button" className={STEP} onClick={() => byDay(-1)} disabled={!header || finding}>
          −1 day
        </button>
        <button type="button" className={STEP} onClick={() => move(round - 1000)}>
          −1k
        </button>
        <button type="button" className={STEP} onClick={() => move(round - 1)} aria-label="Previous block">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <form onSubmit={onGo} className="flex items-center gap-1">
          <label htmlFor="home-round" className="sr-only">
            Block (round)
          </label>
          <input
            id="home-round"
            inputMode="numeric"
            value={input}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
            className="h-11 w-36 rounded-lg border border-primary bg-transparent px-3 text-center font-bold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="submit" className="min-h-11 px-3 text-sm font-bold text-primary hover:underline" disabled={!/^\d+$/.test(input.trim())}>
            Go
          </button>
        </form>
        <button type="button" className={STEP} onClick={() => move(round + 1)} aria-label="Next block">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" className={STEP} onClick={() => move(round + 1000)}>
          +1k
        </button>
        <button type="button" className={STEP} onClick={() => byDay(1)} disabled={!header || finding}>
          +1 day
        </button>
        {finding ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Finding the round" /> : null}
        <button
          type="button"
          onClick={() => {
            replayNext.current = undefined;
            setPlaying((p) => !p);
          }}
          aria-pressed={playing}
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-background transition-opacity hover:opacity-90"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause" : "Replay from here"}
        </button>
      </div>
      {error ? <div className="text-xs text-muted-foreground">{error}</div> : null}
    </div>
  );
}
