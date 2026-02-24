import React from "react";
import LinkToAsset from "../../../Links/LinkToAsset";

function AppCallTxnForeignAssets({
  assets,
}: {
  assets: number[];
}): JSX.Element {
  return (
    <div className="rounded-lg p-5 bg-background-card">
      <div className="text-muted-foreground mb-4">Foreign assets</div>
      <div className="space-y-4 text-[13px]">
        {assets.map((asset, index) => (
          <div key={asset} className="flex items-center gap-2">
            <span className="shrink-0 tabular-nums">{String(index).padStart(2, '0')}.</span>
            <LinkToAsset id={asset} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AppCallTxnForeignAssets;
