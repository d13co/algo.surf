import { useMemo } from "react";
import { useTransactions } from "src/hooks/useTransactions";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import useTitle from "src/components/Common/UseTitle/UseTitle";

function Transactions(): JSX.Element {
  useTitle("Transactions");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTransactions();

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
    <TransactionsList
      transactions={transactions}
      loading={isFetchingNextPage}
      initialLoading={!data}
      hasMore={hasNextPage}
      reachedLastPage={reachedLastPage}
    />
  );
}

export default Transactions;
