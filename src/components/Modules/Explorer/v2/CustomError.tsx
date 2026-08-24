import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "src/components/v2/ui/button";
import { Alert, AlertDescription } from "src/components/v2/ui/alert";
import {
  shouldProbeLocalNodes,
  getOtherNetworkNodeConfigs,
  isLocalNodeConfig,
  networkToDomainMap,
} from "src/utils/nodeConfig";
import { network, Networks } from "src/packages/core-sdk/constants";
import { TransactionClient } from "src/packages/core-sdk/clients/transactionClient";
import { Network } from "src/packages/core-sdk/network";
import { NodeConnectionParams } from "src/packages/core-sdk/types";

const isLocalnet = process.env.REACT_APP_NETWORK === "Localnet";
const TOTAL_RETRIES = 5;

const networkOrder = Object.keys(Networks) as Networks[];

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

  const [otherNetworks, setOtherNetworks] = useState<Networks[]>([]);
  // Only tracks the remote networks: the localnet probe is decoupled, so it
  // never holds up the retry loop or the results of the reachable networks.
  const [checkingRemoteNetworks, setCheckingRemoteNetworks] = useState(
    type === "transaction" && !!id,
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

  useEffect(() => {
    if (type !== "transaction" || !id) {
      setOtherNetworks([]);
      setCheckingRemoteNetworks(false);
      return;
    }

    let cancelled = false;
    setOtherNetworks([]);
    setCheckingRemoteNetworks(true);

    const found = (network: Networks) => {
      if (cancelled) {
        return;
      }
      setOtherNetworks((current) =>
        current.includes(network)
          ? current
          : [...current, network].sort(
              (a, b) => networkOrder.indexOf(a) - networkOrder.indexOf(b),
            ),
      );
    };

    // Report each network as soon as it answers, so one slow or unreachable
    // node cannot hide the ones that did find the transaction.
    const probe = async ([network, config]: [
      Networks,
      NodeConnectionParams,
    ]) => {
      try {
        const client = new TransactionClient(new Network(config));
        await client.get(id);
        found(network);
      } catch (e) {
        // not on this network, or the node is unreachable
      }
    };

    const configs = [...getOtherNetworkNodeConfigs()] as [
      Networks,
      NodeConnectionParams,
    ][];
    const [localConfigs, remoteConfigs] = configs.reduce<
      [[Networks, NodeConnectionParams][], [Networks, NodeConnectionParams][]]
    >(
      (acc, entry) => {
        acc[isLocalNodeConfig(entry[1]) ? 0 : 1].push(entry);
        return acc;
      },
      [[], []],
    );

    Promise.all(remoteConfigs.map(probe)).then(() => {
      if (!cancelled) {
        setCheckingRemoteNetworks(false);
      }
    });

    // A localnet node lives on the user's own machine, which browsers gate
    // behind a local network access prompt. Fire it off on its own and never
    // await it: it still reports a hit when it lands, but the remote lookups
    // and the retry loop no longer wait on that dialog.
    if (shouldProbeLocalNodes()) {
      localConfigs.forEach(probe);
    }

    return () => {
      cancelled = true;
    };
  }, [type, id]);

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
