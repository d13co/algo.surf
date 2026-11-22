import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAlgoMetricsContext } from "@d13co/algo-metrics-react";
import type { TsTcWatcherSimpleCallback } from "@d13co/algo-metrics-sdk";
import type { indexerModels } from "algosdk";
import { AccountClient } from "src/packages/core-sdk/clients/accountClient";
import { network } from "src/packages/core-sdk/constants";
import explorer from "src/utils/dappflow";
import { counterparty, FetchPage, scan, ScanState, WatchDirection, WatchSide } from "src/utils/accountWatch";

export type { WatchDirection } from "src/utils/accountWatch";

export type WatchStatus = "idle" | "armed" | "fired";

export interface FiredTxn {
  txid: string;
  round?: bigint;
  type?: string;
  side: WatchSide;
  counterparty?: string;
}

// Pages a check reads before leaving the rest (older txns) to the next round's check.
const MAX_PAGES = 5;
// A page's request is abandoned after this long; the next round resumes at that page.
const PAGE_TIMEOUT_MS = 15_000;
// Arming reads algod's latest round, given up after this long.
const STATUS_TIMEOUT_MS = 10_000;
// Checks failing in a row before the button says it's having trouble.
const FAILURES_BEFORE_TROUBLE = 5;
// No round from the SDK's watcher for this long: register again (its loop stops for good when it
// fails to start, and a registration restarts it) and check meanwhile.
const STALL_MS = 60_000;
const WATCHDOG_MS = 30_000;

const TXN_TYPE_LABELS: Record<string, string> = {
  pay: "Payment",
  axfer: "Asset transfer",
  afrz: "Asset freeze",
  acfg: "Asset config",
  appl: "App call",
  keyreg: "Key registration",
  stpf: "State proof",
  hb: "Heartbeat",
};

const notificationsSupported = typeof window !== "undefined" && "Notification" in window;

function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 5)}…${address.slice(-5)}` : address;
}

/** A signal aborted after `ms`, or with `parent`; `done` releases it. */
function timedSignal(parent: AbortSignal, ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (parent.aborted) abort();
  const timer = setTimeout(abort, ms);
  parent.addEventListener("abort", abort, { once: true });
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
    },
  };
}

const PERMISSION_RESET = "Notification permission was reset, so the account isn't being watched.";

/** shown; blocked: permission was taken back; failed: the browser can't show one from a page (Chrome on Android). */
type NotifyResult = "shown" | "blocked" | "failed";

/**
 * Watches `address` for its next incoming, outgoing or any transaction while the page is open, and
 * shows one browser notification when it comes; then it stops until armed again.
 *
 * Each new round from the metrics SDK's watcher (header only) asks the indexer for the address's
 * transactions from the first round not yet read, so rounds skipped by a suspended tab are still
 * read. `label` names the account in the notification (an NFD or address book label).
 */
export function useAccountWatch(address: string, label?: string) {
  const { sdk } = useAlgoMetricsContext();
  const queryClient = useQueryClient();
  // useNavigate changes with the path (each account tab): kept in a ref so the watch isn't restarted.
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const labelRef = useRef(label);
  labelRef.current = label;

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    notificationsSupported ? Notification.permission : "denied"
  );
  const [status, setStatus] = useState<WatchStatus>("idle");
  const [direction, setDirection] = useState<WatchDirection>("incoming");
  const [fired, setFired] = useState<FiredTxn>();
  const [arming, setArming] = useState(false);
  /** Why the last arm didn't start, or why a watch ended without a notification. */
  const [notice, setNotice] = useState<string>();
  /** The browser can't show notifications from this page. */
  const [unavailable, setUnavailable] = useState(false);
  /** While armed: the last few checks failed (they keep retrying). */
  const [trouble, setTrouble] = useState(false);

  const scanRef = useRef<ScanState>({ minRound: 0n });
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const firedRoundRef = useRef<bigint>();
  const armingRef = useRef(false);

  // Follow permission changes made in the browser's site settings.
  useEffect(() => {
    if (!notificationsSupported) return;
    const sync = () => setPermission(Notification.permission);
    window.addEventListener("focus", sync);
    let cancelled = false;
    let permStatus: PermissionStatus | undefined;
    navigator.permissions
      ?.query({ name: "notifications" })
      .then((s) => {
        if (cancelled) return;
        permStatus = s;
        s.onchange = sync;
      })
      .catch(() => {
        // Not queryable in this browser: focus still re-reads it.
      });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", sync);
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  const notify = useCallback(
    (txn: indexerModels.Transaction, side: WatchSide): NotifyResult => {
      if (Notification.permission !== "granted") return "blocked";
      const typeLabel = TXN_TYPE_LABELS[txn.txType ?? ""] ?? txn.txType ?? "Transaction";
      const other = counterparty(txn, side, address);
      const body = [
        `${labelRef.current || short(address)}: ${typeLabel}`,
        other && other !== address ? `${side === "incoming" ? "from" : "to"} ${short(other)}` : "",
        txn.confirmedRound !== undefined ? `in round ${txn.confirmedRound}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      try {
        const n = new Notification(`${side === "incoming" ? "Incoming" : "Outgoing"} transaction on ${network}`, {
          body,
          // One per txn: a notification replacing one with the same tag shows no banner and makes no sound.
          tag: `watch-${address}-${txn.id ?? txn.confirmedRound}`,
          icon: "/logo.png",
        });
        n.onclick = () => {
          window.focus();
          if (txn.id) navigateRef.current(`/transaction/${txn.id}`);
          n.close();
        };
        return "shown";
      } catch (err) {
        // Chrome on Android only shows notifications from a service worker.
        console.error("Account watch: could not show a notification", err);
        return "failed";
      }
    },
    [address]
  );

  // While armed, check the indexer on each new round.
  useEffect(() => {
    if (status !== "armed") return;
    let active = true;
    let inFlight = false;
    let failures = 0;
    let lastTick = Date.now();
    // Aborts the check in flight when the watch stops.
    const stop = new AbortController();
    const client = new AccountClient(explorer.network);

    const check = async () => {
      const fetchPage: FetchPage<indexerModels.Transaction> = async (minRound, token) => {
        const t = timedSignal(stop.signal, PAGE_TIMEOUT_MS);
        try {
          return await client.getTransactionsSince(address, minRound, token, t.signal);
        } finally {
          t.done();
        }
      };
      const { match, state, error } = await scan(fetchPage, scanRef.current, address, directionRef.current, MAX_PAGES);
      if (!active) return;
      if (error) {
        // The pages read before the failed one still count: the next round resumes at it.
        scanRef.current = state;
        failures++;
        if (failures >= FAILURES_BEFORE_TROUBLE) setTrouble(true);
        console.error("Account watch: check failed", error);
        return;
      }
      failures = 0;
      setTrouble(false);
      if (!match) {
        scanRef.current = state;
        return;
      }
      active = false;
      const shown = notify(match.txn, match.side);
      if (shown !== "shown") {
        // Denied or unavailable: the button turns to its disabled state, which says why.
        if (shown === "failed") setUnavailable(true);
        else {
          const perm = Notification.permission;
          setPermission(perm);
          if (perm === "default") setNotice(PERMISSION_RESET);
        }
        setStatus("idle");
        return;
      }
      firedRoundRef.current = match.txn.confirmedRound;
      setFired({
        txid: match.txn.id ?? "",
        round: match.txn.confirmedRound,
        type: match.txn.txType,
        side: match.side,
        counterparty: counterparty(match.txn, match.side, address),
      });
      setStatus("fired");
      void queryClient.invalidateQueries({ queryKey: ["account", address] });
      void queryClient.invalidateQueries({ queryKey: ["account-transactions", address] });
    };

    const run = () => {
      if (!active || inFlight) return;
      inFlight = true;
      check()
        .catch((err) => {
          if (active) console.error("Account watch: check failed", err);
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const tick: TsTcWatcherSimpleCallback = (data) => {
      lastTick = Date.now();
      const round = data[data.length - 1]?.rnd;
      // On register the SDK calls back with the round already seen: nothing new yet.
      if (round === undefined || round < scanRef.current.minRound) return;
      run();
    };

    const register = () =>
      sdk.register(tick, { numBlocks: 1 }).catch((err) => {
        console.error("Account watch: could not follow the chain", err);
      });
    void register();

    const watchdog = setInterval(() => {
      if (Date.now() - lastTick < STALL_MS) return;
      lastTick = Date.now();
      sdk.unregister(tick);
      void register();
      run();
    }, WATCHDOG_MS);

    return () => {
      active = false;
      clearInterval(watchdog);
      stop.abort();
      sdk.unregister(tick);
    };
  }, [status, sdk, address, notify, queryClient]);

  /** Starts watching from the next round, for `dir`; asks for notification permission first if needed. */
  const arm = useCallback(
    async (dir: WatchDirection) => {
      // One at a time: a second pick while the permission prompt is open would race this one.
      if (!notificationsSupported || armingRef.current) return;
      armingRef.current = true;
      setArming(true);
      setNotice(undefined);
      try {
        let perm = Notification.permission;
        if (perm === "default") {
          // Older Safari takes a callback and returns nothing: the answer comes through either.
          perm = await new Promise<NotificationPermission>((resolve) => {
            try {
              const answer = Notification.requestPermission(resolve);
              if (answer) answer.then(resolve, () => resolve(Notification.permission));
            } catch {
              resolve(Notification.permission);
            }
          });
        }
        setPermission(perm);
        if (perm !== "granted") {
          if (perm === "default") setNotice("Notifications weren't allowed, so the account isn't being watched.");
          return;
        }

        // algod's tip, so a txn from just before the click isn't reported.
        let latest: bigint;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), STATUS_TIMEOUT_MS);
        try {
          latest = (await sdk.algorand.client.algod.status().do(undefined, { signal: ctrl.signal })).lastRound;
        } catch (err) {
          console.error("Account watch: could not read the latest round", err);
          setNotice("Couldn't reach the node to start watching. Try again.");
          return;
        } finally {
          clearTimeout(timer);
        }
        // Past the last notified txn too, so a re-arm can't report it again.
        const last = firedRoundRef.current;
        const from = last !== undefined && last > latest ? last : latest;
        scanRef.current = { minRound: from + 1n };
        setDirection(dir);
        setFired(undefined);
        setTrouble(false);
        setStatus("armed");
      } finally {
        armingRef.current = false;
        setArming(false);
      }
    },
    [sdk]
  );

  const disarm = useCallback(() => setStatus("idle"), []);

  // Permission taken back while armed (site settings): stop, rather than poll for a notification
  // that can't be shown.
  useEffect(() => {
    if (status !== "armed" || permission === "granted") return;
    setStatus("idle");
    if (permission === "default") setNotice(PERMISSION_RESET);
  }, [status, permission]);

  return {
    supported: notificationsSupported,
    unavailable,
    trouble,
    permission,
    status,
    direction,
    fired,
    arming,
    notice,
    arm,
    disarm,
  };
}
