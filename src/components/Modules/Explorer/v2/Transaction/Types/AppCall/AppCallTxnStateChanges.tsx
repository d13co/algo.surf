import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import explorer from "src/utils/dappflow";
import { useTimeTravelSupport } from "src/hooks/useTimeTravel";
import { withRound } from "src/hooks/useRound";
import { getTimeTravelNode, getVersionsPage, readAtRound, TTBoxChange, TTBoxesVersion } from "src/utils/timeTravel";
import { BaselineContext, ObjRef } from "src/utils/versionDelta";
import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import { Chip } from "src/components/v2/Chips";
import Link from "../../../Links/Link";
import LinkToAccount from "../../../Links/LinkToAccount";
import ObjectRoundDiff, { Pending } from "../../../Versions/ObjectRoundDiff";
import { BoxValueDiff, SizeNote } from "../../../Application/BoxValueDiff";
import { useBoxValueTypes } from "../../../Application/BoxValue";

const meta = { noPersist: true };
const APP_REF: ObjRef = { kind: "app" };

/** The boxes `appId` changed in `round`, with their new values (from its box versions). */
function useBoxChanges(appId: number, round: number, enabled: boolean) {
  return useQuery({
    queryKey: ["txn-box-changes", getTimeTravelNode()?.baseUrl, appId, round],
    queryFn: async (): Promise<TTBoxChange[]> => {
      const boxes: TTBoxChange[] = [];
      let next: string | undefined;
      do {
        const page = await getVersionsPage<TTBoxesVersion>((algod) => algod.getApplicationBoxesVersions(appId), {
          minRound: round,
          maxRound: round,
          values: true,
          next,
        });
        for (const v of page.versions) boxes.push(...v.boxes);
        next = page["next-token"] || undefined;
      } while (next);
      return boxes;
    },
    enabled,
    staleTime: Infinity,
    meta,
  });
}

/**
 * Whether this is the only transaction in `round` that called `appId` (inner
 * calls included); undefined until known, or while the indexer hasn't got
 * this transaction yet (it may lag behind the round).
 */
function useOnlyCallInRound(appId: number, round: number, txId: string, enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["txn-only-app-call", appId, round],
    queryFn: async () => {
      const res = await explorer.network.getIndexer().searchForTransactions().applicationID(appId).minRound(round).maxRound(round).limit(2).do();
      return res.transactions.map((t) => t.id ?? "");
    },
    enabled,
    // The indexer may lag behind the round: kept in memory only, and asked again later.
    staleTime: 5 * 60 * 1000,
    meta,
  });
  if (data === undefined) return undefined;
  if (data.length > 1) return false;
  return data[0] === txId ? true : undefined;
}

/** One account's local state in the app, before → after. */
function LocalStateChange({ appId, round, address }: { appId: number; round: number; address: string }) {
  const ctx = useMemo<BaselineContext>(() => ({ kind: "account", address, includeCreatedParams: false }), [address]);
  const objRef = useMemo<ObjRef>(() => ({ kind: "local", id: appId }), [appId]);
  return (
    <div className="border-b border-border py-2 text-sm">
      <div className="text-[13px] mb-1.5">
        <LinkToAccount address={address} strip={9} />
      </div>
      <ObjectRoundDiff ctx={ctx} objRef={objRef} round={round} />
    </div>
  );
}

/** One box: its value at the round before, read from the node, against its new value. */
function BoxChange({ appId, round, box, types }: { appId: number; round: number; box: TTBoxChange; types?: string[] }) {
  const req = useMemo(() => ({ read: "box" as const, appId, name: box.name, round: round - 1 }), [appId, box.name, round]);
  const { data, isLoading, error } = useQuery({
    // readAtRound's cache key, shared with the other at-round reads.
    queryKey: ["timetravel-at-round", getTimeTravelNode()?.baseUrl, req],
    queryFn: () => readAtRound<{ value: string }>(req),
    staleTime: Infinity,
    meta,
  });
  const before = data ? data.value : null;
  const after = box.deleted ? null : box.value ?? null;
  const status = isLoading || error ? undefined : before === null && after !== null ? "created" : after === null ? "deleted" : undefined;
  return (
    <div className="border-b border-border py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 max-w-full truncate">
          <MultiFormatViewer view="auto" value={box.name} side="left" />
        </span>
        {status ? (
          <Chip className={status === "created" ? "border-green-400 text-green-400" : "border-red-400 text-red-400"}>{status}</Chip>
        ) : null}
        {!isLoading && !error ? <SizeNote before={before} after={after} /> : null}
      </div>
      <div className="mt-1.5">
        {isLoading ? (
          <Pending className="h-5 w-48" />
        ) : error ? (
          <span className="text-red-400">{(error as Error).message}</span>
        ) : (
          <BoxValueDiff before={before} after={after} types={types} />
        )}
      </div>
    </div>
  );
}

/**
 * An app call's effect on its app, from the time-travel node: the app's
 * global state, the local states the call changed and its boxes, before the
 * round (R-1) and after it (R). That's the net change of the whole round
 * unless this is the round's only call to the app.
 */
export default function AppCallTxnStateChanges({
  appId,
  round,
  txId,
  localAddresses,
}: {
  appId: number;
  round: number;
  txId: string;
  /** The accounts whose local state the call changed or opened / closed. */
  localAddresses: string[];
}): JSX.Element | null {
  const supported = useTimeTravelSupport();
  const enabled = supported && appId > 0 && round > 0;
  const only = useOnlyCallInRound(appId, round, txId, enabled);
  const { data: boxes, isLoading: boxesLoading } = useBoxChanges(appId, round, enabled);
  const { types } = useBoxValueTypes(appId);
  const appCtx = useMemo<BaselineContext>(() => ({ kind: "app", appId, includeBoxes: false }), [appId]);

  if (!enabled) return null;

  return (
    <div className="mt-6 rounded-lg p-5 bg-background-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
        <span className="text-muted-foreground">State before → after</span>
        {only === false ? (
          <Chip title="Other transactions in this block also called this app: this is what the whole block did to it.">
            net change in block {round}
          </Chip>
        ) : null}
        <span className="ml-auto inline-flex items-center gap-3 text-sm">
          <History className="h-4 w-4 text-muted-foreground" />
          <Link href={withRound(`/application/${appId}`, round - 1)} keepRound={false}>
            View app at {round - 1}
          </Link>
          <Link href={withRound(`/application/${appId}`, round)} keepRound={false}>
            at {round}
          </Link>
        </span>
      </div>

      <div className="text-sm font-medium mb-1.5">Application</div>
      <div className="text-sm">
        <ObjectRoundDiff ctx={appCtx} objRef={APP_REF} round={round} />
      </div>

      {localAddresses.length ? (
        <>
          <div className="text-sm font-medium mt-5 mb-1.5">
            Local state <span className="font-normal text-muted-foreground">of the accounts this call changed</span>
          </div>
          {localAddresses.map((address) => (
            <LocalStateChange key={address} appId={appId} round={round} address={address} />
          ))}
        </>
      ) : null}

      {boxesLoading ? (
        <Pending className="mt-5 h-5 w-48" />
      ) : boxes?.length ? (
        <>
          <div className="text-sm font-medium mt-5 mb-1.5">Boxes ({boxes.length.toLocaleString()})</div>
          <div className="text-sm">
            {boxes.map((box) => (
              <BoxChange key={box.name} appId={appId} round={round} box={box} types={types} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
