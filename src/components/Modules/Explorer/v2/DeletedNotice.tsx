import { Trash2 } from "lucide-react";

type Props = {
  children?: React.ReactNode;
};

// Prominent banner shown at the top of a record page when the underlying
// on-chain entity has been deleted. Mirrors the <Dym /> panel style.
export default function DeletedNotice({ children }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-2.5 p-5 rounded-[10px] mb-5 font-bold italic border-l-2 border-l-red-500 bg-red-500/10">
      <Trash2 className="h-5 w-5 text-red-500 shrink-0" />
      <div>{children ?? "Deleted"}</div>
    </div>
  );
}
