import React from "react";
import { FileCode2 } from "lucide-react";
import { cn } from "src/lib/utils";
import { sourceLang } from "src/utils/arc56Source";
import type { Frame } from "src/utils/traceStepper";
import Link from "../../Links/Link";
import type { TraceSource } from "./useTraceSource";

/**
 * The source panel's bar: for a program a saved spec matches, the TEAL /
 * source switch (with source lines) and one line naming the spec, linking
 * to it on the contracts page; else a hint to add the spec there.
 */

/** The contracts page, open at one spec. The debugger opens it in a new tab, keeping its place, and matches new specs when it is back in view. */
export const contractsHref = (id?: string) => (id ? `/debug/contracts?spec=${id}` : "/debug/contracts");

const Seg = ({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) => (
  <button
    type="button"
    aria-pressed={on}
    title={title}
    onClick={onClick}
    className={cn("px-2 py-0.5 cursor-pointer", on ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:bg-white/5")}
  >
    {children}
  </button>
);

export function SourceBar({ f, src }: { f: Frame; src: TraceSource }) {
  const hash = f.hash;
  if (!hash || !src.appPrograms(f).length) return null;
  const have = src.srcs.get(hash);
  const view = src.viewOf(hash);

  if (!have) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-1 text-xs text-muted-foreground">
        <FileCode2 className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate" title="A spec shows the program's source, method names and failure messages">
          No saved spec matches this program:{" "}
          <Link href={contractsHref()} keepRound={false} target="_blank" rel="noopener">
            add its ARC-56 spec
          </Link>
        </span>
      </div>
    );
  }

  const files = Object.keys(have.rec.sources ?? {}).length;
  const facts = [
    have.map.exact && "exact",
    !have.map.lines.length && "names only",
    have.rec.puyaMap && !have.map.mapMismatch && "with map",
    have.map.mapMismatch && "map doesn't fit",
    files && `${files} source ${files === 1 ? "file" : "files"}`,
  ].filter(Boolean);
  const title = have.map.mapMismatch
    ? `The .puya.map doesn't fit: ${have.map.mapMismatch}`
    : !have.map.lines.length
      ? "Its TEAL has no source lines (no // file:line comments), so there's no source view; its names are used"
      : "Open this contract on the contracts page";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/40 px-3 py-1 text-xs">
      {have.map.lines.length ? (
        <span className="inline-flex overflow-hidden rounded border border-border/50" role="group" aria-label="Show the program as">
          <Seg on={view === "teal"} onClick={() => src.setView(hash, "teal")}>TEAL</Seg>
          <Seg on={view === "ts"} onClick={() => src.setView(hash, "ts")}>{sourceLang(have.map)}</Seg>
        </span>
      ) : null}
      {have.map.lines.length && view === "teal" ? (
        <span className="inline-flex overflow-hidden rounded border border-border/50">
          <Seg on={src.colOf(hash)} onClick={() => src.setCol(hash, !src.colOf(hash))} title="Show the source line beside each run of TEAL ops">
            Source lines
          </Seg>
        </span>
      ) : null}
      <Link href={contractsHref(have.lib.id)} keepRound={false} target="_blank" rel="noopener" title={title} className="min-w-0 truncate">
        {have.rec.name} spec
        {facts.length ? <span className="text-muted"> · {facts.join(" · ")}</span> : null}
      </Link>
    </div>
  );
}
