import React, { Component } from "react";
import Header from "../Header/Header";
import { DateFormatProvider } from "../../../../contexts/DateFormatContext";
import { AlgoMetricsProvider } from "@d13co/algo-metrics-react";
import { AlgoMetricsSDK } from "@d13co/algo-metrics-sdk";
import { LiveBlocksProvider } from "../../../../hooks/useLiveBlocks";
import { abel } from "../../../../packages/abel/abel";
import { getAbelAt } from "../../../../packages/abel/abelAt";

// Reads at past rounds (stats at ?round=R) go to the time-travel node's abel, looked up on each
// read so a node configured later is used.
const metricsSDK = new AlgoMetricsSDK({ abelGhostSDK: abel, historyAbelGhostSDK: getAbelAt });

class PageErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mt-10 mx-auto max-w-xl rounded-lg p-5 bg-background-card text-sm text-muted-foreground">
          <div className="font-semibold text-foreground mb-1">
            Something went wrong
          </div>
          <div>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Explorer({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element {
  return (
    <DateFormatProvider>
      <AlgoMetricsProvider sdk={metricsSDK}>
        <LiveBlocksProvider>
          <div className={className ? `explorer-root ${className}` : "explorer-root"}>
            <Header></Header>
            <PageErrorBoundary>
              {children}
            </PageErrorBoundary>
          </div>
        </LiveBlocksProvider>
      </AlgoMetricsProvider>
    </DateFormatProvider>
  );
}

export default Explorer;
