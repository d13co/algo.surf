import React, { useMemo } from "react";
import type { BalanceImpact as BalanceImpactMap } from "@d13co/algo-group-balance-impact";
import { useTinyAssets } from "src/components/Common/UseTinyAsset";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";
import LinkToAccount from "./Links/LinkToAccount";
import LinkToAsset from "./Links/LinkToAsset";

function BalanceImpact({
  balanceImpact,
  className = "",
}: {
  balanceImpact: BalanceImpactMap | null | undefined;
  className?: string;
}): JSX.Element | null {
  const assetIds = useMemo(() => {
    if (!balanceImpact) return [];
    const ids = new Set<number>();
    Object.values(balanceImpact).forEach((deltas) => {
      Object.keys(deltas).forEach((assetId) => ids.add(Number(assetId)));
    });
    return Array.from(ids);
  }, [balanceImpact]);

  const { data: assets } = useTinyAssets(assetIds);

  if (!balanceImpact || !assets || assetIds.length === 0) return null;

  return (
    <div className={`@container rounded-lg p-5 bg-background-card overflow-hidden min-w-0 ${className}`}>
      <div className="text-muted-foreground mb-4">Balance Impact</div>
      <div className="flex flex-col gap-3">
        {Object.entries(balanceImpact).map(([account, deltas]) => (
          <div key={account} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4 min-w-0">
            {/* The panel is half a column on the group page and full width on a
                txn page, so the address length keys off the panel's own width
                (@container), not the viewport. ~48rem is where a full address
                plus the amount column fits. */}
            <div className="shrink-0 max-w-[120px] @[48rem]:max-w-none">
              <span className="@[48rem]:hidden">
                <LinkToAccount copy="left" strip={8} address={account} />
              </span>
              <span className="hidden @[48rem]:inline-flex">
                <LinkToAccount copy="left" address={account} />
              </span>
            </div>
            <div className="flex flex-col gap-1 pl-6 sm:pl-0 sm:items-end sm:text-right">
              {Object.entries(deltas).sort(([, a], [, b]) => a - b).map(([assetId, delta]) => {
                const asset = assets?.find((a) => a.index === Number(assetId));
                const assetLabel =
                  assetId === "0" ? "ALGO" : asset?.params["unit-name"] || assetId;
                const decimals =
                  assetId === "0" ? 6 : asset?.params.decimals || 0;
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
  );
}

export default BalanceImpact;
