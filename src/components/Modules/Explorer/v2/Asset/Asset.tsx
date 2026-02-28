import { useMemo } from "react";
import {
  Outlet,
  useNavigate,
  useSearchParams,
  useParams,
} from "react-router-dom";
import { CoreAsset } from "src/packages/core-sdk/classes/core/CoreAsset";
import LinkToAccount from "../Links/LinkToAccount";
import LoadingTile from "src/components/v2/LoadingTile";
import CustomError from "../CustomError";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import Copyable from "src/components/v2/Copyable";
import Dym from "../Dym";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { ShieldCheck } from "lucide-react";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import RecordPageHeader from "src/components/v2/RecordPageHeader";
import MultiDateViewer, {
  DateSwitcher,
} from "src/components/v2/MultiDateViewer";
import { useAsset } from "src/hooks/useAsset";
import { useAssetLabels } from "src/hooks/useAssetLabels";
import { useBlock } from "src/hooks/useBlock";
import { CoreBlock } from "src/packages/core-sdk/classes/core/CoreBlock";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import { Chip, BadgesRow } from "src/components/v2/Chips";

function Asset(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const { id } = params;
  const numId = Number(id);

  const { data: assetInfo, isLoading, isError, error } = useAsset(numId);
  const { data: labels } = useAssetLabels(numId);

  const assetInstance = assetInfo ? new CoreAsset(assetInfo) : null;
  const createdAtRound = assetInstance?.getCreatedAtRound();
  const { data: createdBlock } = useBlock(createdAtRound ?? 0);
  const createdBlockTimestamp = createdBlock
    ? new CoreBlock(createdBlock).getTimestamp()
    : undefined;

  useTitle(`Asset ${id}`);

  const b64Name = assetInstance ? !assetInstance.getName() : false;
  const pv = labels?.includes("pv") ?? false;

  const dym = searchParams.get("dym");
  const [dymString, dymLink] = useMemo(() => {
    if (dym) {
      const blockNum = dym.split(":")[1];
      return [`Block ${blockNum}`, `/block/${blockNum}`];
    } else {
      return [];
    }
  }, [dym]);

  return (
    <div className="mt-5">
      <div>
        {dym ? <Dym text={dymString} link={dymLink} /> : null}

        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            <RecordPageHeader
              label="Asset"
              id={
                <>
                  <span className="select-none">#</span>
                  {id}
                </>
              }
              copyValue={Number(id)}
              jsonViewer={{
                filename: `asset-${id}.json`,
                obj: () => assetInstance?.toJSON() ?? {},
                title: `Asset ${id}`,
              }}
              openIn={{ pageType: "asset", id }}
            />

            {isLoading || !assetInstance ? (
              <LoadingTile />
            ) : (
              <div>
                <BadgesRow>
                  {assetInstance.isDeleted() ? <Chip>Deleted</Chip> : null}
                  {assetInstance.getUrl() ? (
                    <span className="group inline-flex items-center gap-1">
                      <a
                        href={assetInstance.getUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {assetInstance.getUrl()}
                      </a>
                      <Copyable
                        className="opacity-60 group-hover:opacity-100"
                        size="s"
                        value={assetInstance.getUrl()}
                      />
                    </span>
                  ) : null}
                  {pv ? (
                    <span
                      className="inline-flex items-center gap-1"
                      style={{ color: "#FFEE55D9" }}
                    >
                      <ShieldCheck size={18} style={{ color: "#FFEE55" }} />
                      Pera Verified
                    </span>
                  ) : null}
                </BadgesRow>

                <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 sm:col-span-6 md:col-span-3">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Name</div>
                        <div
                          className="mt-2.5"
                          style={{
                            wordBreak: b64Name ? "break-word" : "inherit",
                          }}
                        >
                          {assetInstance.getNameB64() ? (
                            <MultiFormatViewer
                              view={b64Name ? "base64" : "utf8"}
                              value={assetInstance.getNameB64()}
                            />
                          ) : (
                            "--None--"
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 md:col-span-3">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Unit</div>
                        <div className="mt-2.5">
                          {assetInstance.getUnitNameB64() ? (
                            <MultiFormatViewer
                              view={
                                assetInstance.getUnitName() ? "utf8" : "base64"
                              }
                              value={assetInstance.getUnitNameB64()}
                            />
                          ) : (
                            "--None--"
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 md:col-span-3">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Total supply
                        </div>
                        <div className="mt-2.5 break-all">
                          <NumberFormatCopy
                            value={assetInstance.getTotalSupply()}
                            displayType={"text"}
                            thousandSeparator={true}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 md:col-span-3">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Decimals</div>
                        <div className="mt-2.5">
                          {assetInstance.getDecimals()}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 md:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Creator</div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          <LinkToAccount
                            copySize="m"
                            address={assetInstance.getCreator()}
                          />
                        </div>
                      </div>
                    </div>

                    {assetInstance.getMetadataHash() ? (
                      <div className="col-span-12 sm:col-span-6 md:col-span-6">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">
                            Metadata hash
                          </div>
                          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                            {assetInstance.getMetadataHash()}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="col-span-12 sm:col-span-6 md:col-span-3">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">
                          Default frozen
                        </div>
                        <div className="mt-2.5">
                          {assetInstance.getDefaultFrozen() ? "Yes" : "No"}
                        </div>
                      </div>
                    </div>

                    {createdAtRound != null && createdBlockTimestamp != null ? (
                      <div className="col-span-12 sm:col-span-6 md:col-span-3">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground inline-flex items-center gap-1">
                            Created at <DateSwitcher />
                          </div>
                          <div className="mt-2.5">
                            <MultiDateViewer
                              timestamp={createdBlockTimestamp}
                              block={createdAtRound}
                              variant="value"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-6 rounded-lg p-5 pt-2.5 bg-background-card">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 sm:col-span-6 md:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Manager</div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          {assetInstance.hasManager() ? (
                            <LinkToAccount
                              copySize="m"
                              address={assetInstance.getManager()}
                            />
                          ) : (
                            "--None--"
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 md:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Reserve</div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          {assetInstance.hasReserve() ? (
                            <LinkToAccount
                              copySize="m"
                              address={assetInstance.getReserve()}
                            />
                          ) : (
                            "--None--"
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 md:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Freeze</div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          {assetInstance.hasFreeze() ? (
                            <LinkToAccount
                              copySize="m"
                              address={assetInstance.getFreeze()}
                            />
                          ) : (
                            "--None--"
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-span-12 sm:col-span-6 md:col-span-6">
                      <div className="mt-2.5">
                        <div className="text-muted-foreground">Clawback</div>
                        <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                          {assetInstance.hasClawback() ? (
                            <LinkToAccount
                              copySize="m"
                              address={assetInstance.getClawback()}
                            />
                          ) : (
                            "--None--"
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {assetInstance.getResolvedUrl() &&
                assetInstance.getResolvedUrl() !== assetInstance.getUrl() ? (
                  <div className="mt-6 rounded-lg p-5 pt-2.5 bg-background-card">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">
                            Resolved Url
                          </div>
                          <div className="mt-2.5 text-[13px] group inline-flex items-center gap-1 min-w-0 max-w-full">
                            <a
                              href={assetInstance.getResolvedUrl()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline truncate"
                            >
                              {assetInstance.getResolvedUrl()}
                            </a>
                            <Copyable
                              className="opacity-60 group-hover:opacity-100 shrink-0"
                              size="s"
                              value={assetInstance.getResolvedUrl()}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-6">
                  <TabsUnderline
                    value="transactions"
                    tabs={[
                      {
                        name: "Transactions",
                        value: "transactions",
                        onClick: () =>
                          navigate("/asset/" + id + "/transactions"),
                      },
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

export default Asset;
