import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import { useApplicationTransactions } from "src/hooks/useApplication";
import { useRound } from "src/hooks/useRound";

function ApplicationTransactions(): JSX.Element {
  const { id } = useParams();
  const numId = Number(id);
  const { round } = useRound();

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useApplicationTransactions(numId, round);

  const transactions = useMemo(
    () => data?.pages.flatMap((p) => p.transactions) ?? [],
    [data],
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
        fields={["type", "id", "age", "from", "to", "fee"]}
      />
    </div>
  );
}

export default ApplicationTransactions;
