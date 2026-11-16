import React, { Component } from "react";
import Search from '../Search/Search';
import LiveStats from "../LiveStats/LiveStats";
import LiveUpgrade from "../LiveUpgrade/LiveUpgrade";
import LiveBlocks from "../LiveBlocks/LiveBlocks";
import LiveTransactions from "../LiveTransactions/LiveTransactions";
import useTitle from "../../../Common/UseTitle/UseTitle";
import humanizeDuration from "humanize-duration";
import dateFormat from "dateformat";
import { useRound } from "src/hooks/useRound";
import { useNarrow } from "src/hooks/useNarrow";
import { useBlockHeader } from "src/hooks/useBlock";
import TimeTravelPicker from "../Header/TimeTravelPicker";
import HomeStepper from "./HomeStepper";
import HomeTimeline from "./HomeTimeline";

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

/** The panels, live or at the page's round: they read the same sources either way. */
function Panels(): JSX.Element {
    const narrow = useNarrow();
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            {/* Full-width row above the panels. empty:hidden collapses it when
                there's no upgrade — PanelErrorBoundary renders children with no
                wrapper, so this div is genuinely empty then and grid drops it
                instead of leaving a phantom row and a stray gap. */}
            <div className="md:col-span-3 empty:hidden">
                <PanelErrorBoundary><LiveUpgrade /></PanelErrorBoundary>
            </div>
            <PanelErrorBoundary><LiveStats /></PanelErrorBoundary>
            <PanelErrorBoundary><LiveBlocks /></PanelErrorBoundary>
            {/* Not on phones (not even mounted): one column, and the blocks already list what's in them. */}
            {narrow ? null : <PanelErrorBoundary><LiveTransactions /></PanelErrorBoundary>}
        </div>
    );
}

/** The homepage as it was at block `round`: which moment, a search at it, ways to move, then the panels. */
function HomeAt({ round }: { round: number }): JSX.Element {
    const { data: header } = useBlockHeader(round);
    const ts = header?.timestamp ? Number(header.timestamp) : undefined;
    const ago = ts !== undefined ? humanizeDuration((Date.now() / 1000 - ts) * 1000, { largest: 2, round: true }) : undefined;

    return (
        <div className="mt-10 flex flex-col gap-8">
            <section aria-label="The moment shown" className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="text-base text-muted-foreground">
                        <span>Algo</span> <span className="text-foreground">Surf</span> <span className="text-primary">{network}</span> · as it was at
                    </div>
                    <h1 className="text-4xl font-extrabold leading-tight">
                        <span className="text-muted">Block</span> <span className="text-primary">{round.toLocaleString()}</span>
                    </h1>
                    <div className="text-sm text-muted-foreground min-h-5">
                        {ts !== undefined ? (
                            <>
                                <span className="text-foreground">{dateFormat(new Date(ts * 1000), "UTC:d mmm yyyy, HH:MM:ss")} UTC</span> · {ago} ago
                            </>
                        ) : null}
                    </div>
                </div>
                <div className="min-w-0 flex-1 basis-[420px] max-w-[600px] self-center">
                    <Search placeholder={`Search ${network} at block ${round.toLocaleString()}`} />
                </div>
            </section>
            <HomeStepper round={round} />
            <HomeTimeline round={round} roundTs={ts} />
            <Panels />
        </div>
    );
}

function Home(): JSX.Element {
    const { round } = useRound();
    useTitle(round !== undefined ? `Home at block ${round}` : "Home");

    if (round !== undefined) return <HomeAt round={round} />;

    return (
        <div>
            <div className="relative mt-[218px] max-md:mt-[217px]">
                <div className="relative ml-0.5 mt-[100px]">
                    <img src="/logo.png" className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[45%] opacity-[0.11] z-0 max-w-[80vw]" />
                    <div className="text-2xl ml-2.5">
                        <span className="text-muted-foreground">Algo</span> Surf{' '}
                        <span className="text-primary">{network}</span>
                    </div>
                    <div className="mt-6">
                        <Search autoFocus={true} size="lg" />
                    </div>
                    <div className="relative mt-2 flex justify-center">
                        <TimeTravelPicker label="Travel to a date or block" />
                    </div>
                    <div className="relative mt-[150px]">
                        <HomeTimeline />
                    </div>
                    <div className="mt-10 flex">
                        <Panels />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
