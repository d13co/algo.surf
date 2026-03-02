import { Github, Twitter, ChevronsUpDown, Check } from 'lucide-react';
import { network, Networks } from "../../packages/core-sdk/constants";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "src/components/v2/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "src/components/v2/ui/dropdown-menu";

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
                <NetworkSwitcher />
            </div>
        </div>
    );
}

function NetworkSwitcher() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary text-primary px-2.5 py-1 text-sm font-medium hover:bg-primary/10 focus:outline-none"
                >
                    {network}
                    <ChevronsUpDown size={13} className="opacity-60" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-background-card border-border text-foreground">
                {networkMap.map(([name, url]) => {
                    const current = name === network;
                    return (
                        <DropdownMenuItem key={name} asChild>
                            {/* TODO: figure out graceful network transition that maintains current page state
                                (e.g. stay on /account/:address when switching networks) */}
                            <a
                                href={url}
                                className="flex items-center gap-2 cursor-pointer"
                            >
                                <Check size={13} className={current ? "opacity-100" : "opacity-0"} />
                                {name}
                            </a>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default Footer;
