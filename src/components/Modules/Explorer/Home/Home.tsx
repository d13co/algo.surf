import React, { Component } from "react";
import Search from '../Search/Search';
import LiveStats from "../LiveStats/LiveStats";
import LiveBlocks from "../LiveBlocks/LiveBlocks";
import LiveTransactions from "../LiveTransactions/LiveTransactions";
import useTitle from "../../../Common/UseTitle/UseTitle";

class PanelErrorBoundary extends Component<
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
                <div className="rounded-lg p-5 bg-background-card text-sm text-muted-foreground">
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

const network = process.env.REACT_APP_NETWORK;

function Home(): JSX.Element {
    useTitle("Home");

    return (
        <div>
            <div className="relative mt-[218px] max-md:mt-[217px]">
                <div className="relative ml-0.5 mt-[100px]">
                    <img src="/logo.png" className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[45%] opacity-[0.11] z-0 max-w-[80vw]" />
                    <div className="text-2xl ml-2.5">
                        <span className="text-muted-foreground">Algo</span> Surf{' '}
                        <span className="text-primary">{network}</span>
                    </div>
                    <div className="mt-6 mb-[200px]">
                        <Search autoFocus={true} size="lg" />
                    </div>
                    <div className="mt-15 flex">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                            <PanelErrorBoundary><LiveStats /></PanelErrorBoundary>
                            <PanelErrorBoundary><LiveBlocks /></PanelErrorBoundary>
                            <PanelErrorBoundary><LiveTransactions /></PanelErrorBoundary>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
