import { useMemo } from "react";
import { indexerModels } from "algosdk";
import { useApplication } from "src/hooks/useApplication";
import { useBlock } from "src/hooks/useBlock";

// AlgoKit's deployer stamps the app creation transaction with a JSON note.
// Everything in that note is typed by whoever deployed the app — the chain
// neither validates nor enforces it, so these are claims by the creator, not
// facts about the application.
const ALGOKIT_DEPLOYER_NOTE_PREFIX = "ALGOKIT_DEPLOYER:j";

export interface CreatorSuppliedAppInfo {
  name?: string;
  version?: string;
}

function findTxnByAppId(
  block: indexerModels.Block,
  appId: number,
): indexerModels.Transaction | undefined {
  const target = BigInt(appId);

  function matches(txn: indexerModels.Transaction): boolean {
    return (
      txn.applicationTransaction?.applicationId === target ||
      txn.createdApplicationIndex === target
    );
  }

  function search(txns: indexerModels.Transaction[] | undefined): indexerModels.Transaction | undefined {
    if (!txns) return undefined;
    for (const txn of txns) {
      if (matches(txn)) return txn;
      const inner = search(txn.innerTxns);
      if (inner) return inner;
    }
    return undefined;
  }

  return search(block.transactions);
}

export function parseCreatorSuppliedAppInfo(
  note: Uint8Array | undefined,
): CreatorSuppliedAppInfo | null {
  if (!note) return null;
  const noteStr = new TextDecoder().decode(note);
  if (!noteStr.startsWith(ALGOKIT_DEPLOYER_NOTE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(noteStr.slice(ALGOKIT_DEPLOYER_NOTE_PREFIX.length));
    const name = typeof parsed?.name === "string" ? parsed.name : undefined;
    const version =
      typeof parsed?.version === "string" || typeof parsed?.version === "number"
        ? String(parsed.version)
        : undefined;
    if (!name && !version) return null;
    return { name, version };
  } catch {
    return null;
  }
}

export function readCreatorSuppliedAppInfo(
  block: indexerModels.Block,
  appId: number,
): CreatorSuppliedAppInfo | null {
  const creationTxn = findTxnByAppId(block, appId);
  if (!creationTxn) return null;
  return parseCreatorSuppliedAppInfo(creationTxn.note);
}

/**
 * Name and version the creator claimed for an app in its AlgoKit deployer
 * note. Unverified — never treat it as an identity.
 */
export function useCreatorSuppliedAppInfo(appId: number): CreatorSuppliedAppInfo | null {
  const { data: appInfo } = useApplication(appId);
  const createdAtRound = appInfo?.createdAtRound != null ? Number(appInfo.createdAtRound) : undefined;
  const { data: blockInfo } = useBlock(createdAtRound ?? 0);

  return useMemo(() => {
    if (!appInfo || !blockInfo) return null;
    return readCreatorSuppliedAppInfo(blockInfo, appId);
  }, [appId, appInfo, blockInfo]);
}
