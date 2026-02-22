import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import TransactionsList from "../Lists/TransactionsList/TransactionsList";
import { useAsset } from "src/hooks/useAsset";
import { useAssetTransactions } from "src/hooks/useAssetTransactions";

function AssetTransactions(): JSX.Element {
  const { id } = useParams();
  const numId = Number(id);

  const { data: assetInfo } = useAsset(numId);
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAssetTransactions(numId);

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
            record="asset"
            recordDef={assetInfo ?? {}}
            transactions={transactions}
            reachedLastPage={reachedLastPage}
            loading={isFetchingNextPage}
            initialLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}

export default AssetTransactions;
