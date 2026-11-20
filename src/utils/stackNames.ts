import type { SourceMapping } from "./arc56Source";
import { lineText, opName, type Frame } from "./traceStepper";

/**
 * Names for the stack values from a `.puya.map`'s `pc_events`.
 *
 * An op's `stack_out` names the current subroutine's part of the stack after
 * it, bottom to top: the values above the frame pointer (a subroutine's
 * arguments are below it, and so is the caller's stack), or the whole stack
 * in the main program. So the names align with the top of the stack. Checked
 * against localnet traces of Escreg: at every op with a `stack_out`, it has
 * exactly as many names as values above the frame pointer.
 *
 * `stack_out` is sparse. Before an op whose previous op has none, there are
 * no names, rather than older ones carried forward, which would misalign
 * with the stack. Except for:
 * - a block's first op, whose `stack_in` names the stack before it;
 * - the op after a `retsub`, named by the `stack_out` of the `callsub` that
 *   returned there (the stack after the call);
 * - a subroutine's first op (just after its `callsub`): the callsub's
 *   `stack_out` is the stack after the call returns, so it names nothing;
 * - a run's end: after `return` there are no names, and after an op that
 *   failed, its `stack_out` would be the stack had it passed.
 */

const ENDS = new Set(["return", "err"]);
/** `callsub` is one byte and a two-byte offset: a subroutine returns to its pc + 3. */
const CALLSUB_LEN = 3;

/**
 * The names of the top of the stack before run `f`'s op i, bottom to top;
 * undefined where the map doesn't say, and at the run's end (i = steps.length).
 */
export function stackNamesAt(map: SourceMapping | undefined, f: Frame, i: number): string[] | undefined {
  if (!map?.stackOut || i <= 0 || i >= f.steps.length) return undefined;
  const prevPc = Number(f.steps[i - 1].pc);
  const prevOp = opName(lineText(f.prog, prevPc));
  const curPc = Number(f.steps[i].pc);
  if (prevOp === "callsub" || ENDS.has(prevOp)) return undefined;
  if (prevOp === "retsub") {
    const call = curPc - CALLSUB_LEN;
    return opName(lineText(f.prog, call)) === "callsub" ? map.stackOut.get(call) : undefined;
  }
  return map.stackOut.get(prevPc) ?? map.stackIn?.get(curPc);
}

/**
 * The name of each of `n` stack values (index 0 the bottom), from `names`
 * aligned to the top; undefined where there is none. More names than values
 * (a map that doesn't fit the run) name nothing.
 */
export function alignNames(names: string[] | undefined, n: number): (string | undefined)[] {
  const out: (string | undefined)[] = new Array(n).fill(undefined);
  if (!names?.length || names.length > n) return out;
  for (let k = 0; k < names.length; k++) out[n - names.length + k] = names[k];
  return out;
}

/**
 * A stack name as shown: without Puya's SSA versions (`appId#0` → `appId`,
 * `tmp%0#3` → `tmp%0`). The full name goes in a title.
 */
export const shortStackName = (name: string) => name.replace(/#\d+(?=$|\s|\))/g, "");
