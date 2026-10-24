import { lsigTemplate } from "src/utils/lsigTemplate";
import LinkToBlockTxn, { BlockTxn } from "./LinkToBlockTxn";

/**
 * A round a logic sig of `template` was used in: a click opens the block's first txn of the template
 * at its logic sig, or with `last` (for a last-used round) its last one.
 */
function LinkToTemplateUse({ round, template, last = false }: { round: number; template: string; last?: boolean }): JSX.Element {
  const matches = (t: BlockTxn) => {
    const logic = t.signature?.logicsig?.logic;
    return !!logic?.length && lsigTemplate(logic) === template;
  };
  return (
    <LinkToBlockTxn
      round={round}
      pick={(txns) => (last ? txns.findLast(matches) : txns.find(matches))}
      anchor={() => "#logicsig"}
      title={`The ${last ? "last" : "first"} txn of this template in block ${round}`}
    />
  );
}

export default LinkToTemplateUse;
