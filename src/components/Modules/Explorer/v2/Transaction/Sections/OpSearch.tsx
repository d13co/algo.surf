import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { cn } from "src/lib/utils";
import { formatUnits } from "src/utils/formatUnits";
import { hitIndex, inRun, nextHit, opCounts, prevHit, searchOps, type OpQuery, type OpSearch } from "src/utils/opSearch";
import type { Frame, Stepper } from "src/utils/traceStepper";

/**
 * The debugger's find bar: ops by name or line, in the whole trace or the
 * current run. While typing an op name, a list of the ops that ran, with how
 * often, and those in the program that never did.
 */

// React 18's (the app renders with createRoot), which the project's React 17 types don't declare.
const useDeferredValue = (React as unknown as { useDeferredValue: <V>(value: V) => V }).useDeferredValue;

const grouped = (v: number) => formatUnits(v, 0);
const LIST_ID = "op-search-list";
const COUNT_ID = "op-search-count";
const optId = (k: number) => `op-search-opt-${k}`;

export type OpScope = "trace" | "run";

export function useOpSearch(T: Stepper, f: Frame) {
  const [q, setQ] = useState<OpQuery>({ text: "", mode: "op", regex: false });
  const [scope, setScope] = useState<OpScope>("trace");
  // Typing stays quick on a long trace; the hits follow.
  const dq = useDeferredValue(q);
  const run = scope === "run" ? f : undefined;
  // Searched once per query; a run's hits are cut from those, as stepping moves from run to run.
  const whole = useMemo(() => searchOps(T, dq), [T, dq]);
  const result = useMemo(() => (whole && run ? inRun(T, whole, run) : whole), [T, whole, run]);
  const inputRef = useRef<HTMLInputElement>(null);
  return { q, setQ, scope, setScope, run, result, inputRef };
}

export type OpSearchState = ReturnType<typeof useOpSearch>;

/** The hit to go to from `pos`, forward or back, if any. */
export function stepHit(result: OpSearch | undefined, pos: number, back: boolean): number | undefined {
  if (!result?.hits.length) return undefined;
  return back ? prevHit(result.hits, pos) : nextHit(result.hits, pos);
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={cn(
        "rounded border px-1 font-mono text-[11px] leading-4 cursor-pointer",
        on ? "border-orange-400/50 bg-orange-400/15 text-orange-300" : "border-transparent text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function OpSearchField({ T, search, pos, onGo }: { T: Stepper; search: OpSearchState; pos: number; onGo: (q: number) => void }) {
  const { q, setQ, scope, setScope, run, result, inputRef } = search;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // The list: ops that ran (in scope), then the program's ops that never did, matching what's typed.
  const counts = useMemo(() => (open && q.mode === "op" ? opCounts(T, run) : undefined), [open, q.mode, T, run]);
  const options = useMemo(() => {
    if (!counts) return { ran: [], notRun: [] };
    const t = q.text.trim();
    let test = (op: string) => op.toLowerCase().startsWith(t.toLowerCase());
    if (q.exact) test = (op) => op === t;
    else if (q.regex && t) {
      try {
        const re = new RegExp(t, "i");
        test = (op) => re.test(op);
      } catch {
        // "Bad pattern" in the field: nothing to pick either.
        return { ran: [], notRun: [] };
      }
    }
    return { ran: counts.ran.filter((c) => test(c.op)), notRun: counts.notRun.filter(test) };
  }, [counts, q.text, q.regex, q.exact]);
  const flat = useMemo(() => [...options.ran.map((c) => c.op), ...options.notRun], [options]);
  const listOpen = open && flat.length > 0;
  // Another list (the run changed under it): the highlight would name another op.
  useEffect(() => setActive(-1), [flat]);
  // Keep the option picked by the arrow keys in view.
  useEffect(() => {
    if (listOpen && active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: "nearest" });
  }, [listOpen, active]);

  // Enter right after typing: the hits may still be on their way; go once they're in.
  const pending = useRef<"next" | "prev">();
  const go = (dir: "next" | "prev") => {
    if (!q.text.trim()) return;
    if (result?.query !== q) {
      pending.current = dir;
      return;
    }
    pending.current = undefined;
    const h = stepHit(result, pos, dir === "prev");
    if (h !== undefined) onGo(h);
  };
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (pending.current && result?.query === q) goRef.current(pending.current);
  }, [result, q]);

  // A picked op is found by its whole name: `int` alone, not `intc_0` too. Typing goes back to a prefix.
  const pick = (op: string) => {
    setQ({ ...q, text: op, regex: false, exact: true });
    setOpen(false);
    setActive(-1);
    pending.current = "next";
  };

  // A new query from the toggles or the scope: no jump left waiting from the last one.
  const change = (next: Partial<OpQuery>) => {
    pending.current = undefined;
    setQ({ ...q, ...next });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (listOpen && active >= 0 && flat[active]) return pick(flat[active]);
      setOpen(false);
      go(e.shiftKey ? "prev" : "next");
    } else if (e.key === "F3") {
      e.preventDefault();
      go(e.shiftKey ? "prev" : "next");
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setActive(-1);
      if (listOpen) return setOpen(false);
      // Back to stepping, the hits kept: F3 goes on through them.
      inputRef.current?.blur();
    }
  };

  const hits = result?.hits;
  const n = hits?.length ?? 0;
  const k = hits ? hitIndex(hits, pos) : -1;
  const count = !result ? null : result.error ? (
    <span className="text-red-400" title={result.error}>Bad pattern</span>
  ) : !n ? (
    <span className="text-muted">No hits</span>
  ) : k >= 0 ? (
    `${grouped(k + 1)} of ${grouped(n)}`
  ) : (
    `${grouped(n)} ${n === 1 ? "hit" : "hits"}`
  );

  let optIndex = -1;
  const option = (op: string, c?: number) => {
    optIndex += 1;
    const idx = optIndex;
    return (
      <div
        key={`${c === undefined ? "n" : "r"}:${op}`}
        id={optId(idx)}
        role="option"
        aria-selected={idx === active}
        onMouseEnter={() => setActive(idx)}
        onClick={() => pick(op)}
        className={cn("flex items-baseline gap-2 px-3 py-0.5 cursor-pointer", idx === active && "bg-primary/25")}
      >
        <span className={cn("font-mono", c === undefined ? "text-muted" : "text-foreground")}>{op}</span>
        <span className={cn("ml-auto tabular-nums", c === undefined ? "text-muted" : "text-muted-foreground")}>{c === undefined ? 0 : grouped(c)}</span>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <div className="flex h-8 w-[22rem] max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-md border border-border/50 bg-background-muted px-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={q.mode === "op" ? "Find ops by name" : "Find ops by line text"}
            aria-expanded={listOpen}
            aria-controls={LIST_ID}
            aria-autocomplete="list"
            aria-activedescendant={listOpen && active >= 0 ? optId(active) : undefined}
            aria-describedby={COUNT_ID}
            aria-keyshortcuts="/"
            spellCheck={false}
            autoComplete="off"
            placeholder={q.mode === "op" ? "Find op  /" : "Find in lines  /"}
            value={q.text}
            onChange={(e) => {
              setQ({ ...q, text: e.target.value, exact: false });
              pending.current = undefined;
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => (setOpen(true), setActive(-1))}
            onBlur={() => (setOpen(false), setActive(-1))}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:font-sans placeholder:text-muted"
          />
          {/* Read with the field (aria-describedby), not live: it changes on every step on or off a hit, over "Step N of M". */}
          <span id={COUNT_ID} className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {count}
          </span>
          <span className="h-4 w-px shrink-0 bg-border/40" />
          <Toggle
            on={q.mode === "op"}
            onClick={() => change({ mode: "op", exact: false })}
            title={q.mode === "op" && q.exact ? "Match this op exactly (picked from the list); type to match by prefix again" : "Match op names, by prefix"}
          >
            {q.mode === "op" && q.exact ? "op=" : "op"}
          </Toggle>
          <Toggle on={q.mode === "line"} onClick={() => change({ mode: "line", exact: false })} title="Match anywhere in the line: arguments, labels, comments">
            line
          </Toggle>
          <Toggle on={q.regex && !(q.mode === "op" && q.exact)} onClick={() => change({ regex: !q.regex, exact: false })} title="Regular expression">
            .*
          </Toggle>
          <button type="button" aria-label="Previous hit" title="Previous hit (Shift+Enter, Shift+F3)" disabled={!n} onClick={() => go("prev")} className="text-muted hover:text-foreground disabled:opacity-40 cursor-pointer">
            <ChevronUp className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next hit" title="Next hit (Enter, F3)" disabled={!n} onClick={() => go("next")} className="text-muted hover:text-foreground disabled:opacity-40 cursor-pointer">
            <ChevronDown className="h-4 w-4" />
          </button>
          {q.text ? (
            <button type="button" aria-label="Clear the search" title="Clear" onClick={() => (change({ text: "", exact: false }), inputRef.current?.focus())} className="text-muted hover:text-foreground cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {listOpen ? (
          // Pressing in it (an option, the scrollbar) keeps the field focused, so the list stays open.
          <div className="absolute top-9 left-0 z-30 w-[22rem] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-background-card text-xs shadow-xl shadow-black/60" onMouseDown={(e) => e.preventDefault()}>
            <div id={LIST_ID} role="listbox" aria-label="Ops" className="max-h-72 overflow-auto py-1" onMouseLeave={() => setActive(-1)}>
              {options.ran.length ? (
                <div role="group" aria-labelledby="op-search-ran">
                  <div id="op-search-ran" className="flex px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted">
                    <span>Ran in this {scope === "run" ? "run" : "trace"}</span>
                    <span className="ml-auto normal-case tracking-normal" aria-hidden>times</span>
                  </div>
                  {options.ran.map((c) => option(c.op, c.n))}
                </div>
              ) : null}
              {options.notRun.length ? (
                <div role="group" aria-labelledby="op-search-not-run">
                  <div id="op-search-not-run" className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wide text-muted">{scope === "run" ? "In the program, not run in this run" : "In the programs, never ran"}</div>
                  {options.notRun.map((op) => option(op))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-3 border-t border-border/40 px-3 py-1.5 text-[11px] text-muted" aria-hidden>
              <span>↑↓ pick</span>
              <span>Enter go to the next hit</span>
              <span>Esc close</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex h-8 overflow-hidden rounded-md border border-border/50 text-[11px]" role="group" aria-label="Search in">
        {(["trace", "run"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={scope === s}
            onClick={() => ((pending.current = undefined), setScope(s))}
            className={cn("px-2 cursor-pointer", s === "run" && "border-l border-border/40", scope === s ? "bg-primary/25 text-foreground" : "text-muted-foreground hover:bg-white/5")}
          >
            {s === "trace" ? "Whole trace" : "This run"}
          </button>
        ))}
      </div>
    </div>
  );
}
