import "./Footer.scss";
import {Link} from "@mui/material";

const map = {
    "Mainnet": "https://algorand.observer",
    "Testnet": "https://testnet.algorand.observer",
    "Localnet": "https://localnet.algorand.observer",
    "Betanet": "https://betanet.algorand.observer",
    "FNet": "https://fnet.algorand.observer",
}

function Footer(): JSX.Element {
    return <div className="footer">
        <div>
            Algorand Observer &middot; <Link href="https://github.com/d13co/algorand.observer">Github</Link> &middot; <Link href="https://x.com/d13_co">&nbsp;X&nbsp;</Link> 
        </div>
        <div><Networks /></div>
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
