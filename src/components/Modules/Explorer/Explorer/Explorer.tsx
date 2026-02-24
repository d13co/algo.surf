import React, { Component } from "react";
import "./Explorer.scss";
import Header from "../Header/Header";
import { LiveDataProvider } from "../../../../hooks/useLiveData";
import { DateFormatProvider } from "../../../../contexts/DateFormatContext";

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

function Explorer({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <DateFormatProvider>
      <LiveDataProvider>
        <div className="explorer-root">
          <Header></Header>
          <PageErrorBoundary>
            {children}
          </PageErrorBoundary>
        </div>
      </LiveDataProvider>
    </DateFormatProvider>
  );
}

export default Explorer;
