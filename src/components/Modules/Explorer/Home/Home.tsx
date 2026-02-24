import React from "react";
import Search from '../Search/Search';
import LiveStats from "../LiveStats/LiveStats";
import LiveBlocks from "../LiveBlocks/LiveBlocks";
import LiveTransactions from "../LiveTransactions/LiveTransactions";
import useTitle from "../../../Common/UseTitle/UseTitle";

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
                    <div className="mt-6 mb-[200px] max-md:ml-[18px]">
                        <Search autoFocus={true} size="lg" />
                    </div>
                    <div className="mt-15 flex">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                            <LiveStats />
                            <LiveBlocks />
                            <LiveTransactions />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
