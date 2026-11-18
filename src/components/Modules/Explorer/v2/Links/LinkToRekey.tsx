import LinkToBlockTxn, { BlockTxn } from "./LinkToBlockTxn";

/**
 * The txn sets `acct`'s authorizer to `auth`: its rekey-to, or for a rekey back (`auth` is `acct`), a
 * rekey-to self or a close-out, which clears the authorizer.
 */
function setsAuth(t: BlockTxn, acct: string, auth: string): boolean {
  if (t.sender !== acct) return false;
  if (t.rekeyTo?.toString() === auth) return true;
  return auth === acct && !!t.paymentTransaction?.closeRemainderTo;
}

/** The txn, or one of its inner txns at any depth, sets the authorizer. */
function doesRekey(t: BlockTxn, acct: string, auth: string): boolean {
  return setsAuth(t, acct, auth) || !!t.innerTxns?.some((i) => doesRekey(i, acct, auth));
}

/**
 * The first (or with `last`, the last) round of a rekey pair: a click opens the block's first (or
 * last) top-level txn that set `acct`'s authorizer to `auth`, itself or by an inner txn. Its link,
 * and the fallback, is the block's txns.
 */
function LinkToRekey({
  acct,
  auth,
  round,
  last = false,
}: {
  acct: string;
  auth: string;
  round: number;
  last?: boolean;
}): JSX.Element {
  const matches = (t: BlockTxn) => doesRekey(t, acct, auth);
  const what = acct === auth ? "rekey back (or close-out)" : "rekey";
  return (
    <LinkToBlockTxn
      round={round}
      pick={(txns) => (last ? txns.findLast(matches) : txns.find(matches))}
      anchor={() => ""}
      href={`/block/${round}/transactions`}
      title={`The ${last ? "last" : "first"} ${what} of this pair, in block ${round}`}
    />
  );
}

export default LinkToRekey;
