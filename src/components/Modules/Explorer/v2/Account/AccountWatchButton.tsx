import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellDot, BellOff, BellRing, Check } from "lucide-react";
import { Button } from "src/components/v2/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/v2/ui/tooltip";
import { useAccountWatch, WatchDirection } from "src/hooks/useAccountWatch";

const actionClassName = "border-border text-primary hover:bg-primary/10";
const tooltipClassName = "bg-black text-white border-border max-w-xs";
// How long a notice (e.g. a dismissed permission prompt) stays up by itself.
const NOTICE_MS = 6000;

const DIRECTIONS: { value: WatchDirection; label: string; hint: string }[] = [
  { value: "incoming", label: "Incoming", hint: "a transaction someone else sends that involves it" },
  { value: "outgoing", label: "Outgoing", hint: "a transaction it sends" },
  { value: "both", label: "Both", hint: "any transaction involving it" },
];

const WATCHING: Record<WatchDirection, string> = {
  incoming: "incoming transactions",
  outgoing: "outgoing transactions",
  both: "all transactions",
};

function WithTooltip({ tip, children }: { tip: React.ReactNode; children: React.ReactElement }): JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className={tooltipClassName}>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DisabledWatch({ tip }: { tip: string }): JSX.Element {
  return (
    <WithTooltip tip={<p>{tip}</p>}>
      {/* A disabled button gets no pointer events: the span carries the tooltip. */}
      <span tabIndex={0}>
        <Button variant="outline" size="sm" className={actionClassName} disabled>
          <BellOff size="1em" />
          <span className="whitespace-nowrap">Watch</span>
        </Button>
      </span>
    </WithTooltip>
  );
}

type AccountWatch = ReturnType<typeof useAccountWatch>;

/**
 * Watch the account for its next incoming, outgoing or any transaction, with one browser
 * notification when it comes; Re-arm to watch for the next one.
 */
export default function AccountWatchButton({ address, label }: { address: string; label?: string }): JSX.Element | null {
  const watch = useAccountWatch(address, label);
  const { status, unavailable, permission } = watch;

  // Each state renders its own button, so a change of state removes the focused one. Keep keyboard
  // focus on the control: when a keyboard user's focus was inside and has dropped to the page, move
  // it to the new button. Not for the mouse: focusing would open the button's tooltip.
  const wrapRef = useRef<HTMLSpanElement>(null);
  const focusedRef = useRef(false);
  const keyboardRef = useRef(false);
  useEffect(() => {
    const onKey = () => {
      keyboardRef.current = true;
    };
    const onPointer = () => {
      keyboardRef.current = false;
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  useEffect(() => {
    const active = document.activeElement;
    if (!focusedRef.current || !keyboardRef.current || (active && active !== document.body)) return;
    wrapRef.current?.querySelector<HTMLElement>("button:not([disabled]), [tabindex]")?.focus({ preventScroll: true });
  }, [status, unavailable, permission]);

  if (!watch.supported) return null;
  return (
    <span
      ref={wrapRef}
      className="contents"
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to) {
          if (!wrapRef.current?.contains(to)) focusedRef.current = false;
          return;
        }
        // Nowhere: the button was removed or the window lost focus (keep it), or a click on the page
        // (clear it), told apart once the blur is done.
        const from = e.target as HTMLElement;
        setTimeout(() => {
          if (from.isConnected && document.hasFocus()) focusedRef.current = false;
        }, 0);
      }}
    >
      <WatchControl watch={watch} />
    </span>
  );
}

function WatchControl({ watch }: { watch: AccountWatch }): JSX.Element {
  const { unavailable, trouble, permission, status, direction, fired, arming, notice, arm, disarm } = watch;

  // A notice opens the tooltip by itself for a while; hovering opens it as usual. It closes when the
  // notice goes or the watch changes state, so it can't reopen by itself when the button returns.
  const [tipOpen, setTipOpen] = useState(false);
  useEffect(() => {
    setTipOpen(false);
  }, [status]);
  useEffect(() => {
    if (!notice) return;
    setTipOpen(true);
    const t = setTimeout(() => setTipOpen(false), NOTICE_MS);
    return () => {
      clearTimeout(t);
      setTipOpen(false);
    };
  }, [notice]);

  if (unavailable) {
    return <DisabledWatch tip="This browser can't show notifications from this page, so the account can't be watched here." />;
  }

  if (permission === "denied") {
    return <DisabledWatch tip="Notifications are blocked for this site. Allow them in the browser's site settings to watch this account." />;
  }

  if (status === "armed") {
    return (
      <WithTooltip
        tip={
          <p>
            Watching for {WATCHING[direction]} while this page is open. You'll get one notification. Click to stop.
            {trouble ? " Having trouble reaching the indexer: still retrying." : ""}
          </p>
        }
      >
        <Button variant="outline" size="sm" className={actionClassName} onClick={disarm} aria-label="Stop watching">
          <BellRing size="1em" className="animate-pulse" />
          <span className="whitespace-nowrap">Watching</span>
        </Button>
      </WithTooltip>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip open={tipOpen} onOpenChange={setTipOpen}>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              {/* Not disabled while arming (that would drop keyboard focus); the hook ignores a second pick. */}
              <Button variant="outline" size="sm" className={actionClassName} aria-busy={arming}>
                {status === "fired" ? <BellDot size="1em" /> : <Bell size="1em" />}
                <span className="whitespace-nowrap">{arming ? "Starting…" : status === "fired" ? "Re-arm" : "Watch"}</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent className="min-w-64 bg-background border-border text-primary">
            <DropdownMenuLabel className="text-muted-foreground font-normal">
              Notify me once of the next…
            </DropdownMenuLabel>
            {DIRECTIONS.map((d) => (
              <DropdownMenuItem
                key={d.value}
                className="cursor-pointer focus:bg-primary/10 focus:text-primary"
                onSelect={() => void arm(d.value)}
              >
                <span className="w-4 shrink-0">{status === "fired" && d.value === direction ? <Check size="1em" /> : null}</span>
                <span className="flex flex-col">
                  <span>{d.label}</span>
                  <span className="text-xs text-muted-foreground">{d.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
            {status === "fired" && fired?.txid ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer focus:bg-primary/10 focus:text-primary" asChild>
                  <Link to={`/transaction/${fired.txid}`} className="block w-full no-underline text-inherit">
                    <span className="text-xs text-muted-foreground">Last notified: </span>
                    {fired.side === "incoming" ? "incoming" : "outgoing"} txn
                    {fired.round !== undefined ? ` in round ${fired.round}` : ""}
                  </Link>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent className={tooltipClassName}>
          <p>{notice ?? (status === "fired" ? "Watch again for this account's next transaction." : "Get one browser notification for this account's next transaction.")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
