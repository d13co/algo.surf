import React, { useMemo } from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { CoreAsset } from "src/packages/core-sdk/classes/core/CoreAsset";
import { ARC19 } from "src/packages/arc-portal/classes/ARC19/ARC19";
import { indexerModels } from "algosdk";
import NumberFormat from "react-number-format";
import LinkToAccount from "../../Links/LinkToAccount";
import LinkToAsset from "../../Links/LinkToAsset";
import Copyable from "src/components/v2/Copyable";

function AssetConfigTransaction({
  transaction,
  asset,
}: {
  transaction: any;
  asset?: any;
}): JSX.Element {
  const txnInstance = new CoreTransaction(transaction);
  const acfg = txnInstance.getAssetConfigPayload();
  const isCreate = !acfg?.assetId;
  const isDestroy = !isCreate && !acfg?.params;

  // For creation: build from embedded payload params
  // For reconfiguration: use fetched asset, fall back to payload
  const configAsset =
    acfg?.params
      ? new CoreAsset(new indexerModels.Asset({
          index: acfg.assetId ?? 0n,
          params: acfg.params,
        }))
      : null;
  const fetchedAsset = asset ? new CoreAsset(asset) : null;
  const assetInstance = fetchedAsset ?? configAsset;

  const arc19Url = useMemo(() => {
    if (!assetInstance) return null;
    const arc19 = new ARC19(assetInstance.asset);
    if (!arc19.hasValidUrl()) return null;
    return arc19.getMetadataUrl();
  }, [assetInstance]);

  return (
    <>
    <div className="mt-7">
      <div className="rounded-lg p-5 bg-background-card">
        <div className="grid grid-cols-12 gap-4">
          {/* Row 1: Sender | Asset ID | Action */}
          <div className="col-span-12 md:col-span-4">
            <div className="text-muted-foreground">Sender</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              <LinkToAccount copySize="m" address={txnInstance.getFrom()} />
            </div>
          </div>

          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <div className="text-muted-foreground">Asset ID</div>
            <div className="mt-2.5">
              <LinkToAsset
                id={txnInstance.getAssetId()}
              />
            </div>
          </div>

          <div className="col-span-12 sm:col-span-6 md:col-span-4">
            <div className="text-muted-foreground">Action</div>
            <div className="mt-2.5">
              {isCreate ? "Creation" : isDestroy ? "Destruction" : "Reconfiguration"}
            </div>
          </div>

          {isCreate && configAsset ? (
            <>
              {/* Row 2: Asset name | Asset unit | URL */}
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <div className="text-muted-foreground">Asset name</div>
                <div className="mt-2.5">{configAsset.getName()}</div>
              </div>
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <div className="text-muted-foreground">Asset unit</div>
                <div className="mt-2.5">{configAsset.getUnitName()}</div>
              </div>
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <div className="text-muted-foreground">URL</div>
                <div className="mt-2.5 text-[13px] min-w-0">
                  {configAsset.getUrl() ? (
                    <span className="group inline-flex items-center gap-1 max-w-full min-w-0">
                      <a
                        href={configAsset.getUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate"
                      >
                        {configAsset.getUrl()}
                      </a>
                      <Copyable
                        className="opacity-60 group-hover:opacity-100 shrink-0"
                        size="s"
                        value={configAsset.getUrl()}
                      />
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Row 3: Total supply | Decimals | Default frozen */}
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <div className="text-muted-foreground">Total supply</div>
                <div className="mt-2.5 inline-flex items-center gap-1">
                  <NumberFormat
                    value={configAsset.getTotalSupply()}
                    displayType="text"
                    thousandSeparator
                  />
                  <span>{configAsset.getUnitName()}</span>
                </div>
              </div>
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <div className="text-muted-foreground">Decimals</div>
                <div className="mt-2.5">{configAsset.getDecimals()}</div>
              </div>
              <div className="col-span-12 sm:col-span-6 md:col-span-4">
                <div className="text-muted-foreground">Default frozen</div>
                <div className="mt-2.5">
                  {configAsset.getDefaultFrozen() ? "True" : "False"}
                </div>
              </div>
            </>
          ) : null}
          <div className="col-span-12 -mx-5"><hr className="border-background" /></div>
          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">Manager account</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              {configAsset?.hasManager() ? (
                <LinkToAccount copySize="m" address={configAsset.getManager()} />
              ) : (
                "--None--"
              )}
            </div>
          </div>

          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">Reserve account</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              {configAsset?.hasReserve() ? (
                <LinkToAccount copySize="m" address={configAsset.getReserve()} />
              ) : (
                "--None--"
              )}
            </div>
          </div>

          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">Freeze account</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              {configAsset?.hasFreeze() ? (
                <LinkToAccount copySize="m" address={configAsset.getFreeze()} />
              ) : (
                "--None--"
              )}
            </div>
          </div>

          <div className="col-span-12 sm:col-span-6">
            <div className="text-muted-foreground">Clawback account</div>
            <div className="mt-2.5 text-[13px] break-words overflow-hidden">
              {configAsset?.hasClawback() ? (
                <LinkToAccount copySize="m" address={configAsset.getClawback()} />
              ) : (
                "--None--"
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {arc19Url ? (
      <div className="mt-7 rounded-lg p-5 bg-background-card">
        <div className="text-muted-foreground mb-2.5">ARC-19 Resolved URL</div>
        <div className="text-[13px] min-w-0">
          <span className="group inline-flex items-center gap-1 max-w-full min-w-0">
            <a
              href={arc19Url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline truncate"
            >
              {arc19Url}
            </a>
            <Copyable
              className="opacity-60 group-hover:opacity-100 shrink-0"
              size="s"
              value={arc19Url}
            />
          </span>
        </div>
      </div>
    ) : null}
    </>
  );
}

export default AssetConfigTransaction;
