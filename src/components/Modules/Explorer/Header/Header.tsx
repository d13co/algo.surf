import React from "react";
import {useLocation} from "react-router-dom";
import Search from "../Search/Search";
import Logo from "./Logo";
import TimeTravelPicker from "./TimeTravelPicker";
import Link from "../v2/Links/Link";
import { surfIdxSupported } from "src/utils/surfIdx";
import { useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";

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
    const lsigs = useSurfIdxCaps()?.lsigs;
    const items = lsigs ? [...navItems, { href: "/lsigs", label: "LSigs", value: "lsigs" }] : navItems;

    const route: string | false = React.useMemo(() => {
        const r = location.pathname.substring(1).split('/')[0];
        if (routes.indexOf(r) === -1) {
            if (r === "") return "home";
            return false;
        }
        return METRICS.includes(r) ? "metrics" : r;
    }, [location.pathname]);

    // The nav fades out at its right edge only while there is more of it to scroll to.
    const nav = React.useRef<HTMLElement>(null);
    const [more, setMore] = React.useState(false);
    const updateMore = React.useCallback(() => {
        const el = nav.current;
        if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }, []);
    React.useEffect(() => {
        const el = nav.current;
        if (!el) return;
        updateMore();
        const observer = new ResizeObserver(updateMore);
        observer.observe(el);
        return () => observer.disconnect();
    }, [updateMore, items.length]);

    return (
        <div className="mb-5">
            {/* The time-travel button stays at the top right at every width; on narrow screens the
                nav scrolls sideways beside it (fading out under it) and the search takes a row below. */}
            <div className="flex flex-wrap items-center gap-x-2">
                <nav
                    ref={nav}
                    onScroll={updateMore}
                    className={`flex min-w-0 flex-1 items-center -ml-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                        more ? "[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]" : ""
                    }`}
                >
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
                <div className="shrink-0">
                    <TimeTravelPicker />
                </div>
                {route !== "home" ? (
                    <div className="animate-in slide-in-from-top duration-300 max-header:mt-2 max-header:basis-full">
                        <Search placeholder={`Search ${networkLabel} [Ctrl+K]`} size="responsive"/>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default Header;
