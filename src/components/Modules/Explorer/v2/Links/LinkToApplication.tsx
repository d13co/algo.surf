import Link from "./Link";
import React from "react";
import Copyable from "src/components/v2/Copyable";
import { ellipseString } from "src/packages/core-sdk/utils";
import { useKnownAppName } from "src/hooks/useKnownNames";

function LinkToApplication({
  id,
  name = "",
  copy = "",
  copySize = "m",
  address,
  title,
  strip = 0,
  lookup = false,
}: {
  id: number;
  name?: string;
  copy?: string;
  copySize?: "m" | "s";
  address?: string;
  title?: string;
  strip?: number;
  /** Load an app not known from its ID or creation to name it (one indexer request); off in long lists. */
  lookup?: boolean;
}): JSX.Element {
  // A caller's own name wins; the plain "App <id>" (or none) gives way to what the app is known as.
  const plain = !name || name === "App " + id;
  const knownName = useKnownAppName(plain ? id : undefined, lookup);
  // Where the ID can be copied (detail fields) keep it, followed by the name; elsewhere the name replaces it.
  const named = plain && !!knownName;
  const withId = named && (copy === "left" || copy === "right");
  const label = named && !withId ? knownName : name || String(id);
  const copyValue = address || id;
  return (
    <span className="inline-flex items-center min-w-0 max-w-full">
      {copy === "left" ? <Copyable size={copySize} value={copyValue}/> : null}
      <Link className="truncate" href={"/application/" + id} title={title ?? (named ? `App ${id}` : undefined)}>
        {label}
        {withId ? <span className="text-muted-foreground"> ({knownName})</span> : null}
      </Link>
      {copy === "right" ? <Copyable size={copySize} value={copyValue}/> : null}
    </span>
  );
}

export default LinkToApplication;
