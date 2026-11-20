import React, { useEffect, useRef, useState } from "react";
import { cn } from "src/lib/utils";
import { AVM_LATEST, avmOpsLoaded, describe, loadAvmOps, modeText, signature, type AvmOps, type OpDesc } from "src/utils/avmOps";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/v2/ui/tooltip";

/** The opcode reference: undefined until its chunk has loaded (which this starts), null if it couldn't be. */
export function useAvmOps(): AvmOps | undefined | null {
  const [ops, setOps] = useState<AvmOps | undefined | null>(avmOpsLoaded);
  useEffect(() => {
    if (ops !== undefined) return;
    let live = true;
    loadAvmOps().then(
      (o) => live && setOps(o),
      () => live && setOps(null),
    );
    return () => {
      live = false;
    };
  }, [ops]);
  return ops;
}

/** Inline code in a doc: `addw` → monospace. */
function DocText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="font-mono text-foreground">
            {p.slice(1, -1)}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** An op's reference: its stack signature, doc, cost and version, and the fields its line names. */
export function OpDoc({ d, full }: { d: OpDesc; full?: boolean }) {
  const [more, setMore] = useState(false);
  const mode = modeText(d.op.mode);
  const sig = signature(d);
  return (
    <div className="space-y-1">
      <div className="font-mono text-muted-foreground break-words">
        <span className="text-foreground">{d.name}</span>
        {d.op.imm.length ? <span> {d.op.imm.map((m) => m[0]).join(" ")}</span> : null}
        {sig ? (
          <>
            <span className="text-muted"> · </span>
            {sig}
          </>
        ) : null}
      </div>
      <div className="text-foreground/90">
        <DocText text={d.op.doc} />
      </div>
      {d.fields.map((f) => (
        <div key={f.imm} className="text-muted-foreground">
          <span className="font-mono text-foreground">{f.name}</span>
          {f.type !== "none" ? `: ${f.type}` : ""}
          {f.doc ? <> · <DocText text={f.doc} /></> : null}
          {f.v > d.op.v ? <span className="text-muted"> · since v{f.v}</span> : null}
        </div>
      ))}
      {d.op.extra ? (
        full || more ? (
          <div className="whitespace-pre-line text-muted-foreground">
            <DocText text={d.op.extra} />
          </div>
        ) : (
          <button type="button" className="text-primary hover:underline cursor-pointer" onClick={() => setMore(true)}>
            More…
          </button>
        )
      ) : null}
      <div className="text-muted">
        <span title={`As of AVM v${AVM_LATEST}: a few ops cost differently in earlier versions`}>cost {d.cost}</span> · since v{d.op.v}
        {mode ? ` · ${mode}` : ""} · {d.op.group}
      </div>
    </div>
  );
}

function OpTip({ text }: { text: string }) {
  const ops = useAvmOps();
  if (ops === null) return <span className="text-muted">The opcode reference couldn't be loaded.</span>;
  if (!ops) return <span className="text-muted">Loading…</span>;
  const d = describe(ops, text);
  if (!d) return <span className="text-muted">No reference for this op.</span>;
  return <OpDoc d={d} full />;
}

/**
 * An opcode with its reference on hover. The tooltip is only set up once the
 * op is first hovered (a program can run to thousands of lines), and opens
 * after a short pause so moving across the code doesn't flash it. It stays
 * open while the pointer is in it, to scroll or select its text.
 */
export function OpToken({ text, children }: { text: string; children: React.ReactNode }) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  const el = useRef<HTMLSpanElement | null>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const enter = () => {
    setArmed(true);
    loadAvmOps().catch(() => undefined);
    window.clearTimeout(timer.current);
    // Arming swaps the span for one inside the tooltip's trigger, which gets
    // no pointerenter (nor, if the pointer has already moved off, a
    // pointerleave): open only if the pointer is still on it.
    timer.current = window.setTimeout(() => setOpen(!!el.current?.matches(":hover")), 300);
  };
  const close = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };
  // A moment to move into the tooltip before it closes.
  const leave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 150);
  };
  const stay = () => window.clearTimeout(timer.current);
  // title="": no line's own title on top of this one.
  const span = (
    <span ref={el} title="" className="text-foreground cursor-help" onPointerEnter={enter} onPointerLeave={leave}>
      {children}
    </span>
  );
  if (!armed) return span;
  return (
    <TooltipProvider>
      {/* Controlled: it opens on the pause above; Radix may close it (Escape, a click). */}
      <Tooltip open={open} onOpenChange={(o) => (o ? undefined : close())}>
        <TooltipTrigger asChild>{span}</TooltipTrigger>
        {/* In the body: a line skips paint out of view (content-visibility), which would clip it. */}
        <TooltipPrimitive.Portal>
          <TooltipContent
            side="bottom"
            align="start"
            onPointerEnter={stay}
            onPointerLeave={leave}
            className="max-h-[var(--radix-tooltip-content-available-height)] max-w-md overflow-auto whitespace-normal bg-black p-3 font-sans text-xs text-white border-border"
          >
            <OpTip text={text} />
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * A disassembly line, coloured: the opcode (its reference on hover, with
 * `tip`), numbers, hex, branch labels and comments. `short` cuts long hex
 * constants, for views of one line's width.
 */
export function Code({ text, tip, short }: { text: string; tip?: boolean; short?: boolean }) {
  if (/^\s*[A-Za-z_][\w.]*:\s*$/.test(text)) return <span className="text-primary">{text}</span>;
  if (/^\s*(#pragma|\/\/)/.test(text)) return <span className="text-muted">{text}</span>;
  const ci = text.indexOf(" //");
  const body = ci >= 0 ? text.slice(0, ci) : text;
  const comment = ci >= 0 ? text.slice(ci) : "";
  const parts = body.split(/(\s+)/);
  const first = parts.findIndex((p) => p.trim());
  const branch = /^(b|bz|bnz|callsub|match|switch)$/.test(parts[first] ?? "");
  return (
    <>
      {parts.map((p, i) => {
        if (i === first) return tip ? <OpToken key={i} text={text}>{p}</OpToken> : <span key={i} className="text-foreground">{p}</span>;
        if (!p.trim()) return p;
        if (/^0x[0-9a-fA-F]*$/.test(p)) return <span key={i} className="text-amber-300">{short && p.length > 70 ? `${p.slice(0, 70)}…` : p}</span>;
        if (/^-?\d+$/.test(p)) return <span key={i} className="text-sky-300">{p}</span>;
        if (branch) return <span key={i} className="text-primary">{p}</span>;
        return <span key={i} className="text-muted-foreground">{p}</span>;
      })}
      {comment ? <span className="text-muted">{comment}</span> : null}
    </>
  );
}

/** A whole disassembly, a line per row, its ops' references on hover. */
export function TealListing({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return (
    <div className={cn("overflow-auto p-4 font-mono text-[13px] leading-5 whitespace-pre", className)}>
      {lines.map((l, i) => (
        // Lines out of view skip layout and paint. As wide as their text, so
        // the paint containment that comes with that doesn't clip long ones.
        <div key={i} className="w-max min-w-full [content-visibility:auto] [contain-intrinsic-size:auto_20px]">
          {l ? <Code text={l} tip /> : "​"}
        </div>
      ))}
    </div>
  );
}
