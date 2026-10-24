import React, { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { isValidAddress } from "algosdk";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import LinkToAccount from "../Links/LinkToAccount";
import Link from "../Links/Link";
import { useBlock } from "src/hooks/useBlock";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";

function BlockTransactions(): JSX.Element {
  const { id } = useParams();
  const numId = Number(id);
  // ?sender= shows only that sender's (top-level) txns, e.g. from a logic sig's first/last used round.
  const [searchParams] = useSearchParams();
  const senderParam = searchParams.get("sender");
  const sender = senderParam && isValidAddress(senderParam) ? senderParam : undefined;

  const { data: blockInfo, isLoading } = useBlock(numId);
  const allTransactions = useMemo(
    () => blockInfo ? new CoreBlock(blockInfo).getTransactions() : [],
    [blockInfo]
  );
  const transactions = useMemo(
    () => (sender ? allTransactions.filter((t) => t.sender === sender) : allTransactions),
    [allTransactions, sender]
  );

  return (
    <div>
      <TransactionsList
        // In the list's own toolbar row, as the account and app lists' filters are, beside its pagination.
        toolbar={
          sender ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>
                {isLoading ? "Txns" : `${transactions.length.toLocaleString()} of ${allTransactions.length.toLocaleString()} txns`} sent by
              </span>
              <LinkToAccount address={sender} strip={12} copy="right" copySize="s" />
              <Link href={`/block/${numId}/transactions`}>Show all</Link>
            </div>
          ) : undefined
        }
        transactions={transactions}
        initialLoading={isLoading}
        hasMore={false}
        fields={["id", "from", "to", "fee", "amount", "type"]}
      />
    </div>
  );
}

export default BlockTransactions;
