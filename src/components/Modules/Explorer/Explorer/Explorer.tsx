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

/** The explorer's providers and page; `header={false}` leaves out the site header, for a page with its own. */
function Explorer({ children, className, header = true }: { children: React.ReactNode; className?: string; header?: boolean }): JSX.Element {
  return (
    <DateFormatProvider>
      <AlgoMetricsProvider sdk={metricsSDK}>
        <LiveBlocksProvider>
          <div className={className ? `explorer-root ${className}` : "explorer-root"}>
            {header ? <Header /> : null}
            <PageErrorBoundary>
              {children}
            </PageErrorBoundary>
          </div>
        </LiveBlocksProvider>
      </AlgoMetricsProvider>
    </DateFormatProvider>
  );
}

// Layout re-renders on every navigation (useMatch); its children come from AppRouter and don't change,
// so without memo every navigation re-renders the providers and every useDateFormat consumer.
export default React.memo(Explorer);
