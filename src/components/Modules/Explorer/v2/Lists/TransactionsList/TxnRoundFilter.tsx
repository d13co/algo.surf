import React from "react";
import { ListFilter, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Chip } from "src/components/v2/Chips";
import { useRound } from "src/hooks/useRound";
import { isPastRound, useTxnRound, withTxnRound } from "src/hooks/useTxnRound";
import Link from "../../Links/Link";
import LinkToBlock from "../../Links/LinkToBlock";

/** A transactions tab's round filter (see useTxnRound), with a link to the list without it. */
export default function TxnRoundFilter({ round }: { round: number }) {
  const { pathname, search } = useLocation();
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <ListFilter size={14} className="text-muted-foreground" />
      <Chip variant="success" className="gap-1">
        Round <LinkToBlock id={round} />
        <Link
          noStyle
          href={withTxnRound(`${pathname}${search}`, undefined)}
          title="Remove the filter"
          className="inline-flex -mr-1 hover:text-foreground"
        >
          <X size={12} />
        </Link>
      </Chip>
    </div>
  );
}

/**
 * A transactions tab's round filter, for its TransactionsList: the round, the
 * chip showing it, and what the list says when empty. `whose`: the record's
 * transactions, e.g. "this account".
 */
export function useTxnRoundFilter(whose: string): {
  txnRound: number | undefined;
  toolbar: React.ReactNode;
  emptyLabel: string | undefined;
} {
  const txnRound = useTxnRound();
  const { round } = useRound();
  if (txnRound === undefined) return { txnRound, toolbar: undefined, emptyLabel: undefined };
  return {
    txnRound,
    toolbar: <TxnRoundFilter round={txnRound} />,
    emptyLabel: isPastRound(txnRound, round)
      ? `Round ${txnRound} is after round ${round}, which this page shows`
      : `No transactions involving ${whose} in round ${txnRound}`,
  };
}
