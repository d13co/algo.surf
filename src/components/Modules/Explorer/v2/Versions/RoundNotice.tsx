import { History } from "lucide-react";
import dateFormat from "dateformat";
import { useLocation } from "react-router-dom";
import { useBlockHeader } from "src/hooks/useBlock";
import { useRound } from "src/hooks/useRound";
import { useTimeTravelStatus } from "src/hooks/useTimeTravel";
import { TIMESTAMP_DISPLAY_FORMAT } from "src/packages/core-sdk/constants";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";

/** Pages that show a record as it was at `?round=` (see TimeTravelBar). */
const roundAwarePath = /^\/(account|application|asset)\/[^/?#]/;

/** This page without `?round`: the rest of its query (filters) and hash stay. */
function useLatestHref(): string {
  const { pathname, search, hash } = useLocation();
  const params = new URLSearchParams(search);
  params.delete("round");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

/** When `round` was made, in local time; UTC in its title. */
function RoundTime({ round }: { round: number }): JSX.Element | null {
  const { data: block } = useBlockHeader(round);
  if (!block?.timestamp) return null;
  const date = new Date(block.timestamp * 1000);
  return (
    <span title={dateFormat(date, "UTC:" + TIMESTAMP_DISPLAY_FORMAT) + " UTC"}>
      {dateFormat(date, TIMESTAMP_DISPLAY_FORMAT)}
    </span>
  );
}

/**
 * Full-width bar pinned to the top of every page while `?round=R` is set.
 * Account, app and asset pages show their state at R; the others show the
 * latest data, but their links keep the round (see keepsRound). "Back to now"
 * drops it.
 */
export function TimeTravelBar(): JSX.Element | null {
  const { round } = useRound();
  const { pathname } = useLocation();
  const latestHref = useLatestHref();

  if (round === undefined) return null;

  return (
    <div className="sticky top-0 z-40 w-full bg-primary text-primary-dark text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 max-w-[1280px] mx-auto px-5 md:px-[100px] py-2">
        <History className="h-4 w-4 shrink-0" />
        <span className="min-w-0 font-bold [&_a]:text-primary-dark [&_a]:underline">
          {roundAwarePath.test(pathname) ? "Showing historical state at" : "Time travel mode at block"}{" "}
          <LinkToBlock id={round} />
        </span>
        <span className="opacity-80">
          <RoundTime round={round} />
        </span>
        <Link
          href={latestHref}
          keepRound={false}
          noStyle
          title="Show the latest state"
          className="ml-auto shrink-0 rounded-md border border-primary-dark px-3 py-0.5 font-medium transition-colors hover:bg-primary-dark hover:text-primary"
        >
          Back to now
        </Link>
      </div>
    </div>
  );
}

/**
 * Banner on a record page opened with `?round=R` that cannot show that
 * round: without a time-travel node for this network it shows the latest
 * state. Mirrors the <DeletedNotice /> panel style. With one, <TimeTravelBar />
 * says which round the page shows.
 */
export default function RoundNotice(): JSX.Element | null {
  const { round, requested } = useRound();
  const status = useTimeTravelStatus();

  if (requested === undefined || round !== undefined) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 p-5 rounded-[10px] mb-5 border-l-2 border-l-yellow-500 bg-yellow-500/10">
      <History className="h-5 w-5 text-yellow-500 shrink-0" />
      <div>
        Showing the latest state: block {requested} needs a time-travel node,{" "}
        {status === "none" ? "and none is configured." : "and the configured one is not available for this network."}
      </div>
    </div>
  );
}
