import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import LinkToAccount from "./Links/LinkToAccount";

interface DymProps {
  nfd: string;
  accounts: string[];
}

export default function DymNFD({ nfd, accounts }: DymProps): JSX.Element {
  const [_, setSearchParams] = useSearchParams();

  const dismiss = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  return (
    <div className="flex justify-between items-center p-5 rounded-[10px] mb-5 font-bold border-l-2 border-l-nfd bg-yellow-500/10">
      <div className="flex flex-col min-w-0">
        <div className="mb-4 text-nfd">{nfd} has multiple verified addresses.</div>
        <div className="mb-1 text-muted-foreground">You may be looking for:</div>
        {accounts.map((account, i) => (
          <div className="truncate py-0.5" key={`acc${i}`}>
            <LinkToAccount noNFD address={account} />
          </div>
        ))}
      </div>
      <button type="button" onClick={dismiss} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
