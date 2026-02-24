import React from "react";
import LinkToApplication from "../../../Links/LinkToApplication";

function AppCallTxnForeignApps({ apps }: { apps: number[] }): JSX.Element {
  return (
    <div className="rounded-lg p-5 bg-background-card">
      <div className="text-muted-foreground mb-4">Foreign apps</div>
      <div className="space-y-4 text-[13px]">
        {apps.map((app, index) => (
          <div key={app} className="flex items-center gap-2">
            <span className="shrink-0 tabular-nums">{String(index).padStart(2, '0')}.</span>
            <LinkToApplication id={app} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AppCallTxnForeignApps;
