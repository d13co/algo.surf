// ponytail: mainnet's genesis (2019-06-11): mainnet is the one network with a fees API.
export const GENESIS = Date.UTC(2019, 5, 11) / 1000;

export interface Period {
  value: string;
  /** Short, for the menu trigger: "YTD", "2024 Q3", "Jul 2024", "2024-03-05 – 2024-04-10". */
  name: string;
  /** For a sentence: "2026 to date", "2024 Q3". */
  label: string;
  start: number;
  /** Undefined while the period is in progress: it runs to the tip. */
  end?: number;
}

// The range values of the UTC year, quarter and month holding a date.
export const yearValue = (d: Date) => String(d.getUTCFullYear());
export const quarterValue = (d: Date) => `${d.getUTCFullYear()}-q${Math.floor(d.getUTCMonth() / 3) + 1}`;
export const monthValue = (d: Date) => d.toISOString().slice(0, 7);

const CURRENT = new Map([
  ["ytd", yearValue],
  ["qtd", quarterValue],
  ["mtd", monthValue],
]);

const DAY = 24 * 3600;
const CUSTOM = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
const CALENDAR = /^(\d{4})(?:-q([1-4])|-(\d{2}))?$/;

/** [start, end) and label of a period value, not yet checked against now or genesis. */
function bounds(value: string, now: number): [number, number, string] | undefined {
  const custom = CUSTOM.exec(value);
  if (custom) {
    // Both days inclusive. ISO dates parse as UTC midnight.
    const [start, end] = [Date.parse(custom[1]) / 1000, Date.parse(custom[2]) / 1000 + DAY];
    // Also rejects an unparseable date (NaN), an impossible one (Chrome parses 2024-02-30 as Mar 1) and a range ending
    // before it starts.
    const valid = start < end && isoAt(start).startsWith(custom[1]) && isoAt(end - DAY).startsWith(custom[2]);
    return valid ? [start, end, formatSpan(start, end)] : undefined;
  }
  const current = CURRENT.get(value)?.(new Date(now * 1000));
  const match = CALENDAR.exec(current ?? value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const [month, months] = match[2] ? [(Number(match[2]) - 1) * 3, 3] : match[3] ? [Number(match[3]) - 1, 1] : [0, 12];
  if (month < 0 || month > 11) return undefined;
  const start = Date.UTC(year, month) / 1000;
  const label = match[2]
    ? `${year} Q${match[2]}`
    : match[3]
      ? new Date(start * 1000).toLocaleString("en", { month: "short", year: "numeric", timeZone: "UTC" })
      : String(year);
  return [start, Date.UTC(year, month + months) / 1000, label];
}

/** ts as a UTC ISO string. */
export const isoAt = (ts: number) => new Date(ts * 1000).toISOString();

/**
 * A UTC [start, end) in unix seconds for display. Whole days as dates, the last inclusive: "2024-03-05" for one day,
 * "2024-03-05 – 2024-04-10" for more. Anything else as times, to the second if a bound is off the minute: one for a
 * whole hour, minute or second ("2024-03-05 14:00 UTC"), else "… 14:00 – 2024-03-05 18:00 UTC".
 */
export function formatSpan(start: number, end: number): string {
  if (start % DAY === 0 && end % DAY === 0) {
    const from = isoAt(start).slice(0, 10);
    const to = isoAt(end - DAY).slice(0, 10);
    return from === to ? from : `${from} – ${to}`;
  }
  const time = (ts: number) => isoAt(ts).slice(0, start % 60 || end % 60 ? 19 : 16).replace("T", " ");
  const one = [3600, 60, 1].some((unit) => end - start === unit && start % unit === 0);
  return one ? `${time(start)} UTC` : `${time(start)} – ${time(end)} UTC`;
}

/**
 * The UTC period a range value names, in unix seconds: "2024", "2024-q3", "2024-07", ytd/qtd/mtd for the current
 * one, or a custom "2024-03-05..2024-04-10". Undefined for any other value, a period not started yet, or one that
 * ended before genesis.
 */
export function parsePeriod(value: string, now: number): Period | undefined {
  const b = bounds(value, now);
  if (!b) return undefined;
  const [start, end, label] = b;
  if (start > now || end <= GENESIS) return undefined;
  // A custom range names its last day, so only calendar periods say "to date".
  const ongoing = end > now;
  return {
    value,
    name: CURRENT.has(value) ? value.toUpperCase() : label,
    label: ongoing && !CUSTOM.test(value) ? `${label} to date` : label,
    start,
    end: ongoing ? undefined : end,
  };
}
