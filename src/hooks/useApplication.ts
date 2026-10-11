import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ApplicationClient, APPLICATIONS_PAGE_SIZE } from "src/packages/core-sdk/clients/applicationClient";
import { BoxClient } from "src/packages/core-sdk/clients/boxClient";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import explorer from "src/utils/dappflow";
import { getApplicationAt, TimeTravelBoxClient, TimeTravelError } from "src/utils/timeTravel";
import { isEmptyTxnRound } from "src/hooks/useTxnRound";
import { indexerModels } from "algosdk";
import sha512 from "js-sha512";
import chunk from "lodash/chunk.js";

function arrayBufferToHex(ab: ArrayBuffer): string {
  return Buffer.from(ab).toString("hex");
}

async function getProgramHashes(approvalB64: string, clearB64: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API unavailable (requires HTTPS or localhost)");
  }

  const approvalProgram = Buffer.from(approvalB64, "base64");
  const approvalProgramPages = chunk(Array.from(approvalProgram), 4096);
  const clearProgram = Buffer.from(clearB64, "base64");

  const approvalPagesSha256 = await Promise.all(
    approvalProgramPages.map((page) =>
      subtle.digest("SHA-256", new Uint8Array(page)),
    ),
  );

  const sha256 = {
    approval: arrayBufferToHex(
      await subtle.digest("SHA-256", new Uint8Array(approvalProgram)),
    ),
    approvalPages: approvalPagesSha256.map((page) => arrayBufferToHex(page)),
    clear: arrayBufferToHex(
      await subtle.digest("SHA-256", new Uint8Array(clearProgram)),
    ),
  };

  const sha512_256 = {
    approval: sha512.sha512_256(new Uint8Array(approvalProgram)),
    approvalPages: approvalProgramPages.map((page) =>
      sha512.sha512_256(new Uint8Array(page)),
    ),
    clear: sha512.sha512_256(new Uint8Array(clearProgram)),
  };

  return { sha256, sha512_256 };
}

/**
 * Options for a query of state at `round` (from the time-travel node) rather
 * than the latest: a key of its own, kept in memory only, and no retries -
 * a round the node cannot serve fails the same way every time.
 */
function atRound(key: unknown[], round: number | undefined) {
  return round === undefined
    ? { queryKey: key }
    : { queryKey: [...key, { round }], meta: { noPersist: true }, retry: false };
}

/**
 * The app at `round`, deleted by then: as the indexer has it now, deleted, as
 * on the latest page. Where it was not yet created, the time-travel error.
 */
async function getApplicationOrDeletedAt(id: number, round: number): Promise<indexerModels.Application> {
  try {
    return await getApplicationAt(id, round);
  } catch (e) {
    if (e instanceof TimeTravelError && e.status === 404) {
      const app = await new ApplicationClient(explorer.network).get(id).catch(() => undefined);
      if (app?.deleted && app.deletedAtRound !== undefined && app.deletedAtRound <= BigInt(round)) return app;
    }
    throw e;
  }
}

/** The app at `round` when given (see useRound), else as it is now. */
export function useApplication(id: number, round?: number) {
  return useQuery({
    ...atRound(["application", id], round),
    queryFn: () =>
      round === undefined
        ? new ApplicationClient(explorer.network).get(id)
        : getApplicationOrDeletedAt(id, round),
    enabled: !!id,
  });
}

/** Box reads at `round` from the time-travel node, else the usual clients. */
export function boxClientFor(round: number | undefined): Pick<BoxClient, "getBoxNamesPage" | "getBox"> {
  return round === undefined ? new BoxClient(explorer.network) : new TimeTravelBoxClient(round);
}

export function useApplications() {
  return useInfiniteQuery({
    queryKey: ["applications"],
    queryFn: ({ pageParam }) =>
      new ApplicationClient(explorer.network).getApplications(pageParam),
    initialPageParam: undefined as string | undefined,
    // The indexer can return a next-token even on the final (short) page, so
    // only treat it as a real next page when the page came back full.
    getNextPageParam: (lastPage) =>
      lastPage.applications.length >= APPLICATIONS_PAGE_SIZE
        ? lastPage["next-token"] || undefined
        : undefined,
  });
}

/** With `round`, only the transactions up to it; with `txnRound`, only those in it (see useTxnRound). */
export function useApplicationTransactions(id: number, round?: number, txnRound?: number) {
  return useInfiniteQuery({
    ...atRound(["application-transactions", id, ...(txnRound === undefined ? [] : [{ txnRound }])], round),
    queryFn: ({ pageParam }) =>
      new ApplicationClient(explorer.network).getApplicationTransactions(
        id,
        pageParam,
        round,
        txnRound,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!id && !isEmptyTxnRound(txnRound, round),
  });
}

export function useApplicationBoxNames(id: number, round?: number) {
  return useInfiniteQuery({
    ...atRound(["application-box-names", id], round),
    queryFn: ({ pageParam }) => boxClientFor(round).getBoxNamesPage(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextToken || undefined,
    enabled: !!id,
    retry: false,
  });
}

export function useApplicationBox(id: number, name: string | undefined, round?: number) {
  return useQuery({
    ...atRound(["application-box", id, name], round),
    queryFn: () => boxClientFor(round).getBox(id, name!),
    enabled: !!id && !!name,
  });
}

export function useApplicationHashes(appInfo: indexerModels.Application | undefined, round?: number) {
  const app = appInfo ? new CoreApplication(appInfo) : null;
  const approvalProgram = app?.getApprovalProgram() ?? "";
  const clearProgram = app?.getClearProgram() ?? "";

  return useQuery({
    // Keyed by id rather than program bytes (which would persist the programs
    // twice, in the key and the queryHash). Local and cheap, so it is
    // recomputed on mount instead of persisted; an updated app never shows
    // stale hashes - nor one viewed at a past round.
    queryKey: ["application-hashes", Number(appInfo?.id ?? 0), round],
    queryFn: () => getProgramHashes(approvalProgram, clearProgram),
    enabled: !!approvalProgram && !!clearProgram,
    meta: { noPersist: true },
  });
}
