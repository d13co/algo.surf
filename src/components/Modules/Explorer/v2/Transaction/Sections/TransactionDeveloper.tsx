import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { cn } from "src/lib/utils";
import { useGroup } from "src/hooks/useGroup";
import { useDevIncludes, useTxnDevInfo } from "src/hooks/useTxnDevInfo";
import { formatUnits } from "src/utils/formatUnits";
import { explorerInnerPath } from "src/utils/txnStateChanges";
import {
  AvmValue,
  budgetAdded,
  DevInclude,
  ExecTrace,
  ProgramLines,
  isOpUp,
  SCBudgetRun,
  SCTxnReads,
  summarizeBudget,
  TraceStep,
} from "src/utils/txnDevInfo";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import { Chip } from "src/components/v2/Chips";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/v2/ui/tooltip";
import LinkToApplication from "../../Links/LinkToApplication";
import LinkToAccount from "../../Links/LinkToAccount";
import { Pending } from "../../Versions/ObjectRoundDiff";

/** Trace steps shown before "show more". */
const STEP_PAGE = 300;

const grouped = (v: number | bigint) => formatUnits(v, 0);

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>;
}

function ErrorLine({ error }: { error: unknown }) {
  return <div className="text-sm text-red-400">{(error as Error).message}</div>;
}

/** Where in the transaction a path is: "This call", or "Inner 2/1". */
function pathLabel(path: number[]): string {
  return path.length > 1 ? `Inner ${explorerInnerPath(path)}` : "This call";
}

// ---------------------------------------------------------------------------
// Opcode budget

const kindLabel = { approval: "Approval", clear: "Clear state", "logic-sig": "Logic sig" };

function Meter({ used, of }: { used: number; of: number }) {
  const pct = of ? Math.min(100, (used / of) * 100) : 0;
  return (
    <div className="h-1.5 w-full max-w-xs rounded bg-border overflow-hidden">
      <div className={cn("h-full", pct > 90 ? "bg-red-400" : pct > 70 ? "bg-yellow-500" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function BudgetTab({ runs, topIndex, txids, partial }: { runs: SCBudgetRun[]; topIndex?: number; txids: string[]; partial: boolean }) {
  const groupSize = txids.length;
  // A payset index's position in the group, from its top-level run's txid.
  const position = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of runs) if (r.txid && txids.includes(r.txid)) m.set(Number(r.path[0]), txids.indexOf(r.txid) + 1);
    return m;
  }, [runs, txids]);
  const label = (r: SCBudgetRun, mine: boolean) => {
    if (mine) return pathLabel(r.path);
    const top = `Transaction ${position.get(Number(r.path[0])) ?? "?"}`;
    return r.path.length > 1 ? `${top} › inner ${explorerInnerPath(r.path)}` : top;
  };
  const s = useMemo(() => (topIndex === undefined ? undefined : summarizeBudget(runs, topIndex)), [runs, topIndex]);
  const group = useMemo(() => summarizeBudget(runs, -1), [runs]);
  if (!runs.length) return <Muted>No programs ran in this transaction{groupSize > 1 ? "'s group" : ""}.</Muted>;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        {s && (s.appUsed || s.clearUsed || s.lsigUsed) ? (
          <div>
            <div className="text-muted-foreground mb-1">This transaction</div>
            {s.appUsed ? <div>{grouped(s.appUsed)} app budget{s.opUps ? <span className="text-muted-foreground">, {s.opUps} op-up {s.opUps === 1 ? "call" : "calls"}</span> : null}</div> : null}
            {s.clearUsed ? <div>{grouped(s.clearUsed)} app budget in clear state programs</div> : null}
            {s.lsigUsed ? <div>{grouped(s.lsigUsed)} logic sig budget</div> : null}
          </div>
        ) : null}
        {group.groupAppBudget && !partial ? (
          <div>
            <div className="text-muted-foreground mb-1">
              {groupSize > 1 ? (group.appPooled ? "Group's app budget" : "Group's app budgets, each call its own") : "App budget"}
            </div>
            <div className="mb-1.5">
              {grouped(group.groupAppUsed)} of {grouped(group.groupAppBudget)} used
              <span className="text-muted-foreground"> ({Math.round((group.groupAppUsed / group.groupAppBudget) * 100)}%)</span>
            </div>
            <Meter used={group.groupAppUsed} of={group.groupAppBudget} />
          </div>
        ) : null}
        {group.lsigPool && !partial ? (
          <div>
            <div className="text-muted-foreground mb-1">
              {groupSize > 1 ? (group.lsigPooled ? "Group's logic sig budget" : "Group's logic sig budgets, each its own") : "Logic sig budget"}
            </div>
            <div className="mb-1.5">
              {grouped(group.groupLsigUsed)} of {grouped(group.lsigPool)} used
              <span className="text-muted-foreground"> ({Math.round((group.groupLsigUsed / group.lsigPool) * 100)}%)</span>
            </div>
            <Meter used={group.groupLsigUsed} of={group.lsigPool} />
          </div>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 pr-3 font-normal">Transaction</th>
              <th className="py-1.5 pr-3 font-normal">Program</th>
              <th className="py-1.5 pr-3 font-normal">App</th>
              <th className="py-1.5 pr-3 font-normal text-right">Cost</th>
              <th className="py-1.5 font-normal text-right" title="What it could still spend when it started and when it ended">Budget left</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => {
              const mine = Number(r.path[0]) === topIndex;
              const opUp = isOpUp(r);
              const added = r.kind === "approval" ? budgetAdded(r, runs) : 0;
              return (
                <tr key={i} className={cn("border-b border-border", !mine && "text-muted-foreground")}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {label(r, mine)}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {kindLabel[r.kind]}
                    {opUp ? <Chip className="ml-2">op-up</Chip> : null}
                    {r.failed ? <Chip className="ml-2 border-red-400 text-red-400">failed</Chip> : null}
                  </td>
                  <td className="py-1.5 pr-3">
                    {r["app-id"] === undefined ? null : Number(r["app-id"]) ? <LinkToApplication id={Number(r["app-id"])} /> : <span className="text-muted-foreground">new app</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">{grouped(r.cost)}</td>
                  <td className="py-1.5 text-right font-mono whitespace-nowrap">
                    {grouped(r["budget-before"])} → {grouped(r["budget-after"])}
                    {r.kind === "clear" ? (
                      <div className="font-sans text-xs text-muted-foreground" title="A clear state program may spend at most this; what it spends comes out of the group's budget too">
                        its own cap
                      </div>
                    ) : null}
                    {added > 0 ? <div className="font-sans text-xs text-muted-foreground">+{grouped(added)} from inner calls</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {partial ? (
        <Muted>Only this transaction's programs: its group's transactions couldn't be read, so the group's budget isn't shown.</Muted>
      ) : groupSize > 1 ? (
        <Muted>The group's other transactions are dimmed{group.appPooled ? ": they share the budget" : ""}.</Muted>
      ) : null}
      {runs.some((r) => r.failed) ? (
        <Muted>A failed clear state program's changes are rolled back, but the block keeps the clear: the account is opted out anyway.</Muted>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State reads

const typeLabel = { g: "global", l: "local", b: "box" };

function TealValueView({ v }: { v: { type: number; bytes?: string; uint?: number | bigint } }) {
  if (v.type === 2) return <span className="font-mono">{grouped(v.uint ?? 0)}</span>;
  return v.bytes ? <MultiFormatViewer view="auto" includeNum="auto" value={v.bytes} side="left" /> : <span className="font-mono">""</span>;
}

function ReadsTab({ reads, topIndex }: { reads: SCTxnReads[]; topIndex?: number }) {
  const mine = reads.filter((r) => Number(r.path[0]) === topIndex && r.reads.length);
  if (!mine.length) return <Muted>It read no app state.</Muted>;
  return (
    <div className="space-y-4">
      {mine.map((t) => (
        <div key={t.path.join("/")}>
          <div className="text-sm text-muted-foreground mb-1">
            {pathLabel(t.path)} · {t.reads.length.toLocaleString()} {t.reads.length === 1 ? "key" : "keys"}
          </div>
          <div className="text-sm">
            {t.reads.map((r, i) => (
              <div key={i} className="border-b border-border py-1.5 grid grid-cols-1 md:grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-x-4 gap-y-1">
                {/* The key on its own line, what it belongs to under it, so a long key doesn't wrap under the chips. */}
                <div className="min-w-0">
                  <div className="min-w-0 truncate">
                    {r.key ? <MultiFormatViewer view="auto" value={r.key} side="left" /> : <span className="text-muted-foreground italic">(empty key)</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>{typeLabel[r["app-state-type"]]}</span>
                    <span>·</span>
                    <span>
                      app <LinkToApplication id={Number(r["app-id"])} />
                    </span>
                    {r.account ? (
                      <>
                        <span>·</span>
                        <span className="min-w-0">
                          <LinkToAccount address={r.account} strip={9} copySize="s" />
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="min-w-0 break-words text-[13px] md:pt-px">
                  {!r.exists ? (
                    <span className="text-muted-foreground">doesn't exist</span>
                  ) : r.value ? (
                    <TealValueView v={r.value} />
                  ) : r["app-state-type"] === "b" ? (
                    // The node leaves a zero length out: an empty box.
                    <span className="text-muted-foreground">{(r.length ?? 0).toLocaleString()} bytes</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opcode traces

/** A stack or scratch value, short: an integer grouped, bytes as hex (whole on hover). */
function Avm({ v }: { v: AvmValue }) {
  if (v.type === 2) return <span className="text-sky-300">{grouped(v.uint ?? 0)}</span>;
  const hex = Buffer.from(v.bytes ?? "", "base64").toString("hex");
  return (
    <span className="text-amber-300" title={`0x${hex}\nbase64: ${v.bytes ?? ""}`}>
      0x{hex.length > 24 ? `${hex.slice(0, 24)}…` : hex}
    </span>
  );
}

function StepEffects({ s }: { s: TraceStep }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {s["stack-pop-count"] ? <span className="text-red-400">−{s["stack-pop-count"]}</span> : null}
      {s["stack-additions"]?.map((v, i) => (
        <span key={`a${i}`}>
          +<Avm v={v} />
        </span>
      ))}
      {s["scratch-changes"]?.map((c) => (
        <span key={`s${c.slot}`}>
          <span className="text-muted-foreground">s[{c.slot}]=</span>
          <Avm v={c["new-value"]} />
        </span>
      ))}
      {s["state-changes"]?.map((c, i) => (
        <span key={`c${i}`} className="text-green-400">
          {typeLabel[c["app-state-type"]]} {c.operation === "d" ? "del" : "put"} {Buffer.from(c.key, "base64").toString("latin1").replace(/[^\x20-\x7e]/g, "·")}
          {c["new-value"] ? (
            <>
              {" "}
              = <Avm v={c["new-value"]} />
            </>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** One program's trace: each opcode with its line, its effects, and the inner transactions it ran. */
function ProgramTrace({ steps, program, inners, label, programs }: {
  steps: TraceStep[];
  program?: ProgramLines;
  inners?: ExecTrace[];
  label: string;
  programs: Record<string, ProgramLines>;
}) {
  const [shown, setShown] = useState(STEP_PAGE);
  const text = useMemo(() => new Map((program?.lines ?? []).flatMap((l) => (l.pc === undefined ? [] : [[l.pc, l.text]]))), [program]);
  return (
    <div className="font-mono text-[12px] leading-5 overflow-x-auto">
      {steps.slice(0, shown).map((s, i) => (
        <React.Fragment key={i}>
          <div className="grid grid-cols-[4ch_5ch_minmax(18ch,32ch)_1fr] gap-x-3 whitespace-nowrap hover:bg-white/5">
            <span className="text-right text-muted-foreground">{i + 1}</span>
            <span className="text-right text-muted-foreground">{s.pc}</span>
            <span className="truncate" title={text.get(s.pc)}>{text.get(s.pc) ?? <span className="text-muted-foreground">pc {s.pc}</span>}</span>
            <StepEffects s={s} />
          </div>
          {s["spawned-inners"]?.map((k) =>
            inners?.[k] ? (
              <InnerTrace key={k} trace={inners[k]} label={`${label}${label ? "/" : ""}${k + 1}`} programs={programs} />
            ) : null,
          )}
        </React.Fragment>
      ))}
      {steps.length > shown ? (
        <button type="button" className="text-primary hover:underline cursor-pointer font-sans text-xs mt-1" onClick={() => setShown(shown + STEP_PAGE * 3)}>
          Show {Math.min(STEP_PAGE * 3, steps.length - shown).toLocaleString()} more of {(steps.length - shown).toLocaleString()} opcodes
        </button>
      ) : null}
    </div>
  );
}

function InnerTrace({ trace, label, programs }: { trace: ExecTrace; label: string; programs: Record<string, ProgramLines> }) {
  const [open, setOpen] = useState(false);
  const steps = trace["approval-program-trace"] ?? trace["clear-state-program-trace"];
  const Toggle = open ? ChevronDown : ChevronRight;
  return (
    <div className="my-0.5 ml-[10ch] border-l-2 border-border pl-3 font-sans">
      <button type="button" className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer" onClick={() => setOpen(!open)}>
        <Toggle className="h-3.5 w-3.5" />
        Inner {label}
        {steps ? <span className="text-muted-foreground"> · {steps.length.toLocaleString()} opcodes</span> : <span className="text-muted-foreground"> · no program</span>}
      </button>
      {open ? <ExecTraceView trace={trace} label={label} programs={programs} /> : null}
    </div>
  );
}

/** A transaction's logic sig and app program traces, its inner transactions' nested where they ran. */
function ExecTraceView({ trace, label, programs }: { trace: ExecTrace; label: string; programs: Record<string, ProgramLines> }) {
  const parts: { title: string; steps: TraceStep[]; hash?: string; inners?: ExecTrace[] }[] = [];
  if (trace["logic-sig-trace"]) parts.push({ title: "Logic sig", steps: trace["logic-sig-trace"], hash: trace["logic-sig-hash"] });
  if (trace["approval-program-trace"]) {
    parts.push({ title: "Approval program", steps: trace["approval-program-trace"], hash: trace["approval-program-hash"], inners: trace["inner-trace"] });
  }
  if (trace["clear-state-program-trace"]) {
    parts.push({ title: "Clear state program", steps: trace["clear-state-program-trace"], hash: trace["clear-state-program-hash"], inners: trace["inner-trace"] });
  }
  return (
    <div className="space-y-3 mt-1">
      {trace["clear-state-rollback"] ? (
        <div className="text-sm text-red-400">
          The clear state program failed, so its changes were rolled back; the local state was cleared anyway.
          {trace["clear-state-rollback-error"] ? <div className="font-mono text-xs mt-0.5">{trace["clear-state-rollback-error"]}</div> : null}
        </div>
      ) : null}
      {parts.map((p) => (
        <div key={p.title}>
          <div className="text-xs text-muted-foreground mb-1">
            {p.title} · {p.steps.length.toLocaleString()} opcodes
            {p.hash && !programs[p.hash] ? " · no disassembly" : ""}
          </div>
          <ProgramTrace steps={p.steps} program={p.hash ? programs[p.hash] : undefined} inners={p.inners} label={label} programs={programs} />
        </div>
      ))}
      {!parts.length ? <Muted>No program ran.</Muted> : null}
    </div>
  );
}

/** What a trace line's columns and colours mean, as StepEffects and Avm draw them. */
function TraceLegend() {
  const row = (sample: React.ReactNode, text: string) => (
    <div className="grid grid-cols-[9ch_1fr] gap-x-3">
      <span className="font-mono">{sample}</span>
      <span>{text}</span>
    </div>
  );
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="What the trace shows" className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help">
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white border-border max-w-sm text-xs space-y-1 p-3">
          <div className="mb-1.5">Each line: step, pc, the opcode, then what it did.</div>
          {row(<span className="text-red-400">−2</span>, "values it popped off the stack")}
          {row(<span>+<span className="text-sky-300">1,000</span></span>, "an integer it pushed")}
          {row(<span>+<span className="text-amber-300">0x6b65…</span></span>, "bytes it pushed, as hex (hover for all of it, and base64)")}
          {row(<span><span className="text-muted-foreground">s[3]=</span><span className="text-sky-300">7</span></span>, "a scratch slot it wrote")}
          {row(<span className="text-green-400">global put</span>, "app state it wrote or deleted (global, local, box)")}
          {row(<span className="text-primary">› Inner 2</span>, "an inner transaction it ran: open it for its own trace")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Fetched when the tab opens: traces are large. */
function TracesTab({ round, txId }: { round: number; txId: string }) {
  const { data, error, isLoading } = useTxnDevInfo(round, [txId], ["trace"], true);
  if (error) return <ErrorLine error={error} />;
  if (isLoading || !data) return <Pending className="h-5 w-48" />;
  const trace = data.traces?.find((t) => t.txid === txId)?.["exec-trace"];
  if (!trace) return <Muted>No program ran.</Muted>;
  return (
    <div>
      <div className="flex justify-end -mb-5">
        <TraceLegend />
      </div>
      <ExecTraceView trace={trace} label="" programs={Object.fromEntries((data.programs ?? []).map((p) => [p.hash, p]))} />
    </div>
  );
}

// ---------------------------------------------------------------------------

const TAB_NAMES: Record<DevInclude, string> = { budget: "Opcode budget", reads: "State reads", trace: "Opcode traces" };

/**
 * For developers, at the end of a transaction page: what its programs did,
 * from the time-travel node's re-evaluation of the block. Each program's
 * opcode cost against the group's pool, the app state it read, and opcode
 * traces. Shown where the node serves any of them.
 */
export default function TransactionDeveloper({ round, txId, groupId }: { round: number; txId: string; groupId?: string }): JSX.Element | null {
  const includes = useDevIncludes();
  const [tab, setTab] = useState<DevInclude | undefined>();
  // The group's budget is one pool: ask for all its transactions.
  // Without the group (its read failed), the transaction's own runs.
  const { data: groupInfo, isLoading: groupLoading } = useGroup(groupId ?? "", round);
  const groupTxids = (groupInfo?.transactions ?? []).map((t) => t.id ?? "").filter(Boolean);
  const partial = !!groupId && !groupTxids.includes(txId);
  const txids = groupId && !partial ? groupTxids : [txId];
  const summary = (includes ?? []).filter((k): k is "budget" | "reads" => k === "budget" || k === "reads");
  const { data, error, isLoading } = useTxnDevInfo(round, txids, summary, !!includes?.length && (!groupId || !groupLoading));
  const topIndex = useTopIndex(data?.budget, data?.reads, txId);

  if (!includes?.length) return null;
  const active = tab && includes.includes(tab) ? tab : includes[0];
  const body = (content: (d: NonNullable<typeof data>) => React.ReactNode) =>
    error ? <ErrorLine error={error} /> : isLoading || !data ? <Pending className="h-5 w-48" /> : content(data);

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <span className="text-muted-foreground">Developer</span>
        <span className="text-xs text-muted-foreground">from the node's re-evaluation of block {round.toLocaleString()}</span>
      </div>
      <TabsUnderline
        className="gap-4"
        value={active}
        onValueChange={(v) => setTab(v as DevInclude)}
        tabs={includes.map((k) => ({
          name: TAB_NAMES[k],
          value: k,
          content:
            k === "budget" ? (
              body((d) => <BudgetTab runs={d.budget ?? []} topIndex={topIndex} txids={txids} partial={partial} />)
            ) : k === "reads" ? (
              body((d) => <ReadsTab reads={d.reads ?? []} topIndex={topIndex} />)
            ) : (
              <TracesTab round={round} txId={txId} />
            ),
        }))}
      />
    </div>
  );
}

/** The transaction's payset index, from any entry that names it. */
function useTopIndex(budget: SCBudgetRun[] | undefined, reads: SCTxnReads[] | undefined, txId: string): number | undefined {
  return useMemo(() => {
    const hit = budget?.find((r) => r.txid === txId) ?? reads?.find((r) => r.txid === txId);
    return hit ? Number(hit.path[0]) : undefined;
  }, [budget, reads, txId]);
}
