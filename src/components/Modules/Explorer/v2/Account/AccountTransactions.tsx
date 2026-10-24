import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import { useTxnRoundFilter } from "../Lists/TransactionsList/TxnRoundFilter";
import { useAccountTransactions } from "src/hooks/useAccount";
import { useRound } from "src/hooks/useRound";

function AccountTransactions(): JSX.Element {
  const { address } = useParams();
  const { round } = useRound();
  const { txnRound, toolbar, emptyLabel } = useTxnRoundFilter("this account");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAccountTransactions(address, round, txnRound);

  const transactions = useMemo(
    () => data?.pages.flatMap((p) => p.transactions) ?? [],
    [data]
  );

  function reachedLastPage() {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <div>
      <TransactionsList
        key={txnRound}
        transactions={transactions}
        reachedLastPage={reachedLastPage}
        loading={isFetchingNextPage}
        initialLoading={isLoading}
        hasMore={hasNextPage}
        record="account"
        recordId={address}
        toolbar={toolbar}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}

export default AccountTransactions;
