import { TriangleAlert } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

// Prominent banner for records referencing something unusual but valid
// on-chain (e.g. a transfer of an asset id that was never created).
// Mirrors the <DeletedNotice /> panel style.
export default function WarningNotice({ children }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-2.5 p-5 rounded-[10px] mb-5 font-bold italic border-l-2 border-l-yellow-500 bg-yellow-500/10">
      <TriangleAlert className="h-5 w-5 text-yellow-500 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
