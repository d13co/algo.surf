import React from "react";
import { useParams } from "react-router-dom";
import BoxesList from "../../../Explorer/Lists/BoxesList/BoxesList";
import { useApplicationBoxNames } from "src/hooks/useApplication";

function ApplicationBoxes(): JSX.Element {
  const { id } = useParams();
  const numId = Number(id);

  const { data: boxNames, error: boxError } = useApplicationBoxNames(numId);

  return (
    <div>
      {boxError ? (
        <div className="text-destructive p-4">
          {(boxError as Error)?.message || "Failed to load box names"}
        </div>
      ) : (
        <BoxesList boxNames={boxNames ?? []} />
      )}
    </div>
  );
}

export default ApplicationBoxes;
