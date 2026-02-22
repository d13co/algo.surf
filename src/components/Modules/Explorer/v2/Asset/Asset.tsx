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
import JsonViewer from "src/components/v2/JsonViewer";
import CustomError from "../CustomError";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import Copyable from "src/components/v2/Copyable";
import Dym from "../../Records/Dym";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { ShieldCheck } from "lucide-react";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import OpenInMenu from "src/components/v2/OpenInMenu";
import { useAsset } from "src/hooks/useAsset";
import { useAssetLabels } from "src/hooks/useAssetLabels";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "src/components/v2/ui/tabs";

function Asset(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  const { id } = params;
  const numId = Number(id);

  const { data: assetInfo, isLoading, isError, error } = useAsset(numId);
  const { data: labels } = useAssetLabels(numId);

  const assetInstance = assetInfo ? new CoreAsset(assetInfo) : null;

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
            <div className="flex justify-between items-center text-xl font-bold">
              <div>Asset overview</div>
              <div className="flex items-center gap-2.5">
                <JsonViewer
                  filename={`asset-${id}.json`}
                  obj={assetInstance?.toJSON() ?? {}}
                  title={`Asset ${id}`}
                />
                <OpenInMenu pageType={"asset"} id={id} />
              </div>
            </div>

            {isLoading || !assetInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-8">
                <div className="text-lg mb-5 font-normal flex gap-8">
                  <div>
                    <div>
                      <span className="select-none">#</span>
                      {assetInstance.getIndex()}
                      <Copyable value={assetInstance.getIndex()} />
                      {assetInstance.isDeleted() && (
                        <span className="ml-2 text-sm font-medium text-secondary bg-secondary/10 px-2 py-0.5 rounded">
                          Deleted
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      {assetInstance.getUrl() ? (
                        <>
                          <a
                            href={assetInstance.getUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-sm"
                          >
                            {assetInstance.getUrl()}
                          </a>
                          <Copyable
                            size="s"
                            value={assetInstance.getUrl()}
                          />
                        </>
                      ) : (
                        ""
                      )}
                    </div>
                  </div>
                  {!pv ? null : (
                    <div className="flex flex-col justify-between items-center gap-2">
                      <ShieldCheck
                        style={{ color: "#FFEE55", marginTop: "3px" }}
                      />
                      <div className="text-sm text-primary">Pera Verified</div>
                    </div>
                  )}
                </div>

                <div className="mt-6 rounded-lg p-5 pt-2.5 bg-background-card">
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
                        <div className="mt-2.5">
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

                {assetInstance.getResolvedUrl() ? (
                  <div className="mt-6 rounded-lg p-5 pt-2.5 bg-background-card">
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 sm:col-span-6 md:col-span-3">
                        <div className="mt-2.5">
                          <div className="text-muted-foreground">
                            Resolved Url
                          </div>
                          <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                            <a
                              href={assetInstance.getResolvedUrl()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {assetInstance.getResolvedUrl()}
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-6">
                  <Tabs defaultValue="transactions" value="transactions">
                    <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start">
                      <TabsTrigger
                        value="transactions"
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none text-muted-foreground data-[state=active]:text-foreground"
                        onClick={() => {
                          navigate("/asset/" + id + "/transactions");
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

export default Asset;
