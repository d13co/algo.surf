import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";

export default function Dym(): JSX.Element | null {
  const [searchParams, setSearchParams] = useSearchParams();

  const dym = searchParams.get("dym");

  const dismiss = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  if (!dym) return null;

  const blockNum = dym.split(":")[1];
  const text = `Block ${blockNum}`;
  const link = `/block/${blockNum}`;

  return (
    <div className="flex justify-between items-center p-5 rounded-[10px] mb-5 font-bold italic border-l-2 border-l-yellow-500 bg-yellow-500/10">
      <div>
        Did you mean{" "}
        <Link to={link} className="text-yellow-500 hover:underline">
          {text}?
        </Link>
      </div>
      <button type="button" onClick={dismiss} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
