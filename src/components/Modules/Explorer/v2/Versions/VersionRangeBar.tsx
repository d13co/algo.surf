import React, { useEffect, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "src/components/v2/ui/input";
import { useDateFormat } from "src/contexts/DateFormatContext";
import { useVersionRange, useVersionRangeHref } from "src/hooks/useVersionFilter";
import { VersionRange } from "src/utils/versionFilter";
import Link from "../Links/Link";

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

/**
 * One end of the range: applied once left, or on Enter, so a half-typed date
 * reads nothing; left half-typed, it goes back to what applies.
 */
function InstantInput({
  label,
  value,
  utc,
  end = false,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  utc: boolean;
  /** The range's last instant, not its first. */
  end?: boolean;
  onCommit: (value: number | undefined) => void;
}) {
  const shown = value === undefined ? "" : toInputValue(value, utc, end);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = (input: HTMLInputElement) => {
    // An incomplete date-time reads as empty: that is no reason to drop this end.
    if (input.validity.badInput) {
      setDraft(shown);
      return;
    }
    const next = fromInputValue(draft, utc, end);
    if (next !== value) onCommit(next);
  };
  return (
    <Input
      type="datetime-local"
      aria-label={label}
      title={`${label}, in ${utc ? "UTC" : "local time"}`}
      className="h-8 w-auto px-2 text-foreground"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(e.currentTarget);
      }}
    />
  );
}

/**
 * The version list's date range (see VersionRange), from the URL: two
 * date-time inputs, in UTC where dates show in UTC, else in local time.
 */
export default function VersionRangeBar(): JSX.Element {
  const range = useVersionRange();
  const rangeHref = useVersionRangeHref();
  const navigate = useNavigate();
  const { format } = useDateFormat();
  const utc = format === "utc";
  const apply = (next: VersionRange) =>
    navigate(rangeHref(next.from === undefined && next.to === undefined ? undefined : next));

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <CalendarRange size={14} />
      <span>From</span>
      <InstantInput label="From" value={range?.from} utc={utc} onCommit={(from) => apply({ ...range, from })} />
      <span>to</span>
      <InstantInput label="To" value={range?.to} utc={utc} end onCommit={(to) => apply({ ...range, to })} />
      <span>{utc ? "UTC" : "local time"}</span>
      {range ? (
        <Link noStyle href={rangeHref(undefined)} title="Remove the date range" className="inline-flex hover:text-foreground">
          <X size={14} />
        </Link>
      ) : null}
    </div>
  );
}
