import React, { Suspense, useEffect, useMemo } from "react";
import {
  matchPath,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import LinkToAccount from "../Links/LinkToAccount";
import LoadingTile from "src/components/v2/LoadingTile";
import CustomError from "../CustomError";
import Copyable from "src/components/v2/Copyable";
import RecordPageHeader from "src/components/v2/RecordPageHeader";
import Dym from "../Dym";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { ChevronDown } from "lucide-react";
import {
  useApplication,
  useApplicationHashes,
  useApplicationBoxNames,
} from "src/hooks/useApplication";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import ApplicationProgram from "../ApplicationProgram";
import ApplicationGlobalState from "./ApplicationGlobalState";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";

const isDevNet = process.env.REACT_APP_NETWORK !== "Mainnet";

function Application(): JSX.Element {
  const navigate = useNavigate();
  const params = useParams();
  const { id } = params;
  const numId = Number(id);

  const { pathname } = useLocation();

  let tabValue = "transactions";
  if (matchPath("/application/:id/boxes", pathname)) {
    tabValue = "boxes";
  }

  const [codeTabValue, setCodeTabValue] = React.useState("global");
  const [hashAlgo, setHashAlgo] = React.useState<"sha512_256" | "sha256">("sha512_256");
  const [expanded, setExpanded] = usePersistenBooleanState(
    "application-code-expanded",
    isDevNet,
  );

  const { data: appInfo, isLoading, isError, error } = useApplication(numId);
  const { data: hashes, isLoading: hashesLoading, isError: hashesError } = useApplicationHashes(appInfo);
  const {
    data: boxData,
    error: boxError,
  } = useApplicationBoxNames(numId);

  const applicationInstance = useMemo(
    () => (appInfo ? new CoreApplication(appInfo) : null),
    [appInfo],
  );

  useTitle(`App ${id}`);

  useEffect(() => {
    if (
      codeTabValue === "global" &&
      applicationInstance &&
      applicationInstance.getClearProgram() &&
      !applicationInstance.hasGlobalState()
    ) {
      setCodeTabValue("approval");
    }
  }, [applicationInstance?.getId(), applicationInstance?.getClearProgram()]);

  const [approvalSize, clearSize] = useMemo(() => {
    if (!applicationInstance) return [0, 0];
    return [
      Buffer.from(applicationInstance.getApprovalProgram(), "base64").length,
      Buffer.from(applicationInstance.getClearProgram(), "base64").length,
    ];
  }, [applicationInstance]);

  const hasBoxes = (boxData?.pages?.[0]?.boxes?.length > 0) || !!boxError;

  return (
    <div className="mt-5">
      <div>
        <Dym />

        {isError ? (
          <CustomError error={error?.message} />
        ) : (
          <div>
            <RecordPageHeader
              label="Application"
              id={<><span className="select-none">#</span>{id}</>}
              copyValue={Number(id)}
              jsonViewer={{
                filename: `app-${id}.json`,
                obj: () => applicationInstance?.toJSON() ?? {},
                title: `Application ${id}`,
              }}
              openIn={{ pageType: "application", id }}
            />

            {isLoading || !applicationInstance ? (
              <LoadingTile />
            ) : (
              <div className="mt-6">
                <div className="rounded-lg p-5 pt-2.5 bg-background-card">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="mt-2.5">
                      <div className="text-muted-foreground">
                        Application escrow account
                      </div>
                      <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                        <LinkToAccount
                          copySize="m"
                          noEscrow
                          address={applicationInstance.getApplicationAddress()}
                        />
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <div className="text-muted-foreground">Creator</div>
                      <div className="mt-2.5 text-[13px] break-words overflow-hidden">
                        <LinkToAccount
                          copySize="m"
                          address={applicationInstance.getCreator()}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Application State — collapsible */}
                <div className="mt-6 rounded-lg bg-background-card overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-5 cursor-pointer text-left"
                    onClick={() => setExpanded(!expanded)}
                  >
                    <span className="font-medium">Application Code & State</span>
                    <ChevronDown
                      size={20}
                      className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  {expanded ? (
                    <div className="px-5 pb-5">
                      <TabsUnderline
                        className="gap-6"
                        value={codeTabValue}
                        onValueChange={setCodeTabValue}
                        tabs={[
                          {
                            name: "Global State",
                            value: "global",
                            content: <ApplicationGlobalState appInfo={appInfo} />,
                          },
                          {
                            name: "Approval Program",
                            value: "approval",
                            content: (
                              <div className="mt-6">
                                <ApplicationProgram
                                  name="Approval program"
                                  id={numId}
                                  program={applicationInstance.getApprovalProgram()}
                                />
                              </div>
                            ),
                          },
                          {
                            name: "Clear State Program",
                            value: "clear",
                            content: (
                              <div className="mt-6">
                                <ApplicationProgram
                                  name="Clear state program"
                                  id={numId}
                                  program={applicationInstance.getClearProgram()}
                                />
                              </div>
                            ),
                          },
                          {
                            name: "Program Hashes",
                            value: "hashes",
                            content: (
                              <div className="px-3.5 mt-6 relative">
                                <div className="flex items-center justify-center md:justify-end md:absolute md:top-0 md:right-3.5 mb-4 md:mb-0">
                                  <div className="inline-flex rounded border border-border overflow-hidden text-xs">
                                    <button
                                      type="button"
                                      className={`px-2.5 py-1 cursor-pointer ${hashAlgo === "sha512_256" ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                                      onClick={() => setHashAlgo("sha512_256")}
                                    >
                                      SHA512/256
                                    </button>
                                    <button
                                      type="button"
                                      className={`px-2.5 py-1 cursor-pointer border-l border-border ${hashAlgo === "sha256" ? "bg-primary text-background" : "bg-transparent text-primary hover:bg-primary/20"}`}
                                      onClick={() => setHashAlgo("sha256")}
                                    >
                                      SHA256
                                    </button>
                                  </div>
                                </div>
                                {hashesError ? (
                                  <div className="text-destructive text-sm">
                                    Failed to compute hashes. Your browser may not support the Web Crypto API on this connection.
                                  </div>
                                ) : hashesLoading || !hashes ? (
                                  <div className="text-muted-foreground flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                                    Computing hashes...
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-muted-foreground text-sm flex items-center gap-2.5">
                                      Approval {hashAlgo === "sha512_256" ? "SHA512/256" : "SHA256"}
                                    </div>
                                    <div className="flex items-start text-[13px] text-foreground break-all mt-2.5">
                                      <span>{hashes[hashAlgo].approval}</span>
                                      <Copyable value={hashes[hashAlgo].approval} />
                                    </div>

                                    {hashes[hashAlgo].approvalPages.length > 1 ? (
                                      <>
                                        <div className="text-muted-foreground text-sm flex items-center gap-2.5 mt-6">
                                          Approval pages {hashAlgo === "sha512_256" ? "SHA512/256" : "SHA256"}
                                        </div>
                                        {hashes[hashAlgo].approvalPages.map(
                                          (pageHash, i) => (
                                            <div key={i} className="flex items-start text-[13px] text-foreground break-all mt-2.5">
                                              <span className="font-bold user-select-none mr-1">
                                                {i + 1}/
                                              </span>{" "}
                                              <span>{pageHash}</span>
                                              <Copyable value={pageHash} />
                                            </div>
                                          ),
                                        )}
                                      </>
                                    ) : null}

                                    <div className="text-muted-foreground text-sm flex items-center gap-2.5 mt-6">
                                      Clear State {hashAlgo === "sha512_256" ? "SHA512/256" : "SHA256"}
                                    </div>
                                    <div className="flex items-start text-[13px] text-foreground break-all mt-2.5">
                                      <span>{hashes[hashAlgo].clear}</span>
                                      <Copyable value={hashes[hashAlgo].clear} />
                                    </div>
                                  </>
                                )}
                              </div>
                            ),
                          },
                          {
                            name: "Schema & Size",
                            value: "schema",
                            content: (
                              <div className="px-3.5 mt-6">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
                                  <div>
                                    <div className="text-muted-foreground text-sm">Global state byte</div>
                                    <div className="mt-2.5 text-foreground">{applicationInstance.getGlobalSchemaByte()}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-sm">Global state uint</div>
                                    <div className="mt-2.5 text-foreground">{applicationInstance.getGlobalSchemaUint()}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-sm">Local state byte</div>
                                    <div className="mt-2.5 text-foreground">{applicationInstance.getLocalSchemaByte()}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-sm">Local state uint</div>
                                    <div className="mt-2.5 text-foreground">{applicationInstance.getLocalSchemaUint()}</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-sm">Approval program size</div>
                                    <div className="mt-2.5 text-foreground">{approvalSize} bytes</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-sm">Clear program size</div>
                                    <div className="mt-2.5 text-foreground">{clearSize} bytes</div>
                                  </div>
                                  <div>
                                    <div className="text-muted-foreground text-sm">Extra Program Pages</div>
                                    <div className="mt-2.5 text-foreground">{applicationInstance.getExtraProgramPages()}</div>
                                  </div>
                                </div>
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  ) : null}
                </div>

                {/* Bottom tabs: Transactions / Boxes */}
                <div className="mt-6">
                  <TabsUnderline
                    value={tabValue}
                    tabs={[
                      { name: "Transactions", value: "transactions", onClick: () => navigate("/application/" + id + "/transactions") },
                      ...(hasBoxes ? [{ name: "Boxes", value: "boxes", onClick: () => navigate("/application/" + id + "/boxes") }] : []),
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

export default Application;
