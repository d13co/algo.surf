import React, { useMemo } from "react";
import { CoreTransaction } from "src/packages/core-sdk/classes/core/CoreTransaction";
import LinkToAccount from "../../Links/LinkToAccount";
import { Pencil, PencilOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/v2/ui/tooltip";

const signerTooltip = [
  "This account did not sign for this transaction",
  "This account signed for this transaction",
];

function SubSigner({
  signed,
  children,
}: {
  signed: boolean;
  children: React.ReactNode;
}) {
  const title = signerTooltip[signed ? 1 : 0];
  const icon = signed ? (
    <Pencil size={18} className="shrink-0 mr-1.5 cursor-help" />
  ) : (
    <PencilOff size={14} className="shrink-0 opacity-50 ml-0.5 mr-2 cursor-help" />
  );

  return (
    <div className="flex items-center my-3 text-sm min-w-0">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex">{icon}</span>
          </TooltipTrigger>
          <TooltipContent className="bg-black text-white border-border">
            <p>{title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {children}
    </div>
  );
}

function TransactionMultiSig({
  transaction,
}: {
  transaction: any;
}): JSX.Element | null {
  const txnInstance = new CoreTransaction(transaction);
  const sig = txnInstance.getSig();
  const subsigs = useMemo(
    () => txnInstance.isMultiSig() && txnInstance.getMultiSigSubSignatures(),
    [sig],
  );

  if (!txnInstance.isMultiSig()) return null;

  return (
    <div className="mt-7" id="multisig">
      <div className="text-xl font-bold mb-4">MultiSig</div>
      <div className="rounded-lg p-5 bg-background-card">
        <div className="flex items-center flex-row-reverse justify-around pt-2.5 mb-4 flex-wrap">
          <div className="flex items-center flex-wrap">
            <span>Version</span>
            <span className="text-primary text-[110%] mx-2.5">{sig.multisig.version}</span>
          </div>
          <div className="flex items-center flex-wrap">
            <span>Threshold</span>
            <span className="text-primary text-[110%] mx-2.5">{sig.multisig.threshold}</span>
            <span>of</span>
            <span className="text-primary text-[110%] mx-2.5">{subsigs.length}</span>
          </div>
        </div>

        <div className="mt-2.5">
          <div className="text-[110%]">Subsignatures</div>
          <div className="flex flex-col mt-2.5">
            {subsigs.map(([addr, signed]: [string, boolean]) => (
              <SubSigner signed={signed} key={addr}>
                <LinkToAccount copySize="m" address={addr} />
              </SubSigner>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransactionMultiSig;
