import React, { useRef, useState } from "react";
import { CalendarRange, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "src/components/v2/ui/button";
import { Chip } from "src/components/v2/Chips";
import { Input } from "src/components/v2/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";
import { useDateFormat } from "src/contexts/DateFormatContext";
import { useVersionRange, useVersionRangeHref } from "src/hooks/useVersionFilter";
import { cn } from "src/lib/utils";
import { VersionRange } from "src/utils/versionFilter";
import Link from "../Links/Link";

/**
 * A version list's toolbar button: outlined, tinted while `on`. On phones it
 * is icon-only - its label goes in a `max-sm:sr-only` span.
 */
export function toolbarButtonClass(on = false): string {
  return cn("border-border text-primary hover:bg-primary/10 max-sm:w-9 max-sm:px-0", on && "border-primary bg-primary/15");
}

/** An outlined text button in a version list's toolbar or menus. */
export const actionButtonClass = "border-border text-primary hover:bg-primary/10";

export const menuContentClass = "bg-background border-border text-primary";
export const menuItemClass = "cursor-pointer focus:bg-primary/10 focus:text-primary";
const menuLabelClass = "text-xs font-normal text-muted-foreground";

/** A menu trigger's label and chevron, both gone on phones. */
function TriggerLabel({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="max-sm:sr-only">{children}</span>
      <ChevronDown className="-ml-1 opacity-70 max-sm:hidden" />
    </>
  );
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * Unix seconds as a datetime-local input's value, in UTC or local time; with
 * seconds only where there are some - and at the `end` of a range, only where
 * the minute does not end there (see fromInputValue).
 */
function toInputValue(seconds: number, utc: boolean, end: boolean): string {
  const d = new Date(seconds * 1000);
  const [y, mo, day, h, mi, s] = utc
    ? [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    : [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
  const shownSeconds = end && s === 59 ? 0 : s;
  return `${pad(y, 4)}-${pad(mo)}-${pad(day)}T${pad(h)}:${pad(mi)}${shownSeconds ? `:${pad(s)}` : ""}`;
}

/**
 * A datetime-local input's value, in UTC or local time, as Unix seconds;
 * undefined where empty. Without seconds, the `end` of a range is the end of
 * its minute: "to 23:59" takes in 23:59:30.
 */
function fromInputValue(value: string, utc: boolean, end: boolean): number | undefined {
  if (!value) return undefined;
  // Without an offset, Date reads a date-time as local time.
  const ms = new Date(utc ? `${value}Z` : value).getTime();
  if (!Number.isFinite(ms)) return undefined;
  const wholeMinute = end && /T\d\d:\d\d$/.test(value);
  return Math.floor(ms / 1000) + (wholeMinute ? 59 : 0);
}

/** The focusable controls in `root`, in Tab order. */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("input, button")).filter(
    (el) => !(el as HTMLInputElement | HTMLButtonElement).disabled,
  );
}

/**
 * The version list's date range (see VersionRange), from the URL: a menu of
 * two date-time inputs, in UTC where dates show in UTC, else in local time.
 * Both ends apply together - on Enter, on Apply or on closing the menu - and
 * Escape drops them; an end left as it was, or half-typed, stays as it is.
 * `open` is the caller's, so a menu kept open survives the list remounting.
 */
export function VersionRangeMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const range = useVersionRange();
  const rangeHref = useVersionRangeHref();
  const navigate = useNavigate();
  const { format } = useDateFormat();
  const utc = format === "utc";
  const zone = utc ? "UTC" : "local time";

  const shownFrom = range?.from === undefined ? "" : toInputValue(range.from, utc, false);
  const shownTo = range?.to === undefined ? "" : toInputValue(range.to, utc, true);
  const [from, setFrom] = useState(shownFrom);
  const [to, setTo] = useState(shownTo);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  // Closed by Escape or Clear: nothing typed applies.
  const discard = useRef(false);

  const apply = (next: VersionRange | undefined) =>
    navigate(rangeHref(next && (next.from !== undefined || next.to !== undefined) ? next : undefined));

  // The range the inputs hold: an end as it was where its input is (shown
  // without its seconds, so reading it back could move it), or is half-typed
  // - an incomplete date-time reads as empty, which is no reason to drop it.
  const keep = (draft: string, shown: string, input: HTMLInputElement | null) => draft === shown || !!input?.validity.badInput;
  const next: VersionRange = {
    from: keep(from, shownFrom, fromRef.current) ? range?.from : fromInputValue(from, utc, false),
    to: keep(to, shownTo, toRef.current) ? range?.to : fromInputValue(to, utc, true),
  };
  const backwards = next.from !== undefined && next.to !== undefined && next.from > next.to;

  // Applies the inputs, unless they name a range no version can be in.
  const commit = () => {
    if (backwards) return;
    if (next.from !== range?.from || next.to !== range?.to) apply(next);
  };

  const close = (applying: boolean) => {
    discard.current = !applying;
    onOpenChange(false);
    if (applying) commit();
  };

  const input = (label: string, ref: React.RefObject<HTMLInputElement>, value: string, set: (v: string) => void) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label} ({zone})
      <Input
        ref={ref}
        type="datetime-local"
        className="h-9 px-2 text-sm text-foreground [color-scheme:dark]"
        value={value}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !backwards) close(true);
        }}
      />
    </label>
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        if (o) {
          // Each opening starts from what applies.
          discard.current = false;
          setFrom(shownFrom);
          setTo(shownTo);
          // Into the From input, once the menu has focused itself: a menu
          // keeps Tab and arrow-key focus on its own items.
          requestAnimationFrame(() => fromRef.current?.focus());
        } else if (!discard.current) {
          commit();
        }
        onOpenChange(o);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={toolbarButtonClass(!!range)} title={range ? "Versions in a date range" : "Pick a date range"}>
          <CalendarRange />
          <TriggerLabel>Dates</TriggerLabel>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn(menuContentClass, "w-72 p-3")}
        onEscapeKeyDown={() => {
          discard.current = true;
        }}
      >
        {/*
          Keeps the menu's typeahead and arrow keys out of the inputs, and
          Tab among them: the menu would stop it, or let it leave.
        */}
        <div
          className="flex flex-col gap-3"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key !== "Tab") return;
            const all = tabbables(e.currentTarget);
            const at = all.indexOf(document.activeElement as HTMLElement);
            const wrapTo = e.shiftKey ? (at <= 0 ? all.length - 1 : -1) : at === all.length - 1 ? 0 : -1;
            if (wrapTo >= 0) {
              e.preventDefault();
              all[wrapTo].focus();
            }
          }}
        >
          <span className="text-sm font-semibold text-foreground">Date range</span>
          {input("From", fromRef, from, setFrom)}
          {input("To", toRef, to, setTo)}
          {backwards ? (
            <span className="text-xs text-red-400" role="alert">
              From is after To: no versions can be in that range.
            </span>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto px-2 text-muted-foreground"
              disabled={!range}
              onClick={() => {
                close(false);
                apply(undefined);
              }}
            >
              Clear
            </Button>
            <Button variant="outline" size="sm" className={actionButtonClass} disabled={backwards} onClick={() => close(true)}>
              Apply
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The date range the list shows, as a chip that removes it; nothing without one. */
export function VersionRangeChip(): JSX.Element | null {
  const range = useVersionRange();
  const rangeHref = useVersionRangeHref();
  const { format } = useDateFormat();
  const utc = format === "utc";
  if (!range) return null;
  const at = (seconds: number, end: boolean) => toInputValue(seconds, utc, end).replace("T", " ");
  const text =
    range.from !== undefined && range.to !== undefined
      ? `${at(range.from, false)} → ${at(range.to, true)}`
      : range.from !== undefined
        ? `From ${at(range.from, false)}`
        : range.to !== undefined
          ? `Until ${at(range.to, true)}`
          : null;
  if (!text) return null;
  return (
    <Chip variant="success" className="gap-1.5" title={`Versions in this date range, in ${utc ? "UTC" : "local time"}`}>
      <CalendarRange size={12} />
      {text}
      {utc ? " UTC" : ""}
      <Link noStyle href={rangeHref(undefined)} title="Remove the date range" className="inline-flex -mr-1 hover:text-foreground">
        <X size={12} />
      </Link>
    </Chip>
  );
}

/** A switch in a version list's Options menu, under its `group`'s label. */
export type VersionOption = {
  id: string;
  group: string;
  label: string;
  checked: boolean;
  /** What it is unless changed: the trigger is tinted while any differs. */
  defaultChecked?: boolean;
  /** Forced, by a filter that needs it: `note` says why. */
  disabled?: boolean;
  note?: string;
  onChange: (checked: boolean) => void;
};

/**
 * A version list's switches, grouped; nothing without any. `open` is the
 * caller's: a switch that remounts the list leaves the menu open to toggle another.
 */
export function VersionOptionsMenu({
  options,
  open,
  onOpenChange,
}: {
  options: VersionOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element | null {
  if (!options.length) return null;
  const groups = [...new Set(options.map((o) => o.group))];
  const changed = options.some((o) => !o.disabled && o.checked !== (o.defaultChecked ?? false));
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={toolbarButtonClass(changed)} title="List options">
          <SlidersHorizontal />
          <TriggerLabel>Options</TriggerLabel>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn(menuContentClass, "min-w-64")}>
        {groups.map((group, i) => (
          <React.Fragment key={group}>
            {i ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className={menuLabelClass}>{group}</DropdownMenuLabel>
            {options
              .filter((o) => o.group === group)
              .map((o) => (
                <DropdownMenuCheckboxItem
                  key={o.id}
                  className={menuItemClass}
                  checked={o.checked}
                  disabled={o.disabled}
                  onCheckedChange={(checked) => o.onChange(checked === true)}
                  // Stays open, to toggle another.
                  onSelect={(e) => e.preventDefault()}
                >
                  {o.label}
                  {o.note ? <span className="ml-auto pl-3 text-xs text-muted-foreground">{o.note}</span> : null}
                </DropdownMenuCheckboxItem>
              ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
