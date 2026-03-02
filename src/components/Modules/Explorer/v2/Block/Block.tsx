import React, { useEffect, useCallback } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";
import { useBlock, useBlockHash } from "src/hooks/useBlock";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToBlock from "../Links/LinkToBlock";
import LoadingTile from "src/components/v2/LoadingTile";
import CustomError from "../CustomError";
import Copyable from "src/components/v2/Copyable";
import NumberFormat from "react-number-format";
import RecordPageHeader from "src/components/v2/RecordPageHeader";
import MultiDateViewer, { DateSwitcher } from "src/components/v2/MultiDateViewer";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { microalgosToAlgos } from "src/utils/common";
import { ArrowLeftFromLine, ArrowRightFromLine, TriangleAlert, Info } from "lucide-react";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
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

function Block(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();
  const { id } = params;
  const numId = Number(id);

  const { data: blockInfo, isLoading, isError, error } = useBlock(numId);
  const { data: blockHash } = useBlockHash(numId);

  const blockInstance = blockInfo ? new CoreBlock(blockInfo) : null;

  useTitle(`Block ${id}`);

  const goToPrev = useCallback(() => navigate(`/block/${numId - 1}/transactions`), [navigate, numId]);
  const goToNext = useCallback(() => navigate(`/block/${numId + 1}/transactions`), [navigate, numId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") goToPrev();
      else if (e.key === "ArrowRight") goToNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToPrev, goToNext]);

  const txnTypes = blockInstance ? blockInstance.getTransactionsTypesCount() : {};
  const txnTypesList = Object.keys(txnTypes);
  const proposer = blockInstance?.getProposer() ?? "";
  const bonus = blockInstance?.getBonus() ?? 0;
  const suspendedAccounts = blockInstance?.getSuspendedAccounts() ?? [];

  return (
    <div className="mt-5">
      <div>
        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            <RecordPageHeader
              label="Block"
              id={<><span className="select-none">#</span>{blockInstance?.getRound() ?? id}</>}
              copyValue={numId}
              nowrap={false}
              jsonViewer={{
                filename: `block-${id}.json`,
                obj: () => blockInstance?.toJSON() ?? {},
                title: `Block ${id}`,
              }}
              openIn={{ pageType: "block", id }}
            >
              <div className="flex items-center gap-1 shrink-0 ml-auto md:ml-0">
                <a
                  href={`/block/${numId - 1}/transactions`}
                  onClick={(e) => {
                    e.preventDefault();
                    goToPrev();
                  }}
                  className="text-primary hover:bg-primary/10 rounded p-1.5"
                  title="Previous block (←)"
                >
                  <ArrowLeftFromLine size={20} />
                </a>
                <a
                  href={`/block/${numId + 1}/transactions`}
                  onClick={(e) => {
                    e.preventDefault();
                    goToNext();
                  }}
                  className="text-primary hover:bg-primary/10 rounded p-1.5"
                  title="Next block (→)"
                >
                  <ArrowRightFromLine size={20} />
                </a>
              </div>
            </RecordPageHeader>

            {isLoading || !blockInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-6">
                <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 sm:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Total transactions: {blockInstance.getTransactionsCount()}
                        </div>
                        {blockInstance.getTransactionsCount() > 0 ? (
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
                                      <p>This block has {txnTypes[type]} {longName} transactions</p>
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
                        <div className="text-muted-foreground inline-flex items-center gap-1">
                          Timestamp <DateSwitcher />
                        </div>
                        <div className="mt-2.5">
                          <MultiDateViewer timestamp={blockInstance.getTimestamp()} variant="value" />
                        </div>
                      </div>
                    </div>

                    {proposer ? (
                      <div className="col-span-12 sm:col-span-6">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">Proposer</div>
                          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                            <LinkToAccount
                              copySize="m"
                              subPage="validator"
                              address={proposer}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="col-span-12 sm:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Hash</div>
                        <div className="mt-2.5 text-[13px] text-foreground flex items-center min-w-0">
                          <span className="truncate">{blockHash ?? ""}</span>
                          {blockHash ? <Copyable value={blockHash} /> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {bonus ? (
                  <div className="mt-6 rounded-lg p-5 pt-2.5 bg-background-card">
                    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Block Reward</div>
                        <div className="mt-2.5 group inline-flex items-center gap-1">
                          <AlgoIcon />
                          <NumberFormat value={microalgosToAlgos(blockInstance.getProposerPayout())} displayType="text" thousandSeparator={true} />
                          <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(blockInstance.getProposerPayout())} />
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Block Bonus</div>
                        <div className="mt-2.5 group inline-flex items-center gap-1">
                          <AlgoIcon />
                          <NumberFormat value={microalgosToAlgos(bonus)} displayType="text" thousandSeparator={true} />
                          <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(bonus)} />
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Block Fees</div>
                        <div className="mt-2.5 group inline-flex items-center gap-1">
                          <AlgoIcon />
                          <NumberFormat value={microalgosToAlgos(blockInstance.getFeesCollected())} displayType="text" thousandSeparator={true} />
                          <Copyable className="opacity-60 group-hover:opacity-100" value={microalgosToAlgos(blockInstance.getFeesCollected())} />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {suspendedAccounts.length > 0 ? (
                  <div className="mt-6 rounded-lg p-5 pt-2.5 bg-background-card">
                    <div className="mt-2.5">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Suspended Validators</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default inline-flex shrink-0">
                                <Info size={15} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black text-white border-border">
                              <p>Account suspended from consensus for non-participation</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      {suspendedAccounts.map((acct) => (
                        <div key={`sus-${acct}`} className="mt-2.5 text-[13px] break-words overflow-hidden">
                          <LinkToAccount
                            copySize="m"
                            subPage="validator"
                            address={acct}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-6">
                  <TabsUnderline
                    value="transactions"
                    tabs={[
                      { name: "Transactions", value: "transactions", onClick: () => navigate("/block/" + id + "/transactions") },
                    ]}
                  />

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

export default Block;
