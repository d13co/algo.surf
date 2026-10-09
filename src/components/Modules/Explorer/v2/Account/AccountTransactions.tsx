import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import { useAccountTransactions } from "src/hooks/useAccount";
import { useRound } from "src/hooks/useRound";

function AccountTransactions(): JSX.Element {
  const { address } = useParams();
  const { round } = useRound();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAccountTransactions(address, round);

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
        transactions={transactions}
        reachedLastPage={reachedLastPage}
        loading={isFetchingNextPage}
        initialLoading={isLoading}
        hasMore={hasNextPage}
        record="account"
        recordId={address}
      />
    </div>
  );
}

export default AccountTransactions;
