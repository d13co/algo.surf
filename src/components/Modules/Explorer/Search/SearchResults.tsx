import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, SearchX } from "lucide-react";
import NumberFormat from "react-number-format";
import explorer from "src/utils/dappflow";
import { microalgosToAlgos } from "src/utils/common";
import { addressBefore } from "src/utils/completeAddress";
import {
  getLocalNodeAccess,
  networkToDomainMap,
  shouldProbeLocalNodes,
} from "src/utils/nodeConfig";
import {
  byNetworkOrder,
  findOnNetworks,
  getSearchableNetworks,
} from "src/utils/otherNetworks";
import { network, Networks } from "src/packages/core-sdk/constants";
import { AccountClient } from "src/packages/core-sdk/clients/accountClient";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { useAbelAssetsContext } from "src/components/Common/AbelAssetsProvider";
import Link from "../v2/Links/Link";
import LinkToAccount from "../v2/Links/LinkToAccount";
import AlgoIcon from "../AlgoIcon/AlgoIcon";
import {
  addressPrefix,
  idHitsQuery,
  IdHits,
  idUnknowns,
  normalizeTarget,
  searchableId,
  searchId,
  searchVerifiedAssets,
} from "./CoreSearch";

/** How many accounts the prefix section shows before "Show all". */
const PREFIX_ACCOUNTS = 25;

type Status = "idle" | "loading" | "done";

function Section({
  title,
  loading,
  error,
  footer,
  children,
}: {
  title: React.ReactNode;
  loading?: boolean;
  error?: unknown;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <section className="mt-6">
      <h5 className="text-lg font-bold text-foreground flex items-center gap-2">
        {title}
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </h5>
      {error ? (
        <div className="mt-2 text-sm text-red-400">{(error as Error).message}</div>
      ) : null}
      {children ? (
        <ul className="mt-3 rounded-lg bg-background-card divide-y divide-border">{children}</ul>
      ) : null}
      {footer ? <div className="mt-3 text-sm">{footer}</div> : null}
    </section>
  );
}

function Row({ kind, children }: { kind: string; children: React.ReactNode }): JSX.Element {
  return (
    <li className="flex items-center gap-4 px-4 py-3 min-w-0">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{kind}</span>
      <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-1">{children}</span>
    </li>
  );
}

function AssetName({ name, unit }: { name?: string; unit?: string }): JSX.Element | null {
  if (!name && !unit) return null;
  return (
    <span className="text-muted-foreground truncate">
      {name}
      {unit ? ` (${unit})` : ""}
    </span>
  );
}

/** What an id is on another network. */
type ElsewhereHit = {
  network: Networks;
  kind: "asset" | "application" | "block";
  name?: string;
  unit?: string;
};

/** The path an id has on any network, by what it is there. */
function idPath(kind: ElsewhereHit["kind"], id: number): string {
  return kind === "asset" ? `/asset/${id}/transactions` : `/${kind}/${id}`;
}

/**
 * What `id` is on the other networks: an asset or app wherever it is one, and
 * a block only where `blockHere` is false, since every network has the low
 * rounds. Public networks are asked right away; the user's localnet only if
 * the browser already lets the page reach it, so this never prompts.
 * `failed` are the networks where a lookup that mattered failed: it may be
 * there.
 */
function useElsewhere(
  id: number | undefined,
  blockHere: boolean,
): { hits: ElsewhereHit[]; failed: Networks[]; status: Status } {
  const [hits, setHits] = useState<ElsewhereHit[]>([]);
  const [failed, setFailed] = useState<Networks[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    setHits([]);
    setFailed([]);
    if (id === undefined) {
      setStatus("idle");
      return;
    }
    // Leaving the page, or another search, stops the lookups still going
    const abort = new AbortController();
    const { signal } = abort;
    setStatus("loading");

    const onFound = (net: Networks, hits: IdHits) => {
      if (signal.aborted) return;
      const { asset, app, block } = hits;
      const unknown = idUnknowns(hits);
      if (unknown.assetOrApp || (!blockHere && unknown.block)) {
        setFailed((current) => [...current, net].sort(byNetworkOrder));
      }
      let hit: ElsewhereHit | undefined;
      if (asset) hit = { network: net, kind: "asset", name: asset.params.name, unit: asset.params["unit-name"] };
      else if (app) hit = { network: net, kind: "application" };
      else if (block && !blockHere) hit = { network: net, kind: "block" };
      if (hit) {
        const found = hit;
        setHits((current) => [...current, found].sort((a, b) => byNetworkOrder(a.network, b.network)));
      }
    };
    const probe = (net: Parameters<typeof searchId>[0]) => searchId(net, id, signal);
    const { local, remote } = getSearchableNetworks();

    const searchLocal = async () => {
      if (!local.length || !shouldProbeLocalNodes()) return;
      if ((await getLocalNodeAccess()) !== "granted") return;
      await findOnNetworks(local, probe, onFound);
    };

    Promise.all([findOnNetworks(remote, probe, onFound), searchLocal()])
      .catch(() => {
        // the localnet permission check failed: as good as not granted
      })
      .finally(() => {
        if (!signal.aborted) setStatus("done");
      });
    return () => abort.abort();
  }, [id, blockHere]);

  return { hits, failed, status };
}

export default function SearchResults(): JSX.Element {
  const [params] = useSearchParams();
  const q = normalizeTarget(params.get("q") ?? "");
  useTitle(q ? `Search: ${q}` : "Search");
  if (!q) {
    return (
      <Empty>Type an address, transaction, asset, application or block in the search bar.</Empty>
    );
  }
  // Another search starts afresh: nothing of the last one shows meanwhile
  return <Results key={q} q={q} />;
}

function Results({ q }: { q: string }): JSX.Element {
  const { loadedPromise } = useAbelAssetsContext();
  const id = searchableId(q);
  const prefix = addressPrefix(q);

  const here = useQuery({ ...idHitsQuery(id ?? 0), enabled: id !== undefined });

  const assets = useQuery({
    queryKey: ["search", "verified-assets", q.toLowerCase()],
    enabled: id === undefined,
    queryFn: async () => {
      // The verified asset list may still be loading on a fresh visit
      await loadedPromise;
      return searchVerifiedAssets(q);
    },
  });

  const accounts = useQuery({
    queryKey: ["search", "account-prefix", prefix],
    enabled: !!prefix,
    queryFn: async ({ signal }) => {
      // Accounts come sorted by address: start at the first address with
      // this prefix and keep those that still have it.
      const page = await new AccountClient(explorer.network).getAccounts(
        addressBefore(prefix!),
        PREFIX_ACCOUNTS,
        signal,
      );
      return page.accounts.filter(({ address }) => address.startsWith(prefix!));
    },
  });

  // A lookup here that failed: whether that is here is unknown
  const unknown = here.data ? idUnknowns(here.data) : {};
  // Not an asset or app here, known for sure: look on the other networks.
  // Their blocks only if this network has no such block, known for sure too.
  const nothingHere = !!here.data && !here.data.asset && !here.data.app && !unknown.assetOrApp;
  const blockMaybeHere = !!here.data?.block || !!unknown.block;
  const elsewhere = useElsewhere(nothingHere ? id : undefined, blockMaybeHere);
  // Elsewhere starts in the render after `here` comes back empty: idle till then
  const elsewhereLoading = nothingHere && elsewhere.status !== "done";
  const elsewhereError = elsewhere.failed.length
    ? new Error(`Could not check ${elsewhere.failed.join(", ")}: it may be there`)
    : undefined;

  const hereHits = here.data ? [here.data.asset, here.data.app, here.data.block].filter(Boolean) : [];
  const hereError = here.error ?? unknown.assetOrApp ?? unknown.block;

  const loading =
    (id !== undefined && here.isPending) || assets.isFetching || accounts.isFetching || elsewhereLoading;
  const failed = !!(hereError || elsewhereError || assets.error || accounts.error);
  const found =
    hereHits.length + (assets.data?.length ?? 0) + (accounts.data?.length ?? 0) + elsewhere.hits.length;

  return (
    <div className="mt-6 mb-12">
      <h4 className="text-2xl font-bold text-foreground break-all">
        Search results for <span className="text-primary">{q}</span>
      </h4>

      {id !== undefined && (here.isPending || hereError || hereHits.length) ? (
        <Section title={`On ${network}`} loading={here.isPending} error={hereError}>
          {hereHits.length ? (
            <>
              {here.data?.asset ? (
                <Row kind="Asset">
                  <Link href={idPath("asset", id)}>{id}</Link>
                  <AssetName name={here.data.asset.params.name} unit={here.data.asset.params["unit-name"]} />
                </Row>
              ) : null}
              {here.data?.app ? (
                <Row kind="Application">
                  <Link href={idPath("application", id)}>{id}</Link>
                </Row>
              ) : null}
              {here.data?.block ? (
                <Row kind="Block">
                  <Link href={idPath("block", id)}>{id}</Link>
                  <span className="text-muted-foreground">
                    {new Date(here.data.block.timestamp * 1000).toLocaleString()}
                  </span>
                </Row>
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {id !== undefined && (elsewhereLoading || elsewhereError || elsewhere.hits.length) ? (
        <Section
          title={blockMaybeHere ? "Assets and applications on other networks" : "On other networks"}
          loading={elsewhereLoading}
          error={elsewhereError}
        >
          {elsewhere.hits.length
            ? elsewhere.hits.map((hit) => (
                <Row key={`${hit.network}-${hit.kind}`} kind={hit.network}>
                  {/* Another network's ids: no ?round= */}
                  <a className="text-primary hover:underline" href={`${networkToDomainMap[hit.network]}${idPath(hit.kind, id)}`}>
                    {hit.kind === "application" ? "Application" : hit.kind === "asset" ? "Asset" : "Block"} {id}
                  </a>
                  <AssetName name={hit.name} unit={hit.unit} />
                </Row>
              ))
            : null}
        </Section>
      ) : null}

      {assets.isFetching || assets.error || assets.data?.length ? (
        <Section title="Verified assets" loading={assets.isFetching} error={assets.error}>
          {assets.data?.length
            ? assets.data.map((asset) => (
                <Row key={asset.index} kind="Asset">
                  <Link href={idPath("asset", asset.index)}>{asset.index}</Link>
                  <AssetName name={asset.params.name} unit={asset.params["unit-name"]} />
                </Row>
              ))
            : null}
        </Section>
      ) : null}

      {prefix && (accounts.isFetching || accounts.error || accounts.data?.length) ? (
        <Section
          title={
            <>
              Accounts starting with <span className="font-mono">{prefix}</span>
            </>
          }
          loading={accounts.isFetching}
          error={accounts.error}
          footer={
            // The accounts list filters on at most 52 characters
            accounts.data?.length === PREFIX_ACCOUNTS && prefix.length <= 52 ? (
              <Link href={`/accounts?s=${prefix}`}>Show all accounts starting with {prefix}</Link>
            ) : null
          }
        >
          {accounts.data?.length
            ? accounts.data.map((account) => (
                <Row key={account.address} kind="Account">
                  <LinkToAccount copy="left" copySize="s" address={account.address} strip={30} />
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <AlgoIcon />
                    <NumberFormat value={microalgosToAlgos(account.amount)} displayType="text" thousandSeparator />
                  </span>
                </Row>
              ))
            : null}
        </Section>
      ) : null}

      {/* Only once every lookup answered: a failed one may have found it */}
      {!loading && !failed && !found ? (
        <Empty>
          Nothing found for <span className="break-all">{q}</span>
          {id !== undefined ? " on any network" : ""}
        </Empty>
      ) : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
      <SearchX size={160} color="#12afac" style={{ opacity: 0.35 }} />
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}
