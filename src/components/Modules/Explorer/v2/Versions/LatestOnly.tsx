import React from "react";
import { History } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useRound } from "src/hooks/useRound";
import Link from "../Links/Link";

/**
 * A view whose data has no history (indexer or surf idx lists of now): at a
 * past round, a notice with a link to the latest state instead of the view,
 * so the latest data never shows under "Showing historical state".
 */
export default function LatestOnly({ what, children }: { what: string; children: React.ReactNode }): JSX.Element {
  const { round } = useRound();
  const { pathname, search, hash } = useLocation();
  if (round === undefined) return <>{children}</>;
  const params = new URLSearchParams(search);
  params.delete("round");
  const query = params.toString();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5 p-5 rounded-[10px] border-l-2 border-l-yellow-500 bg-yellow-500/10 text-sm">
      <History className="h-5 w-5 text-yellow-500 shrink-0" />
      <div>
        {what}: only known as of now, so not shown at block {round}.{" "}
        <Link href={`${pathname}${query ? `?${query}` : ""}${hash}`} keepRound={false}>
          Show the latest
        </Link>
      </div>
    </div>
  );
}
