import "./Footer.scss";
import {Link, Tooltip} from "@mui/material";
import { Github, Twitter } from 'lucide-react';
import { network, Networks } from "../../packages/core-sdk/constants";

const map: Record<Networks, string> = {
    "Mainnet": "https://algo.surf",
    "Testnet": "https://testnet.algo.surf",
    "Localnet": "https://localnet.algo.surf",
    "Betanet": "https://betanet.algo.surf",
    "Fnet": "https://fnet.algo.surf",
}

const networkMap = Object.entries(map) as [keyof typeof map, string][];

function Footer(): JSX.Element {
    return <div className="footer">
        <div className="left">
            algo.surf
            <Tooltip title="Source on Github">
                <Link href="https://github.com/d13co/algo.surf"><Github size={16} color="white" strokeWidth={1.75} /></Link>
            </Tooltip>
            <Tooltip title="Profile on X">
                <Link href="https://x.com/algo_surf"><Twitter size={16} color="white" strokeWidth={1.75} /></Link>
            </Tooltip>
            <Tooltip title="Profile on BlueSky">
                <Link href="https://bsky.app/profile/algo.surf">
                    <img src="/bluesky.svg" className="sociallogo"/>
                </Link>
            </Tooltip>
        </div>
        <div>
            <Tooltip title="Switch network">
                <span>
                    <NetworksComponent />
                </span>
            </Tooltip>
        </div>
    </div>
}

function NetworksComponent() {
    return <>{
        networkMap.sort(([a], [b]) => a === network ? -1 : b === network ? 1 : 0)
        .map(([name, url], i, a) => {
        const current = name === network;
        const last = i === a.length - 1;
        return <span key={`net-${name}`}><Link href={url} className={current ? "current": ""}>{name}</Link>{!last ? <>{' '}&middot;{' '}</> : null}</span>
    })}</>
}

export default Footer;
