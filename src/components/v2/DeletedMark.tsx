import { Trash2 } from "lucide-react";
import { useRound } from "src/hooks/useRound";

/**
 * A list row's sign that its asset or app has been deleted: by the page's
 * round, if it shows one, else by now.
 */
export default function DeletedMark({
  deleted,
  atRound,
}: {
  deleted?: boolean;
  /** The round it was deleted in */
  atRound?: number;
}): JSX.Element | null {
  const { round } = useRound();
  if (!deleted) return null;
  // Still there at the round the page shows
  if (round !== undefined && atRound !== undefined && atRound > round) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle text-xs text-red-400" title="Deleted">
      <Trash2 className="h-3.5 w-3.5" />
      deleted
    </span>
  );
}
