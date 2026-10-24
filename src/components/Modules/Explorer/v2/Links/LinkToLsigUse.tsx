import { LogicSig } from "algosdk";
import { LsigUse, usedBy } from "src/hooks/useLsig";
import LinkToBlockTxn, { BlockTxn } from "./LinkToBlockTxn";

/**
 * The first (or with `last`, the last) round of a logic sig use: a click opens the block's first (or
 * last) txn the use authorized, at its logic sig. Its link, and the fallback, is the block's txns of
 * the sender.
 */
function LinkToLsigUse({ use, last = false }: { use: LsigUse; last?: boolean }): JSX.Element {
  const round = last ? use.lastRound : use.firstRound;
  const sender = usedBy(use);
  const matches = (t: BlockTxn) => {
    const logic = t.signature?.logicsig?.logic;
    return t.sender === sender && !!logic?.length && new LogicSig(logic).address().toString() === use.lsig;
  };
  return (
    <LinkToBlockTxn
      round={round}
      pick={(txns) => (last ? txns.findLast(matches) : txns.find(matches))}
      anchor={() => "#logicsig"}
      href={`/block/${round}/transactions?sender=${sender}`}
      title={`The ${last ? "last" : "first"} txn of this logic sig in block ${round}`}
    />
  );
}

export default LinkToLsigUse;
