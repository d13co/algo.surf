import "./Footer.scss";
import {Link, Tooltip} from "@mui/material";
import { Github, Twitter } from 'lucide-react';

const map = {
    "Mainnet": "https://algorand.observer",
    "Testnet": "https://testnet.algorand.observer",
    "Localnet": "https://localnet.algorand.observer",
    "Betanet": "https://betanet.algorand.observer",
    "FNet": "https://fnet.algorand.observer",
}

function Footer(): JSX.Element {
    return <div className="footer">
        <div className="left">
            Algorand Observer
            <Tooltip title="Source on Github">
                <Link href="https://github.com/d13co/algorand.observer"><Github size={16} color="white" strokeWidth={1.75} /></Link>
            </Tooltip>
            <Tooltip title="Maintainer on X">
                <Link href="https://x.com/d13_co"><Twitter size={16} color="white" strokeWidth={1.75} /></Link>
            </Tooltip>
        </div>
        <div>
            <Tooltip title="Switch network">
                <span>
                    <Networks />
                </span>
            </Tooltip>
        </div>
    </div>
}

const network = process.env.REACT_APP_NETWORK;

function Networks() {
    return <>{Object.entries(map)
        .sort(([a], [b]) => a === network ? -1 : b === network ? 1 : 0)
        .map(([name, url], i, a) => {
        const current = name === process.env.REACT_APP_NETWORK;
        const last = i === a.length - 1;
        console.log({current, name});
        return <><Link href={url} className={current ? "current": ""} key={`net-${name}`}>{name}</Link>{!last ? <>{' '}&middot;{' '}</> : null}</>
    })}</>
}

export default Footer;
