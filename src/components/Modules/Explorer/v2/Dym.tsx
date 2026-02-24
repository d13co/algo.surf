import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";

interface DymProps {
  text: string;
  link: string;
}

export default function Dym({ text, link }: DymProps): JSX.Element {
  const [_, setSearchParams] = useSearchParams();

  const dismiss = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

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
