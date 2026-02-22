import React, { useMemo } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CoreGroup } from "src/packages/core-sdk/classes/core/CoreGroup";
import { useGroup } from "src/hooks/useGroup";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import LoadingTile from "src/components/v2/LoadingTile";
import JsonViewer from "src/components/v2/JsonViewer";
import CustomError from "../CustomError";
import Copyable from "src/components/v2/Copyable";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import MultiDateViewer from "src/components/v2/MultiDateViewer";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToBlock from "../Links/LinkToBlock";
import LinkToAsset from "../Links/LinkToAsset";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import explorer from "src/utils/dappflow";
import {
  BalanceImpact,
  calculateGroupBalanceImpact,
} from "@d13co/algo-group-balance-impact";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "src/components/v2/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

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
    <div className="mt-5">
      <div>
        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            <div className="flex justify-between items-center gap-2 text-xl font-bold">
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0">Transaction Group</span>
                <span className="text-base font-normal truncate min-w-0 hidden sm:inline">
                  {groupInstance?.getId() ?? id}
                </span>
                <span className="hidden sm:inline-flex">
                  <Copyable value={id!} />
                </span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                {groupInstance ? (
                  <JsonViewer
                    filename={`group-${id}.json`}
                    obj={groupInstance.get()}
                    title={`Group ${id}`}
                  />
                ) : null}
              </div>
            </div>

            {isLoading || !groupInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 sm:col-span-6 hidden sm:block">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">Group ID</div>
                          <div className="mt-2.5 text-[13px] break-all">
                            {groupInstance.getId()}
                            <Copyable value={groupInstance.getId()} />
                          </div>
                        </div>
                      </div>

                      <div className="col-span-12 sm:col-span-6">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">Timestamp</div>
                          <div className="mt-2.5">
                            <MultiDateViewer timestamp={groupInstance.getTimestamp()} switcherSide="right" />
                          </div>
                        </div>
                      </div>

                      <div className="col-span-12 sm:col-span-6">
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

                      <div className="col-span-12 sm:col-span-6">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">Block</div>
                          <div className="mt-2.5">
                            <LinkToBlock id={groupInstance.getBlock()} />
                          </div>
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
                  <Tabs defaultValue="transactions" value="transactions">
                    <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start">
                      <TabsTrigger
                        value="transactions"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                        onClick={() => {
                          navigate(`/group/${id}/${blockId}/transactions`);
                        }}
                      >
                        Transactions
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <Outlet />
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
