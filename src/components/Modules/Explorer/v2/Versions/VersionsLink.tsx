import { History } from "lucide-react";
import { withVersionFilter, VersionFilter } from "src/utils/versionFilter";
import Link from "../Links/Link";

/**
 * A history icon linking to the version list at `path`, filtered to `filter`:
 * the versions of one object, or of one field of it. On a page at a past
 * round, the list ends there.
 */
export default function VersionsLink({ path, filter, title }: { path: string; filter: VersionFilter; title: string }) {
  return (
    <Link
      noStyle
      href={withVersionFilter(path, filter)}
      title={title}
      className="inline-flex shrink-0 text-muted-foreground hover:text-primary"
    >
      <History size={13} />
    </Link>
  );
}
