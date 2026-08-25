import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "src/components/v2/ui/button";
import { Alert, AlertDescription } from "src/components/v2/ui/alert";
import {
  getLocalNodeAccess,
  getOtherNetworkNodeConfigs,
  isLocalNodeConfig,
  networkToDomainMap,
  shouldProbeLocalNodes,
  LocalNodeAccess,
} from "src/utils/nodeConfig";
import { network, Networks } from "src/packages/core-sdk/constants";
import { TransactionClient } from "src/packages/core-sdk/clients/transactionClient";
import { Network } from "src/packages/core-sdk/network";
import { NodeConnectionParams } from "src/packages/core-sdk/types";

const isLocalnet = process.env.REACT_APP_NETWORK === "Localnet";
const TOTAL_RETRIES = 5;

const networkOrder = Object.keys(Networks) as Networks[];

type NetworkConfig = [Networks, NodeConnectionParams];

/** The other networks, split by whether their node runs on the user's machine. */
function getSearchableNetworks(): {
  local: NetworkConfig[];
  remote: NetworkConfig[];
} {
  const configs = [...getOtherNetworkNodeConfigs()] as NetworkConfig[];
  return {
    local: configs.filter(([, config]) => isLocalNodeConfig(config)),
    remote: configs.filter(([, config]) => !isLocalNodeConfig(config)),
  };
}

/** Reports each network that holds the transaction as its node answers. */
async function findTransaction(
  id: string,
  configs: NetworkConfig[],
  onFound: (network: Networks) => void,
): Promise<void> {
  await Promise.all(
    configs.map(async ([network, config]) => {
      try {
        const client = new TransactionClient(new Network(config));
        await client.get(id);
        onFound(network);
      } catch (e) {
        // not on this network, or the node is unreachable
      }
    }),
  );
}

function getRetries(hash: string): number {
  const regex = /retry=(\d)/g;
  const match = regex.exec(hash);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0;
}

function CustomError({
  error,
  type,
  id,
}: {
  error?: string;
  type?: string;
  id?: string;
}): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [retry, setRetry] = useState(0);
  const [countdown, setCountdown] = useState(2);

  const searchable = type === "transaction" && !!id;
  const [otherNetworks, setOtherNetworks] = useState<Networks[]>([]);
  // Only tracks the public networks: the localnet search is decoupled, so it
  // never holds up these results or the retry loop below.
  const [checkingRemoteNetworks, setCheckingRemoteNetworks] =
    useState(searchable);
  const [localAccess, setLocalAccess] = useState<LocalNodeAccess | null>(null);
  const [localSearch, setLocalSearch] = useState<"idle" | "checking" | "done">(
    "idle",
  );

  const found = (network: Networks) =>
    setOtherNetworks((current) =>
      current.includes(network)
        ? current
        : [...current, network].sort(
            (a, b) => networkOrder.indexOf(a) - networkOrder.indexOf(b),
          ),
    );

  useEffect(() => {
    let countdownTmot: ReturnType<typeof setTimeout>;
    let reloadTmot: ReturnType<typeof setTimeout>;
    if (isLocalnet && !checkingRemoteNetworks && otherNetworks.length === 0) {
      const retry = getRetries(location.hash);
      setRetry(retry);
      if (retry < TOTAL_RETRIES) {
        const newLocation = new URL(window.location.href);
        newLocation.hash = `#retry=${retry + 1}`;
        countdownTmot = setTimeout(() => setCountdown(1), 1_000);
        reloadTmot = setTimeout(() => {
          setCountdown(0);
          window.history.replaceState(null, null, newLocation.toString());
          window.location.reload();
        }, 2_000);
      }
    }
    return () => {
      clearTimeout(countdownTmot);
      clearTimeout(reloadTmot);
    };
  }, [location.hash, checkingRemoteNetworks, otherNetworks.length]);

  // The public networks: searched right away, each reporting as it answers so
  // one slow node cannot hide the ones that did find the transaction.
  useEffect(() => {
    if (!searchable) {
      setOtherNetworks([]);
      setCheckingRemoteNetworks(false);
      return;
    }
    let cancelled = false;
    setOtherNetworks([]);
    setCheckingRemoteNetworks(true);
    setLocalSearch("idle");
    findTransaction(id, getSearchableNetworks().remote, (network) => {
      if (!cancelled) {
        found(network);
      }
    }).then(() => {
      if (!cancelled) {
        setCheckingRemoteNetworks(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchable, id]);

  // Reaching a localnet node means reaching the user's own machine, which the
  // browser gates. Ask it where we stand - querying never prompts - and only
  // search unattended if the permission is already granted.
  useEffect(() => {
    if (
      !searchable ||
      !shouldProbeLocalNodes() ||
      getSearchableNetworks().local.length === 0
    ) {
      setLocalAccess(null);
      return;
    }
    let cancelled = false;
    getLocalNodeAccess().then((access) => {
      if (!cancelled) {
        setLocalAccess(access);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchable, id]);

  useEffect(() => {
    if (localAccess === "granted" && localSearch === "idle") {
      setLocalSearch("checking");
    }
  }, [localAccess, localSearch]);

  useEffect(() => {
    if (localSearch !== "checking" || !id) {
      return;
    }
    let cancelled = false;
    findTransaction(id, getSearchableNetworks().local, (network) => {
      if (!cancelled) {
        found(network);
      }
    }).then(() => {
      if (!cancelled) {
        setLocalSearch("done");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, localSearch]);

  // Asking for local network access is worth a permission prompt only once the
  // public networks have come back empty.
  const showLocalnet =
    localAccess !== null &&
    localAccess !== "denied" &&
    !checkingRemoteNetworks &&
    otherNetworks.length === 0;

  return (
    <div className="mt-36 mb-8">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <h4 className="text-2xl font-bold text-foreground">
            Something went wrong
          </h4>
          <Alert className="mt-5 bg-background-card border-none text-foreground rounded-lg">
            <AlertDescription className="line-clamp-3 break-all">
              {error ? (
                error
              ) : (
                <>The resource you are looking for is not available.</>
              )}
            </AlertDescription>
          </Alert>
          {otherNetworks.length > 0 ? (
            <div className="mt-5 p-5 rounded-[10px] font-bold italic border-l-2 border-l-yellow-500 bg-yellow-500/10">
              You are on Algo Surf {network}, but this transaction exists on{" "}
              {otherNetworks.map((otherNetwork, index) => (
                <span key={otherNetwork}>
                  <a
                    href={`${networkToDomainMap[otherNetwork]}${location.pathname}${location.search}`}
                    className="text-yellow-500 hover:underline"
                  >
                    {otherNetwork}
                  </a>
                  {index < otherNetworks.length - 1
                    ? index === otherNetworks.length - 2
                      ? " and "
                      : ", "
                    : ""}
                </span>
              ))}
              .
            </div>
          ) : null}

          {showLocalnet ? (
            <Alert className="mt-5 bg-background-card border-none text-foreground rounded-lg">
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {localSearch === "checking" ? (
                  <>Looking for this transaction on your localnet&hellip;</>
                ) : localSearch === "done" ? (
                  <>This transaction is not on your localnet either.</>
                ) : (
                  <>
                    <span>
                      Transaction not found on any public network. Your localnet runs on this
                      machine, so your browser may ask permission to reach it.
                    </span>
                    <Button
                      variant="outline"
                      className="border-border text-primary hover:bg-primary/10"
                      onClick={() => setLocalSearch("checking")}
                    >
                      Check my localnet
                    </Button>
                  </>
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          {isLocalnet &&
          !checkingRemoteNetworks &&
          otherNetworks.length === 0 ? (
            <Alert className="mt-5 bg-background-card border-none text-foreground rounded-lg">
              <AlertDescription>
                Localnet retry {retry} / {TOTAL_RETRIES} &middot;{" "}
                {retry < TOTAL_RETRIES ? (
                  <>Retrying in {countdown} seconds</>
                ) : (
                  <>Retries exhausted</>
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              className="border-border text-primary hover:bg-primary/10"
              onClick={() => navigate("/")}
            >
              Home
            </Button>
            <Button
              variant="outline"
              className="border-border text-primary hover:bg-primary/10"
              onClick={() => {
                const url = new URL(window.location.href);
                url.hash = "";
                window.history.replaceState(null, null, url.toString());
                window.location.reload();
              }}
            >
              Reload
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CustomError;
