import React from "react";
import dateFormat from "dateformat";
import { useAccountFunding } from "src/hooks/useAccountFunding";
import type { FundingPayment } from "src/utils/accountFunding";
import { useBlockHeader } from "src/hooks/useBlock";
import { useRound } from "src/hooks/useRound";
import { formatDate } from "src/components/v2/MultiDateViewer";
import { TIMESTAMP_DISPLAY_FORMAT } from "src/packages/core-sdk/constants";
import { microalgosToAlgos } from "src/utils/common";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToBlock from "../Links/LinkToBlock";

/** "(x ago)", its full date and block in the title. */
function Ago({ round, timestamp }: { round: number; timestamp?: number }): JSX.Element | null {
  const { data: header } = useBlockHeader(timestamp === undefined ? round : 0);
  const ts = timestamp ?? (header?.timestamp ? Number(header.timestamp) : undefined);
  if (!ts) return null;
  return (
    <span className="text-muted-foreground" title={`${dateFormat(new Date(ts * 1000), TIMESTAMP_DISPLAY_FORMAT)}, block ${round}`}>
      ({formatDate(ts, "relative")})
    </span>
  );
}

const algo = (micro: bigint) => `${microalgosToAlgos(Number(micro)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ALGO`;

/**
 * "<label> <funder> (x ago)", the funder linked to the funding transaction;
 * the round alone when no payment was found (e.g. the indexer is down).
 */
function FundedBy({
  by,
  at,
  round,
  timestamp,
  payments,
  loading,
}: {
  /** The words before the funder ("By"), and before the round when no payment was found ("At block"). */
  by: string;
  at: string;
  round: number;
  timestamp?: number;
  payments?: FundingPayment[];
  loading: boolean;
}): JSX.Element {
  if (loading) return <div className="h-5 w-48 rounded bg-muted animate-pulse" />;
  const [first, ...more] = payments ?? [];
  if (!first) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5">
        <span>
          {at} <LinkToBlock id={round} />
        </span>
        <Ago round={round} timestamp={timestamp} />
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 min-w-0">
      <span>{by}</span>
      <span className="min-w-0 max-w-full">
        <LinkToAccount
          address={first.sender}
          strip={9}
          copy="none"
          href={`/transaction/${first.txId}`}
          note={`${algo(first.amount)}${first.inner ? " (inner payment)" : ""} in transaction ${first.txId}`}
        />
      </span>
      <Ago round={round} timestamp={timestamp} />
      {more.length ? (
        <span className="text-muted-foreground" title={more.map((p) => `${p.sender}: ${algo(p.amount)}`).join("\n")}>
          +{more.length} more
        </span>
      ) : null}
    </span>
  );
}

/**
 * The "Funded" cell of the account page: "By <funder> (x ago)", and for an
 * account closed and re-opened since, "Re-funded by <funder> (x ago)" for its
 * latest re-opening. It shows a skeleton while loading and nothing when the
 * opening isn't found or comes after the round the page shows.
 */
export default function AccountFunding({ address }: { address: string }): JSX.Element | null {
  const { round: pageRound } = useRound();
  const { opening, openingLoading, payments, paymentsLoading, reopening, reopenPayments, reopenPaymentsLoading } =
    useAccountFunding(address, pageRound);

  if (openingLoading) {
    return (
      <div className="mt-2.5">
        <div className="text-muted-foreground">Funded</div>
        <div className="mt-2.5 h-5 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }
  if (!opening || (pageRound !== undefined && opening.round > pageRound)) return null;

  return (
    <div className="mt-2.5">
      <div className="text-muted-foreground">Funded</div>
      {/* The grid's 16px line height suits one-line cells; these lines (and a wrapped date) need more. */}
      <div className="mt-1.5 flex flex-col leading-6">
        {opening.round === 0 ? (
          <span>Genesis allocation</span>
        ) : (
          <FundedBy by="By" at="At block" round={opening.round} timestamp={opening.timestamp} payments={payments} loading={paymentsLoading} />
        )}
        {reopening ? (
          <FundedBy
            by="Re-funded by"
            at="Re-funded at block"
            round={reopening.round}
            timestamp={reopening.timestamp}
            payments={reopenPayments}
            loading={reopenPaymentsLoading}
          />
        ) : null}
      </div>
    </div>
  );
}
