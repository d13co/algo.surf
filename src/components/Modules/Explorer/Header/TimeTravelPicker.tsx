import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import { Calendar } from "src/components/v2/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "src/components/v2/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "src/components/v2/ui/dropdown-menu";
import { cn } from "src/lib/utils";
import { useRound, withRound } from "src/hooks/useRound";
import { useBlockHeader } from "src/hooks/useBlock";
import { useTimeTravelSupport } from "src/hooks/useTimeTravel";
import { useNarrow } from "src/hooks/useNarrow";
import { roundAsOfTime, seedFromQueryCache } from "src/utils/dateToRound";

const LABEL = "text-xs font-normal text-muted-foreground";
const INTRO = "Rewind time to see this page as it was at any point in history";
const FIELD =
  "h-9 rounded-md border border-border bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary";
// Mainnet's first block; earlier days can't be picked.
const GENESIS_DAY = new Date(2019, 5, 11);

const pad = (n: number) => String(n).padStart(2, "0");
const hhmmss = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** What the viewer typed or picked, on the page (`loc`) they did it on. */
type Edits = { loc: string; round?: string; day?: Date; time?: string; month?: Date };

/**
 * "Travel to…": a header icon button that opens a picker for a round, or a
 * local date and time (turned into the last round at or before it). Either
 * opens this page at that round. Shown only with a time-travel node for this
 * network. With a `label`, the trigger is that text with the icon, as a link.
 * A dropdown from md up; a full-screen dialog on phones.
 */
export default function TimeTravelPicker({ className, label }: { className?: string; label?: string }): JSX.Element | null {
  const supported = useTimeTravelSupport();
  const { round } = useRound();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const narrow = useNarrow();
  const loc = `${pathname}${search}${hash}`;
  // The viewer's changes stay while the picker opens and closes on one page; a navigation drops them.
  const [edits, setEditsState] = useState<Edits>({ loc });
  // Dropped on the navigation itself, so coming back to a page doesn't bring them back.
  useEffect(() => setEditsState({ loc }), [loc]);
  const mine: Edits = edits.loc === loc ? edits : { loc };
  const edit = (change: Omit<Edits, "loc">) => setEditsState({ ...mine, ...change });
  const [openedAt, setOpenedAt] = useState(() => new Date());
  // By default, the page's own round, and when that block was made.
  const { data: header } = useBlockHeader(round ?? 0);
  const roundTime = round !== undefined && header?.timestamp ? new Date(Number(header.timestamp) * 1000) : undefined;
  const roundInput = mine.round ?? (round !== undefined ? String(round) : "");
  const day = "day" in mine ? mine.day : roundTime && midnight(roundTime);
  const time = mine.time ?? (round !== undefined ? (roundTime ? hhmmss(roundTime) : "") : hhmmss(openedAt));
  const month = mine.month ?? day ?? openedAt;
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController>();
  // A date search still running when the picker goes away must not navigate.
  useEffect(() => () => abort.current?.abort(), []);

  if (!supported) return null;

  const travel = (r: number) => {
    setOpen(false);
    navigate(withRound(`${pathname}${search}${hash}`, r));
  };

  const onRound = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d+$/.test(roundInput.trim())) return;
    // The round wins over a date search still running.
    abort.current?.abort();
    setFinding(false);
    travel(Number(roundInput.trim()));
  };

  const onDate = async (e: FormEvent) => {
    e.preventDefault();
    if (!day) return;
    const [h, m, sec] = time.split(":").map(Number);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0, sec || 0);
    abort.current?.abort();
    const controller = (abort.current = new AbortController());
    setFinding(true);
    setError(undefined);
    try {
      seedFromQueryCache(queryClient);
      const r = await roundAsOfTime(Math.floor(at.getTime() / 1000), controller.signal);
      if (!controller.signal.aborted) travel(r);
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message || "Could not find the round");
    } finally {
      if (abort.current === controller) setFinding(false);
    }
  };

  const today = new Date();

  const onOpenChange = (o: boolean) => {
    if (o) {
      setOpenedAt(new Date());
      setError(undefined);
    } else {
      abort.current?.abort();
      setFinding(false);
    }
    setOpen(o);
  };

  const trigger = label ? (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-primary outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <History className="h-4 w-4" strokeWidth={2} />
      {label}
    </button>
  ) : (
    <button
      type="button"
      title="Travel to a round or date"
      aria-label="Travel to a round or date"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full h-12 w-12 header:h-9 header:w-9 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring hover:text-primary",
        round !== undefined ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      <History className="h-7 w-7 header:h-6 header:w-6" strokeWidth={1.75} />
    </button>
  );

  const fields = (
    <>
      <form onSubmit={onRound} className="flex flex-col gap-2">
        <div className={LABEL} aria-hidden>
          Block (round)
        </div>
        <div className="flex gap-2">
          <input
            aria-label="Block (round)"
            className={cn(FIELD, "flex-1 min-w-0")}
            inputMode="numeric"
            placeholder="Round"
            // On a phone the keyboard would cover the calendar: the dialog opens without it.
            autoFocus={!narrow}
            value={roundInput}
            onChange={(e) => edit({ round: e.target.value })}
          />
          <Button type="submit" size="sm" variant="outline" className="border-border text-primary hover:bg-primary/10" disabled={!/^\d+$/.test(roundInput.trim())}>
            Go
          </Button>
        </div>
      </form>
      <div role="separator" className="my-3 h-px bg-border" />
      <form onSubmit={onDate} className="flex flex-col gap-2">
        <div className={LABEL}>Or the block at a date (local time)</div>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          // Seven 39px columns fill the menu's 274px content width; the phone dialog has more room.
          className={cn("bg-transparent p-0", narrow ? "[--cell-size:44px]" : "[--cell-size:39px]")}
          classNames={{ root: "w-full rdp-root" }}
          month={month}
          onMonthChange={(m) => edit({ month: m })}
          startMonth={GENESIS_DAY}
          endMonth={today}
          disabled={[{ before: GENESIS_DAY }, { after: today }]}
          selected={day}
          onSelect={(d) => edit({ day: d })}
        />
        <div className="flex gap-2">
          <input
            type="time"
            step={1}
            aria-label="Time (local)"
            className={cn(FIELD, "flex-1 min-w-0")}
            value={time}
            onChange={(e) => edit({ time: e.target.value })}
          />
          <Button type="submit" size="sm" variant="outline" className="border-border text-primary hover:bg-primary/10" disabled={!day || finding}>
            {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
          </Button>
        </div>
        {finding ? <div className="text-xs text-muted-foreground">Finding the round…</div> : null}
        {error ? <div className="text-xs text-red-400 break-words">{error}</div> : null}
      </form>
    </>
  );

  // On a phone, a dropdown under the trigger runs out of room and scrolls: a full-screen dialog instead.
  if (narrow) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          // Below the time-travel bar while it is up (see tailwind.css).
          data-fullscreen=""
          className={cn(
            "inset-0 left-0 top-0 h-[100dvh] max-w-none translate-x-0 translate-y-0 content-start gap-0 overflow-y-auto rounded-none border-0 p-5 text-foreground [color-scheme:dark]",
            // The close button DialogContent adds: a 44px target in the corner.
            "[&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child>svg]:h-6 [&>button:last-child>svg]:w-6",
            "data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0",
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
        >
          <DialogTitle className="pr-12 text-lg">Time travel</DialogTitle>
          <DialogDescription className="mb-5 mt-2 pr-12 text-sm text-foreground">{INTRO}</DialogDescription>
          {fields}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    // Not modal: at its full height it can run past the window, so the page stays scrollable to reach the rest
    // (the menu follows its trigger). A click outside still closes it.
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={label ? "center" : "end"}
        collisionPadding={16}
        // Always its full height, never a scrollbar: the popper flips it above the trigger when there's more room there.
        className="w-[300px] max-h-none overflow-visible bg-background border-border text-foreground p-3 [color-scheme:dark]"
        // Keeps the menu's typeahead and arrow keys out of the fields and calendar.
        onKeyDown={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-sm text-foreground">{INTRO}</p>
        {fields}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
