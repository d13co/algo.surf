import React, { Suspense, useMemo } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CoreGroup } from "src/packages/core-sdk/classes/core/CoreGroup";
import { useGroup } from "src/hooks/useGroup";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import LoadingTile from "src/components/v2/LoadingTile";
import CustomError from "../CustomError";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import MultiDateViewer, { DateSwitcher } from "src/components/v2/MultiDateViewer";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToBlock from "../Links/LinkToBlock";
import LinkToAsset from "../Links/LinkToAsset";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import explorer from "src/utils/dappflow";
import {
  calculateGroupBalanceImpact,
} from "@d13co/algo-group-balance-impact";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import RecordPageHeader from "src/components/v2/RecordPageHeader";

const txnTypeMap: Record<string, [string, string]> = {
  appl: ["app", "application"],
  axfer: ["asset", "asset transfer"],
  afrz: ["freeze", "asset freeze"],
  acfg: ["asset cfg", "asset configuration"],
  pay: ["algo", "algo payment"],
  stpf: ["state proof", "state proof"],
  keyreg: ["keyreg", "key registration"],
  hb: ["heartbeat", "heartbeat"],
};

function Group(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();
  const { id, blockId } = params;
  const numBlockId = Number(blockId);

  const { data: groupInfo, isLoading, isError, error } = useGroup(id!, numBlockId);

  const groupInstance = groupInfo ? new CoreGroup(groupInfo) : null;

  const { data: balanceResult } = useQuery({
    queryKey: ["group-balance-impact", id, numBlockId],
    queryFn: async () => {
      const indexer = explorer.network.getIndexer();
      const result = await calculateGroupBalanceImpact({
        indexer,
        groupId: id,
        round: numBlockId,
        includeFees: true,
      });
      return result;
    },
    enabled: !!id && !!numBlockId,
  });

  const balanceImpact = balanceResult?.balanceImpact ?? null;

  const balanceAssetIds = useMemo(() => {
    if (!balanceImpact) return [];
    const assetIds = new Set<number>();
    Object.values(balanceImpact).forEach((deltas) => {
      Object.keys(deltas).forEach((assetId) => {
        assetIds.add(Number(assetId));
      });
    });
    return Array.from(assetIds);
  }, [balanceImpact]);

  const { data: balanceAssets } = useTinyAssets(balanceAssetIds);

  useTitle(`Group Txn ${id}`);

  const txnTypes = groupInstance?.getTransactionsTypesCount() ?? {};
  const txnTypesList = Object.keys(txnTypes);

  return (
    <div className="mt-6">
      <div>
        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            <RecordPageHeader
              label="Group"
              id={groupInstance?.getId() ?? id!}
              copyValue={id!}
              truncate
              jsonViewer={{
                filename: `group-${id}.json`,
                obj: () => groupInstance?.toJSON() ?? {},
                title: `Group ${id}`,
              }}
            />

            {isLoading || !groupInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">Block</div>
                          <div className="mt-2.5">
                            <LinkToBlock id={groupInstance.getBlock()} />
                          </div>
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground inline-flex items-center gap-1">
                            Timestamp <DateSwitcher />
                          </div>
                          <div className="mt-2.5">
                            <MultiDateViewer timestamp={groupInstance.getTimestamp()} variant="value" />
                          </div>
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">
                            Total transactions: {groupInstance.getTransactionsCount()}
                          </div>
                          {groupInstance.getTransactionsCount() > 0 ? (
                            <div className="flex gap-2 mt-2.5 flex-wrap">
                              {txnTypesList.map((type) => {
                                const [shortName, longName] = txnTypeMap[type] ?? [type, type];
                                return (
                                  <TooltipProvider key={type}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-xs border border-primary text-primary rounded px-3 py-1 cursor-default">
                                          {txnTypes[type]} {shortName}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-black text-white border-border">
                                        <p>This group has {txnTypes[type]} {longName} transactions</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                {balanceImpact && balanceAssets ? (
                  <div className="rounded-lg p-5 bg-background-card overflow-hidden min-w-0">
                    <div className="text-muted-foreground mb-4">Balance Impact</div>
                    <div className="flex flex-col gap-3">
                      {Object.entries(balanceImpact).map(([account, deltas]) => (
                        <div key={account} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 min-w-0">
                          <div className="shrink-0 max-w-[120px]">
                            <LinkToAccount
                              copy="left"
                              strip={8}
                              address={account}
                            />
                          </div>
                          <div className="flex flex-col gap-1 pl-6 sm:pl-0 sm:items-end sm:text-right">
                            {Object.entries(deltas).sort(([, a], [, b]) => a - b).map(([assetId, delta]) => {
                              const asset = balanceAssets?.find(
                                (a) => a.index === Number(assetId),
                              );
                              const assetLabel =
                                assetId === "0"
                                  ? "ALGO"
                                  : asset?.params["unit-name"] || assetId;
                              const decimals =
                                assetId === "0"
                                  ? 6
                                  : asset?.params.decimals || 0;
                              const amount = delta / 10 ** decimals;
                              return (
                                <div
                                  key={assetId}
                                  className={`flex items-center gap-1 flex-wrap ${
                                    amount > 0
                                      ? "text-green-500"
                                      : amount < 0
                                        ? "text-red-500"
                                        : ""
                                  }`}
                                >
                                  <NumberFormatCopy
                                    value={amount}
                                    dimmable={true}
                                    showSign={true}
                                    copyPosition="left"
                                    copyStyle={{ marginRight: "0px" }}
                                    displayType={"text"}
                                    thousandSeparator={true}
                                    style={{ marginRight: "4px" }}
                                  />
                                  {assetId === "0" ? (
                                    <span>{assetLabel}</span>
                                  ) : (
                                    <LinkToAsset
                                      style={{
                                        color: "inherit",
                                        textDecorationColor: "inherit",
                                      }}
                                      id={assetId}
                                      name={assetLabel}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                </div>

                <div className="mt-6">
                  <TabsUnderline
                    value="transactions"
                    tabs={[
                      { name: "Transactions", value: "transactions", onClick: () => navigate(`/group/${id}/${blockId}/transactions`) },
                    ]}
                  />

                  <Suspense fallback={<LoadingTile />}>
                    <Outlet />
                  </Suspense>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Group;
