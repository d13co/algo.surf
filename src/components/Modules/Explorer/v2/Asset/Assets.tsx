import React, { useEffect, useMemo } from "react";
import AssetsList from "../../Lists/AssetsList/AssetsList";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { useAssets } from "src/hooks/useAssets";

function Assets(): JSX.Element {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useAssets();
  useTitle("Assets");

  const list = useMemo(
    () => data?.pages.flatMap((p) => p.assets) ?? [],
    [data]
  );

  function reachedLastPage() {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <div className="assets-wrapper">
      <div className="assets-container">
        <div className="assets-body">
          <AssetsList
            assets={list}
            loading={isFetchingNextPage}
            reachedLastPage={reachedLastPage}
          />
        </div>
      </div>
    </div>
  );
}

export default Assets;
