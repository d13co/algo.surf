import { Navigate, Outlet, matchPath, useLocation, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import TabsUnderline from "src/components/v2/shadcn-studio/tabs/tabs-11";
import { useControllingAccounts } from "src/hooks/useAccount";
import { useRound, useRoundNavigate } from "src/hooks/useRound";

/**
 * The Controlling accounts tab: the accounts rekeyed to this one now (Current, from the indexer, so
 * latest only) and ever (History, from surf idx). /controller opens Current unless it's empty.
 */
function AccountController(): JSX.Element {
  const { address } = useParams();
  const { pathname, search } = useLocation();
  const { round } = useRound();
  const navigate = useRoundNavigate();
  const base = `/account/${address}/controller`;
  // The account page's own query, no new request; none at a past round, which opens History.
  const { data, isError } = useControllingAccounts(address!, round === undefined);

  if (matchPath("/account/:address/controller", pathname)) {
    if (round === undefined && !data && !isError) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    const current = round === undefined && !!data?.pages[0]?.accounts.length;
    return <Navigate to={{ pathname: `${base}/${current ? "current" : "history"}`, search }} replace />;
  }

  const view = matchPath("/account/:address/controller/history", pathname) ? "history" : "current";
  return (
    <div className="mt-3">
      <TabsUnderline
        value={view}
        activationMode="manual"
        tabs={[
          { name: "Current", value: "current", onClick: () => navigate(`${base}/current`) },
          { name: "History", value: "history", onClick: () => navigate(`${base}/history`) },
        ]}
      />
      <Outlet />
    </div>
  );
}

export default AccountController;
