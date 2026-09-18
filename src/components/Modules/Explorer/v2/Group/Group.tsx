import React, { Suspense } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CoreGroup } from "src/packages/core-sdk/classes/core/CoreGroup";
import { useGroup } from "src/hooks/useGroup";
import LoadingTile from "src/components/v2/LoadingTile";
import CustomError from "../CustomError";
import BalanceImpact from "../BalanceImpact";
import MultiDateViewer, { DateSwitcher } from "src/components/v2/MultiDateViewer";
import LinkToBlock from "../Links/LinkToBlock";
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
                dataKey: groupInfo,
                title: `Group ${id}`,
                // A group has no endpoint of its own; this is the indexer query
                // that returns exactly its transactions. The id is base64, so it
                // has to be escaped.
                api:
                  id && numBlockId
                    ? {
                        indexer: `/v2/transactions?group-id=${encodeURIComponent(id)}&round=${numBlockId}`,
                      }
                    : undefined,
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

                  <BalanceImpact balanceImpact={balanceImpact} />
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
