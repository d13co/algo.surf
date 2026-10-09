import { History } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useRound } from "src/hooks/useRound";
import { useTimeTravelStatus } from "src/hooks/useTimeTravel";
import Link from "../Links/Link";
import LinkToBlock from "../Links/LinkToBlock";

/** Pages that show a record as it was at `?round=`, under <RoundNotice />. */
const roundAwarePath = /^\/(account|application|asset)\/[^/?#]/;

/**
 * Slim bar on every other page while `?round=R` is set: the page shows the
 * latest data, but its links keep the round (see keepsRound). Exit drops it.
 */
export function TimeTravelBar(): JSX.Element | null {
  const { round } = useRound();
  const { pathname, search, hash } = useLocation();

  if (round === undefined || roundAwarePath.test(pathname)) return null;

  const params = new URLSearchParams(search);
  params.delete("round");
  const query = params.toString();

  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-md mb-5 text-sm border-l-2 border-l-yellow-500 bg-yellow-500/10">
      <History className="h-4 w-4 text-yellow-500 shrink-0" />
      <span className="min-w-0">
        Exploring in time travel mode at round <LinkToBlock id={round} />
      </span>
      <Link href={`${pathname}${query ? `?${query}` : ""}${hash}`} keepRound={false} className="ml-auto shrink-0">
        Exit
      </Link>
    </div>
  );
}

/**
 * Banner on a record page opened with `?round=R`: what it shows is the state
 * at that round, not the latest. Mirrors the <DeletedNotice /> panel style.
 */
export default function RoundNotice(): JSX.Element | null {
  const { round, requested } = useRound();
  const status = useTimeTravelStatus();
  const { pathname } = useLocation();

  if (requested === undefined) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 p-5 rounded-[10px] mb-5 border-l-2 border-l-yellow-500 bg-yellow-500/10">
      <History className="h-5 w-5 text-yellow-500 shrink-0" />
      {round !== undefined ? (
        <div>
          Showing the state at round <LinkToBlock id={round} />, from the time-travel node.{" "}
          <Link href={pathname} keepRound={false}>Show the latest state</Link>
        </div>
      ) : (
        <div>
          Showing the latest state: round {requested} needs a time-travel node,{" "}
          {status === "none" ? "and none is configured." : "and the configured one is not available for this network."}
        </div>
      )}
    </div>
  );
}
