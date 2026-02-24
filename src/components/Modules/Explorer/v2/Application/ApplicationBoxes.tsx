import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import BoxesList from "../BoxesList";
import { useApplicationBoxNames } from "src/hooks/useApplication";

function ApplicationBoxes(): JSX.Element {
  const { id } = useParams();
  const numId = Number(id);

  const {
    data,
    error: boxError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useApplicationBoxNames(numId);

  const boxNames = useMemo(
    () => data?.pages.flatMap((p) => p.boxes) ?? [],
    [data],
  );

  return (
    <div>
      {boxError ? (
        <div className="text-destructive p-4">
          {(boxError as Error)?.message || "Failed to load box names"}
        </div>
      ) : (
        <BoxesList
          boxNames={boxNames}
          hasMore={!!hasNextPage}
          loadMore={fetchNextPage}
          loadingMore={isFetchingNextPage}
        />
      )}
    </div>
  );
}

export default ApplicationBoxes;
