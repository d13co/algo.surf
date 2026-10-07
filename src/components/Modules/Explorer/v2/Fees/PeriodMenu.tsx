import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DateRange } from "react-day-picker";
import { Button } from "src/components/v2/ui/button";
import { Calendar } from "src/components/v2/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";
import { cn } from "src/lib/utils";
import { GENESIS, Period, monthValue, parsePeriod, quarterValue } from "./periods";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ITEM = "cursor-pointer focus:bg-primary/10 focus:text-primary data-[state=open]:bg-primary/10";
const CONTENT = "bg-background border-border text-primary";
const LABEL = "text-xs font-normal text-muted-foreground";
// Calendar days are local dates at midnight; a custom range value names them as UTC days.
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
// The UTC day holding ts, as a calendar day.
const utcDay = (ts: number) => localDay(new Date(ts * 1000).toISOString().slice(0, 10));
const GENESIS_DAY = utcDay(GENESIS);

interface PeriodMenuProps {
  /** The selected period, named on the trigger. */
  period?: Period;
  now: number;
  onSelect: (value: string) => void;
}

/**
 * Calendar periods: shortcuts beside a year > quarter/month grid per year, or beside the custom range form once
 * Custom is clicked. The two columns stack when they don't fit side by side.
 */
function PeriodMenu({ period, now, onSelect }: PeriodMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const today = new Date(now * 1000);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const todayDay = utcDay(now);
  const years = Array.from({ length: year - new Date(GENESIS * 1000).getUTCFullYear() + 1 }, (_, i) => year - i);

  // Disabled when not started yet, or over before genesis.
  const item = (value: string, name: string, className?: string) => (
    <DropdownMenuItem
      key={value}
      className={cn(ITEM, className)}
      disabled={!parsePeriod(value, now)}
      onSelect={() => onSelect(value)}
    >
      {name}
    </DropdownMenuItem>
  );

  // Each open starts on the selected custom range, form shown, if there is one.
  const isCustom = !!period?.value.includes("..");
  const [range, setRange] = useState<DateRange>();
  const [showCustom, setShowCustom] = useState(false);
  // One day picked so far is a one-day range.
  const customValue = range?.from ? `${isoDay(range.from)}..${isoDay(range.to ?? range.from)}` : "";
  const custom = parsePeriod(customValue, now);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        if (o) {
          const [from, to] = isCustom ? period!.value.split("..").map(localDay) : [];
          setRange(from && { from, to });
          setShowCustom(isCustom);
        }
        setOpen(o);
      }}
    >
      {/* Styled as one more tab of the range tabs beside it. */}
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1 whitespace-nowrap px-3 pt-1.5 pb-2 text-sm font-medium border-b-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          period ? "border-primary text-primary" : "border-transparent text-muted-foreground",
        )}
      >
        {period?.name ?? "Period"}
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(CONTENT, "flex flex-wrap gap-x-2 max-w-[var(--radix-dropdown-menu-content-available-width)]")}
      >
        <div className="flex flex-col w-36">
          <DropdownMenuLabel className={LABEL}>Shortcuts</DropdownMenuLabel>
          {item("mtd", "This month")}
          {item("qtd", "This quarter")}
          {item("ytd", "Year to date")}
          <DropdownMenuSeparator />
          {item(monthValue(new Date(Date.UTC(year, month - 1))), "Last month")}
          {item(quarterValue(new Date(Date.UTC(year, month - 3))), "Last quarter")}
          <DropdownMenuSeparator />
          {/* Toggles the right column between the years and the form, keeping the menu open. */}
          <DropdownMenuItem
            className={cn(ITEM, showCustom && "bg-primary/10")}
            onSelect={(e) => {
              e.preventDefault();
              setShowCustom(!showCustom);
            }}
          >
            Custom
            <ChevronRight className="ml-auto" />
          </DropdownMenuItem>
        </div>
        {showCustom ? (
          <div
            className="flex flex-col gap-2 px-2 pb-2 [color-scheme:dark]"
            // Keeps the menu's typeahead and arrow keys out of the calendar.
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel className={cn(LABEL, "px-0")}>Custom (UTC, inclusive)</DropdownMenuLabel>
            <Calendar
              mode="range"
              captionLayout="dropdown"
              className="bg-transparent p-0"
              // Into the calendar: a menu keeps Tab and arrow-key focus on its own items.
              autoFocus
              defaultMonth={range?.from}
              today={todayDay}
              startMonth={GENESIS_DAY}
              endMonth={todayDay}
              disabled={[{ before: GENESIS_DAY }, { after: todayDay }]}
              selected={range}
              onSelect={setRange}
            />
            <div className="text-sm text-muted-foreground">{custom?.name ?? "Pick a start and end day"}</div>
            <Button
              size="sm"
              variant="outline"
              className="border-border text-primary hover:bg-primary/10"
              disabled={!custom}
              onClick={() => {
                setOpen(false);
                onSelect(customValue);
              }}
            >
              Apply
            </Button>
          </div>
        ) : (
          <div className="flex flex-col w-28">
            <DropdownMenuLabel className={LABEL}>Years</DropdownMenuLabel>
            {years.map((y) => (
              <DropdownMenuSub key={y}>
                <DropdownMenuSubTrigger className={ITEM}>{y}</DropdownMenuSubTrigger>
                {/* One row per quarter: the quarter, then its months. */}
                <DropdownMenuSubContent className={cn(CONTENT, "grid grid-cols-4")}>
                  {y === year ? item("ytd", "Year to date", "col-span-4") : item(String(y), "Full year", "col-span-4")}
                  {[0, 1, 2, 3].flatMap((q) => [
                    item(`${y}-q${q + 1}`, `Q${q + 1}`, "text-muted-foreground"),
                    ...[0, 1, 2].map((i) => item(`${y}-${String(q * 3 + i + 1).padStart(2, "0")}`, MONTHS[q * 3 + i])),
                  ])}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PeriodMenu;
