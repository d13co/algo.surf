import React from "react";
import {useLocation} from "react-router-dom";
import Search from "../Search/Search";
import Logo from "./Logo";
import Link from "../v2/Links/Link";
import { surfIdxSupported } from "src/utils/surfIdx";

const networkLabel = process.env.REACT_APP_NETWORK;

const routes = ["home", "accounts", "transactions", "assets", "applications", "fees", "tps", "upgrades", "lsigs"];
// Pages under Metrics.
const METRICS = ["tps", "fees"];

const navItems: { href: string; label: React.ReactNode; value: string }[] = [
    { href: "/", label: <Logo />, value: "home" },
    { href: "/accounts", label: "Accounts", value: "accounts" },
    { href: "/transactions", label: "Txns", value: "transactions" },
    { href: "/assets", label: "Assets", value: "assets" },
    { href: "/applications", label: "Apps", value: "applications" },
    ...(surfIdxSupported
        ? [
              { href: "/tps", label: "Metrics", value: "metrics" },
              { href: "/upgrades", label: "Upgrades", value: "upgrades" },
          ]
        : []),
];

function Header(): JSX.Element {
    const location = useLocation();
    // LSigs (/lsigs) is left out of the menu for now; its pages are still linked from accounts and txns.
    const items = navItems;

    const route: string | false = React.useMemo(() => {
        const r = location.pathname.substring(1).split('/')[0];
        if (routes.indexOf(r) === -1) {
            if (r === "") return "home";
            return false;
        }
        return METRICS.includes(r) ? "metrics" : r;
    }, [location.pathname]);

    return (
        <div className="mb-5">
            <div className="flex justify-between items-center max-header:flex-col max-header:items-stretch">
                <nav className="flex items-center -ml-3 overflow-x-auto">
                    {items.map((item) => (
                        <Link
                            key={item.value}
                            // On a metrics page, Metrics stays on it.
                            href={route === "metrics" && item.value === "metrics" ? location.pathname + location.search : item.href}
                            noStyle
                            className={`px-3 py-2 text-base whitespace-nowrap text-muted-foreground ${
                                route === item.value
                                    ? "border-b-2 border-primary"
                                    : "border-b-2 border-transparent"
                            }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>
                {route !== "home" ? (
                    <div className="animate-in slide-in-from-top duration-300 max-header:mt-2">
                        <Search placeholder={`Search ${networkLabel} [Ctrl+K]`} size="responsive"/>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default Header;
