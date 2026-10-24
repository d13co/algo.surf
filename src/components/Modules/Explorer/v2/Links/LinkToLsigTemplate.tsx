import Link from "./Link";
import { templateLabel } from "src/hooks/useLsig";

/** A logic sig template, by its admin-set name where it has one, else its id. */
function LinkToLsigTemplate({ template, name }: { template: string; name?: string | null }): JSX.Element {
  return (
    <Link className={name ? "truncate" : "truncate font-mono"} href={"/lsigs/" + template} title={template}>
      {templateLabel({ template, name })}
    </Link>
  );
}

export default LinkToLsigTemplate;
