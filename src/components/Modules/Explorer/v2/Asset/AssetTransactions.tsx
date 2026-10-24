import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import { useTxnRoundFilter } from "../Lists/TransactionsList/TxnRoundFilter";
import { useAsset } from "src/hooks/useAsset";
import { useAssetTransactions } from "src/hooks/useAssetTransactions";
import { useRound } from "src/hooks/useRound";

function AssetTransactions(): JSX.Element {
  const { id } = useParams();
  const numId = Number(id);
  const { round } = useRound();
  const { txnRound, toolbar, emptyLabel } = useTxnRoundFilter("this asset");

  const { data: assetInfo } = useAsset(numId);
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAssetTransactions(numId, round, txnRound);

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
    <div className="asset-transactions-wrapper">
      <div className="asset-transactions-container">
        <div className="asset-transactions-body">
          <TransactionsList
            key={txnRound}
            record="asset"
            recordDef={assetInfo ?? {}}
            transactions={transactions}
            reachedLastPage={reachedLastPage}
            loading={isFetchingNextPage}
            initialLoading={isLoading}
            hasMore={hasNextPage}
            toolbar={toolbar}
            emptyLabel={emptyLabel}
          />
        </div>
      </div>
    </div>
  );
}

export default AssetTransactions;
