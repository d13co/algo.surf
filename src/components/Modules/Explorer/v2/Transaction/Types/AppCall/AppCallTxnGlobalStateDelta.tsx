import { CoreGlobalState } from "src/packages/core-sdk/classes/core/CoreGlobalStateDelta";
import { StateDeltaTable } from "./StateDeltaTable";

function AppCallTxnGlobalStateDelta({
  state,
}: {
  state: any[];
}): JSX.Element {
  const globalStateDelta = state || [];

  const rows = globalStateDelta.map((row) => {
    const instance = new CoreGlobalState(row);
    const action = instance.getAction();
    return {
      key: row.key,
      operationLabel: instance.getActionTypeDisplayValue(),
      isUint: action === 2,
      uintValue: instance.getValue(),
      bytesValue: instance.getValue(),
    };
  });

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="text-muted-foreground mb-4">Global state delta</div>
      <StateDeltaTable rows={rows} />
    </div>
  );
}

export default AppCallTxnGlobalStateDelta;
