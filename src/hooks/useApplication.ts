import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { ApplicationClient } from "src/packages/core-sdk/clients/applicationClient";
import { BoxClient } from "src/packages/core-sdk/clients/boxClient";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import explorer from "src/utils/dappflow";
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

export function useApplication(id: number) {
  return useQuery({
    queryKey: ["application", id],
    queryFn: () => new ApplicationClient(explorer.network).get(id),
    enabled: !!id,
  });
}

export function useApplications() {
  return useInfiniteQuery({
    queryKey: ["applications"],
    queryFn: ({ pageParam }) =>
      new ApplicationClient(explorer.network).getApplications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
  });
}

export function useApplicationTransactions(id: number) {
  return useInfiniteQuery({
    queryKey: ["application-transactions", id],
    queryFn: ({ pageParam }) =>
      new ApplicationClient(explorer.network).getApplicationTransactions(
        id,
        pageParam,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage["next-token"] || undefined,
    enabled: !!id,
  });
}

export function useApplicationBoxNames(id: number) {
  return useInfiniteQuery({
    queryKey: ["application-box-names", id],
    queryFn: ({ pageParam }) =>
      new BoxClient(explorer.network).getBoxNamesPage(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextToken || undefined,
    enabled: !!id,
    retry: false,
  });
}

export function useApplicationHashes(appInfo: indexerModels.Application | undefined) {
  const app = appInfo ? new CoreApplication(appInfo) : null;
  const approvalProgram = app?.getApprovalProgram() ?? "";
  const clearProgram = app?.getClearProgram() ?? "";

  return useQuery({
    queryKey: ["application-hashes", approvalProgram, clearProgram],
    queryFn: () => getProgramHashes(approvalProgram, clearProgram),
    enabled: !!approvalProgram && !!clearProgram,
  });
}
