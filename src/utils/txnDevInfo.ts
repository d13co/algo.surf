import type { TTInt } from "./timeTravel";
import type { SCStateType, SCTealValue } from "./txnStateChanges";

/**
 * What a transaction's programs did, for developers, from dtalgod's
 * `txn/state-changes` with `include=budget`, `reads` or `trace`: each
 * program's opcode cost, the app state each transaction read, and opcode
 * traces as simulate gives them. Exact for any transaction of the round, as
 * the node re-evaluates the whole block.
 *
 * Requested by getTxnDevInfo (timeTravel.ts), through dt-algosdk and nodeJson.
 */

/**
 * One program run: an approval or clear state program, or a logic sig, in
 * execution order; a group's logic sigs first, as the node checks them
 * before it runs the group.
 */
export type SCBudgetRun = {
  /** As in `txns`: the payset index, then 0-based inner indexes. */
  path: number[];
  /** Top-level transactions only. */
  txid?: string;
  kind: "approval" | "clear" | "logic-sig";
  "app-id"?: TTInt;
  /** The program's own cost; its inner app calls are their own runs. */
  cost: number;
  /**
   * What it could still spend when it started and when it ended: the group's
   * pool where budgets pool (logic sigs: the group's logic sig pool), else its
   * own. Inner app calls add to the pool while it runs, so `budget-after` can
   * exceed `budget-before` − `cost`.
   */
  "budget-before": number;
  "budget-after": number;
  /** A clear state program that rejected or failed; the block keeps its clear. Nothing else in a block fails. */
  failed?: boolean;
};

/**
 * A key a transaction read (app_global_get(_ex), app_local_get(_ex), box_get,
 * box_extract, box_len), first read only, with what it read: for global and
 * local state the value, for a box its length.
 */
export type SCRead = {
  "app-id": TTInt;
  "app-state-type": SCStateType;
  /** Local state only. */
  account?: string;
  key: string;
  exists: boolean;
  /** Global and local state, where it exists. */
  value?: SCTealValue;
  /** Boxes, where it exists. */
  length?: number;
};

/** What one transaction read itself (not its inner transactions), in first-read order. */
export type SCTxnReads = { path: number[]; txid?: string; reads: SCRead[] };

/** simulate's AvmValue: type 1 is bytes, 2 is uint. */
export type AvmValue = { type: number; bytes?: string; uint?: TTInt };

/** One opcode of a trace, as simulate's SimulationOpcodeTraceUnit. */
export type TraceStep = {
  pc: number;
  "stack-pop-count"?: number;
  "stack-additions"?: AvmValue[];
  "scratch-changes"?: { slot: number; "new-value": AvmValue }[];
  "state-changes"?: {
    "app-state-type": SCStateType;
    operation: "w" | "d";
    key: string;
    account?: string;
    "new-value"?: AvmValue;
    "app-id"?: TTInt;
  }[];
  /** Indexes into the transaction's `inner-trace` of the inner transactions this opcode (itxn_submit) ran. */
  "spawned-inners"?: number[];
};

/** A transaction's programs' traces, as simulate's SimulationTransactionExecTrace. */
export type ExecTrace = {
  "approval-program-hash"?: string;
  "approval-program-trace"?: TraceStep[];
  "clear-state-program-hash"?: string;
  "clear-state-program-trace"?: TraceStep[];
  "clear-state-rollback"?: boolean;
  "clear-state-rollback-error"?: string;
  "logic-sig-hash"?: string;
  "logic-sig-trace"?: TraceStep[];
  "inner-trace"?: ExecTrace[];
};

/** A program's disassembly: every line, with its pc where it starts an op. */
export type ProgramLines = { lines: { pc?: number; text: string }[] };

export type SCDevRound = {
  round: number;
  budget?: SCBudgetRun[];
  reads?: SCTxnReads[];
  /** One per top-level transaction of the traced transaction's group. */
  traces?: { txid: string; "exec-trace": ExecTrace }[];
  /** The traced programs' disassemblies; `hash` (base64) as the exec traces name them. */
  programs?: (ProgramLines & { hash: string })[];
};

export type DevInclude = "budget" | "reads" | "trace";

// ---------------------------------------------------------------------------
// Budget

export type BudgetSummary = {
  /** The transaction's approval programs, its inner app calls' included: what it took from the pool. */
  appUsed: number;
  /** Its clear state programs', which have a budget of their own. */
  clearUsed: number;
  lsigUsed: number;
  /** All the runs' approval programs (the group's, when the runs are). */
  groupAppUsed: number;
  /** What they could spend in all: what they used plus what the last one left. */
  groupAppBudget: number;
  /** The group's logic sig pool, and what its logic sigs used. */
  lsigPool?: number;
  groupLsigUsed: number;
  /** The transaction's inner app calls that did next to nothing: called for their budget (op-ups). */
  opUps: number;
};

/** An op-up's approval program: little more than `int 1`. */
export const OP_UP_COST = 4;

const sum = (rs: SCBudgetRun[]) => rs.reduce((t, r) => t + r.cost, 0);

export function isOpUp(r: SCBudgetRun): boolean {
  return r.path.length > 1 && r.kind === "approval" && r.cost <= OP_UP_COST;
}

/**
 * What a transaction's programs spent, and its group's: `runs` are the
 * group's, `topIndex` the transaction's payset index (-1 for the group
 * alone). Clear state programs are left out of the pool throughout: their
 * budget is isolated (each gets MaxAppProgramCost of its own).
 */
export function summarizeBudget(runs: SCBudgetRun[], topIndex: number): BudgetSummary {
  const own = runs.filter((r) => Number(r.path[0]) === topIndex);
  const approvals = runs.filter((r) => r.kind === "approval");
  const lsigs = runs.filter((r) => r.kind === "logic-sig");
  // The last top-level one ends last: inner programs end inside theirs.
  const last = approvals.filter((r) => r.path.length === 1).pop();
  return {
    appUsed: sum(own.filter((r) => r.kind === "approval")),
    clearUsed: sum(own.filter((r) => r.kind === "clear")),
    lsigUsed: sum(own.filter((r) => r.kind === "logic-sig")),
    groupAppUsed: sum(approvals),
    groupAppBudget: last ? sum(approvals) + last["budget-after"] : 0,
    lsigPool: lsigs[0]?.["budget-before"],
    groupLsigUsed: sum(lsigs),
    opUps: own.filter(isOpUp).length,
  };
}

/** What a program's inner app calls added to the budget while it ran: what it ended with, beyond what it and they spent. */
export function budgetAdded(run: SCBudgetRun, runs: SCBudgetRun[]): number {
  const under = runs.filter(
    (r) => r.kind === "approval" && r.path.length > run.path.length && run.path.every((x, i) => Number(r.path[i]) === Number(x)),
  );
  return run["budget-after"] - run["budget-before"] + run.cost + sum(under);
}
