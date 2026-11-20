import React, { useMemo, useState } from "react";
import type { Arc56Contract } from "@algorandfoundation/algokit-utils/types/app-arc56";
import { cn } from "src/lib/utils";
import type { SourceMapping } from "src/utils/arc56Source";
import { b64Hex, calledSub, decodeLog, decodeValue, failHint, failureReason, keyName, runMethod, type MethodName } from "src/utils/specNames";
import { shortStackName } from "src/utils/stackNames";
import { lineText, opName, stateAt, type CallLevel, type Frame, type Stepper } from "src/utils/traceStepper";
import type { AvmValue, TraceStep } from "src/utils/txnDevInfo";
import type { TraceSource } from "./useTraceSource";

/**
 * The debugger's names from ARC-56 specs: for a run whose program has a
 * matched spec (in the TypeScript or the TEAL view), the ABI method it was
 * called with, its subroutines, failure messages, state keys and values, and
 * logged events and return values. Without a spec, each shows nothing new.
 */

export type SpecNames = {
  spec: (f: Frame | undefined) => Arc56Contract | undefined;
  map: (f: Frame | undefined) => SourceMapping | undefined;
  method: (f: Frame | undefined) => MethodName | undefined;
};

export function useSpecNames(T: Stepper, src: TraceSource): SpecNames {
  return useMemo(() => {
    const at = (f: Frame | undefined) => (f?.hash ? src.srcs.get(f.hash) : undefined);
    const methods = new Map<number, MethodName | undefined>();
    return {
      spec: (f) => at(f)?.rec.arc56,
      map: (f) => at(f)?.map,
      method: (f) => {
        if (!f) return undefined;
        if (!methods.has(f.id)) {
          let m: MethodName | undefined;
          try {
            m = runMethod(f, at(f)?.rec.arc56);
          } catch {
            // A spec that doesn't read: no method.
          }
          methods.set(f.id, m);
        }
        return methods.get(f.id);
      },
    };
    // T: frames are rebuilt when budget runs arrive.
  }, [T, src.srcs]);
}

/** A run's ABI method, after its app: " · name(args)". */
export function RunMethod({ names, f }: { names: SpecNames; f: Frame }) {
  const m = names.method(f);
  if (!m) return null;
  return (
    <span className="text-muted-foreground" title={`ABI method ${m.signature}${m.method.desc ? `\n${m.method.desc}` : ""}`}>
      {" · "}
      {m.label}
    </span>
  );
}

/** A subroutine call's name: the spec's short name (full header on hover), else the TEAL label. */
export function SubName({ names, T, c }: { names: SpecNames; T: Stepper; c: Extract<CallLevel, { kind: "sub" }> }) {
  const sub = calledSub(names.map(c.frame), c.frame, T.seqS[c.pos]);
  if (!sub) return <span className="font-mono text-primary">{c.label}</span>;
  return (
    <span className="min-w-0 truncate font-mono text-primary" title={`${sub.full}\n(TEAL label ${c.label})`}>
      {sub.short}
    </span>
  );
}

/** A stack value's name from the .puya.map, shortened (the full name on hover). */
export function StackName({ name }: { name: string }) {
  return (
    <span className="mr-1.5 inline-block max-w-[55%] truncate align-bottom text-sky-300" title={`${name} (from the .puya.map)`}>
      {shortStackName(name)}
    </span>
  );
}

type Change = NonNullable<TraceStep["state-changes"]>[number];

/** A state key's name from the spec (the raw key on hover), else `fallback`. */
export function KeyName({ names, f, c, fallback }: { names: SpecNames; f: Frame; c: Change; fallback: React.ReactNode }) {
  const k = useMemo(() => keyName(names.spec(f), c["app-state-type"], c.key), [names, f, c]);
  if (!k) return <>{fallback}</>;
  return (
    <span className="text-foreground" title={`${k.full}${k.desc ? `\n${k.desc}` : ""}\nkey 0x${b64Hex(c.key)}`}>
      {k.name}
    </span>
  );
}

/**
 * A written state value decoded as its spec type, with a switch to the raw
 * value (`raw`); just `raw` where the spec gives no decoding.
 */
export function StateValue({ names, f, c, raw }: { names: SpecNames; f: Frame; c: Change; raw: React.ReactNode }) {
  const [showRaw, setShowRaw] = useState(false);
  const d = useMemo(() => {
    const spec = names.spec(f);
    const k = keyName(spec, c["app-state-type"], c.key);
    const text = decodeValue(spec, k?.valueType, c["new-value"]);
    return text === undefined ? undefined : { text, type: k!.valueType };
  }, [names, f, c]);
  if (!d) return <>{raw}</>;
  const toggle = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowRaw(!showRaw);
  };
  return (
    <>
      {showRaw ? raw : <span className="text-amber-200" title={d.type}>{d.text}</span>}
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(e)}
        title={showRaw ? `Show it decoded as ${d.type}` : "Show the raw value"}
        className="ml-1.5 rounded border border-border/50 px-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
      >
        {showRaw ? d.type : "raw"}
      </span>
    </>
  );
}

/**
 * What the spec says about the next op: the message it fails with, and on a
 * `log`, the event or return value it logs, decoded.
 */
export function OpHints({ names, f, s, top }: { names: SpecNames; f: Frame; s: TraceStep; top?: AvmValue }) {
  const map = names.map(f);
  const spec = names.spec(f);
  if (!map || !spec) return null;
  const pc = Number(s.pc);
  const text = lineText(f.prog, pc);
  const fail = failHint(map, pc, text, top);
  let log: ReturnType<typeof decodeLog>;
  if (opName(text) === "log") {
    try {
      log = decodeLog(spec, names.method(f), top);
    } catch {
      log = undefined;
    }
  }
  if (!fail && !log) return null;
  return (
    <>
      {fail ? (
        <div
          className={cn("break-all", fail.failure === "fails" ? "text-red-400" : "text-muted-foreground")}
          title="The failure message the ARC-56 spec gives for this op"
        >
          fails with: <span className="font-mono">{fail.message}</span>
          {fail.failure === "passes" ? <span className="text-muted"> · passes here</span> : fail.failure === "may fail" ? <span className="text-muted"> · if it fails</span> : null}
        </div>
      ) : null}
      {log ? (
        <div className="break-all text-muted-foreground">
          {log.kind === "event" ? "logs event " : `logs the return value of ${log.name}: `}
          {log.kind === "event" ? <span className="text-foreground">{log.name}</span> : null}
          <span className="font-mono text-amber-200">{log.kind === "event" ? `(${log.text})` : log.text}</span>
        </div>
      ) : null}
    </>
  );
}

/** Why run `f` failed, from its last op's message in its spec; undefined if it didn't, or the spec doesn't say. */
export function runFailure(names: SpecNames, T: Stepper, f: Frame): { message: string; pc: number } | undefined {
  const map = names.map(f);
  if (!map || !f.steps.length) return undefined;
  const st = stateAt(T, f, f.steps.length - 1);
  return failureReason(map, f, st.stack[st.stack.length - 1]);
}

/** A failed run's reason (runFailure). */
export function FailureReason({ r }: { r: { message: string; pc: number } }) {
  return (
    <div className="text-red-400">
      It failed at pc {r.pc}: <span className="font-mono">{r.message}</span>
    </div>
  );
}
