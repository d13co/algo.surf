import { CoreLocalState } from "src/packages/core-sdk/classes/core/CoreLocalStateDelta";
import LinkToAccount from "../../../Links/LinkToAccount";
import { StateDeltaTable } from "./StateDeltaTable";

function AppCallTxnLocalStateDelta({
  appId,
  state,
}: {
  appId: number;
  state: any[];
}): JSX.Element {
  const localStateDelta = state || [];

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="text-muted-foreground mb-4">Local state delta</div>

      <div className="space-y-6">
        {localStateDelta.map((accountLocalState) => {
          const rows = accountLocalState.delta.map((row: any) => {
            const instance = new CoreLocalState(row);
            const action = instance.getAction();
            return {
              key: row.key,
              operationLabel: instance.getActionTypeDisplayValue(),
              isUint: action === 2,
              uintValue: Number(row.value.uint),
              bytesValue: instance.getValue(),
            };
          });

          return (
            <div key={accountLocalState.address}>
              <div className="mb-2 text-[13px] break-words overflow-hidden">
                <LinkToAccount
                  copySize="m"
                  address={accountLocalState.address}
                  subPage={`opted-applications/${appId}`}
                />
              </div>
              <StateDeltaTable rows={rows} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AppCallTxnLocalStateDelta;
