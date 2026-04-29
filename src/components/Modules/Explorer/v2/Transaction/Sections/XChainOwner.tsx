import React from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import { AlgoXEvmSdk } from "algo-x-evm-sdk";
import LinkToBlockscan from "../../Links/LinkToBlockscan";
import { CircleHelp } from "lucide-react";

export function getXChainOwner(transaction: any): `0x${string}` | null {
  if (!transaction) return null;
  const txnInstance = new CoreTransaction(transaction);
  if (!txnInstance.isLogicSig()) return null;
  const logic = txnInstance.getSig()?.logicsig?.logic;
  if (!logic) return null;
  return AlgoXEvmSdk.getEvmAddressFromProgram(logic);
}

function XChainOwnerField({
  transaction,
  className = "col-span-12 md:col-span-6",
}: {
  transaction: any;
  className?: string;
}): JSX.Element | null {
  const owner = getXChainOwner(transaction);
  if (!owner) return null;

  return (
    <div className={className}>
      <div className="text-muted-foreground inline-flex items-center gap-1">
        xChain EVM Owner
        <a
          href="https://xchain.algorand.tech/docs/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center hover:text-foreground"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </a>
      </div>
      <div className="mt-2.5 text-[13px] break-words overflow-hidden">
        <LinkToBlockscan address={owner} />
      </div>
    </div>
  );
}

export default XChainOwnerField;
