import { Github, Twitter } from 'lucide-react';
import { network, Networks } from "../../packages/core-sdk/constants";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const map: Record<Networks, string> = {
    "Mainnet": "https://algo.surf",
    "Testnet": "https://testnet.algo.surf",
    "Localnet": "https://localnet.algo.surf",
    "Betanet": "https://betanet.algo.surf",
    "Fnet": "https://fnet.algo.surf",
}

const networkMap = Object.entries(map) as [keyof typeof map, string][];

function Footer(): JSX.Element {
    return (
        <div className="flex justify-between items-center text-[85%] mt-6 opacity-60 hover:opacity-100 transition-opacity px-2.5 md:px-[100px] py-2.5">
            <div className="flex items-center">
                algo.surf
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a href="https://github.com/d13co/algo.surf" className="ml-2.5 inline-flex items-center">
                                <Github size={16} color="white" strokeWidth={1.75} />
                            </a>
                        </TooltipTrigger>
                        <TooltipContent className="bg-black text-white border-border">
                            <p>Source on Github</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a href="https://x.com/algo_surf" className="ml-1.5 inline-flex items-center">
                                <Twitter size={16} color="white" strokeWidth={1.75} />
                            </a>
                        </TooltipTrigger>
                        <TooltipContent className="bg-black text-white border-border">
                            <p>Profile on X</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a href="https://bsky.app/profile/algo.surf" className="ml-1.5 inline-flex items-center">
                                <img src="/bluesky.svg" className="ml-0.5 h-3.5" />
                            </a>
                        </TooltipTrigger>
                        <TooltipContent className="bg-black text-white border-border">
                            <p>Profile on BlueSky</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            <div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <NetworksComponent />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent className="bg-black text-white border-border">
                            <p>Switch network</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    );
}

function NetworksComponent() {
    return <>{
        networkMap.sort(([a], [b]) => a === network ? -1 : b === network ? 1 : 0)
        .map(([name, url], i, a) => {
            const current = name === network;
            const last = i === a.length - 1;
            return (
                <span key={`net-${name}`}>
                    <a
                        href={url}
                        className={current ? "no-underline text-white" : "text-primary hover:underline"}
                    >
                        {name}
                    </a>
                    {!last ? <>{' '}&middot;{' '}</> : null}
                </span>
            );
        })
    }</>;
}

export default Footer;
