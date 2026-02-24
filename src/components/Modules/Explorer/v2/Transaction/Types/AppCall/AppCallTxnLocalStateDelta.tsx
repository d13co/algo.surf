import React from "react";
import { CoreLocalState } from "src/packages/core-sdk/classes/core/CoreLocalStateDelta";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import LinkToAccount from "../../../Links/LinkToAccount";

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
        {localStateDelta.map((accountLocalState) => (
          <div key={accountLocalState.address}>
            <div className="mb-2 text-[13px] break-words overflow-hidden">
              <LinkToAccount
                copySize="m"
                address={accountLocalState.address}
                subPage={`opted-applications/${appId}`}
              />
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <colgroup>
                  <col style={{ width: 60 }} />
                  <col style={{ width: "30%" }} />
                  <col />
                </colgroup>
                <thead>
                  <tr className="border-b border-primary">
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium">
                      Operation
                    </th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium">
                      Key
                    </th>
                    <th className="text-left py-2 px-1 text-muted-foreground font-medium">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accountLocalState.delta.map((row: any) => {
                    const instance = new CoreLocalState(row);
                    const action = instance.getAction();
                    return (
                      <tr key={row.key} className="border-b border-border">
                        <td className="py-2 px-1 align-top">
                          {instance.getActionTypeDisplayValue()}
                        </td>
                        <td className="py-2 px-1 align-top">
                          <MultiFormatViewer
                            view="auto"
                            value={row.key}
                            side="left"
                          />
                        </td>
                        <td className="py-2 px-1 align-top">
                          {action === 2 ? (
                            <NumberFormatCopy
                              value={Number(row.value.uint)}
                              copyPosition="left"
                              displayType="text"
                              thousandSeparator
                            />
                          ) : (
                            <MultiFormatViewer
                              side="left"
                              view="auto"
                              includeNum="auto"
                              value={instance.getValue()}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {accountLocalState.delta.map((row: any) => {
                const instance = new CoreLocalState(row);
                const action = instance.getAction();
                return (
                  <div
                    key={row.key}
                    className="rounded-lg border border-muted p-3 space-y-2 text-sm"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">
                        Operation
                      </span>
                      <span>{instance.getActionTypeDisplayValue()}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">
                        Key
                      </span>
                      <span className="text-right min-w-0 overflow-hidden max-w-[80%]">
                        <MultiFormatViewer
                          view="auto"
                          value={row.key}
                          side="left"
                        />
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">
                        Value
                      </span>
                      <span className="text-right min-w-0 overflow-hidden max-w-[80%]">
                        {action === 2 ? (
                          <NumberFormatCopy
                            value={Number(row.value.uint)}
                            copyPosition="left"
                            displayType="text"
                            thousandSeparator
                          />
                        ) : (
                          <MultiFormatViewer
                            side="left"
                            view="auto"
                            includeNum="auto"
                            value={instance.getValue()}
                          />
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AppCallTxnLocalStateDelta;
