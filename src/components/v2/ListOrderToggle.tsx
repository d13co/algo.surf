import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { RotateCw } from "lucide-react";
import { cn } from "src/lib/utils";

export type ListOrder = "oldest" | "latest";

const labels: Record<ListOrder, string> = {
  oldest: "Oldest",
  latest: "Latest",
};

/** The order a created-things list is in, kept in `?order=latest`. */
export function useListOrder(): [ListOrder, (order: ListOrder) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const order: ListOrder =
    searchParams.get("order") === "latest" ? "latest" : "oldest";
  const setOrder = useCallback(
    (next: ListOrder) =>
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (next === "latest") params.set("order", "latest");
        else params.delete("order");
        return params;
      }),
    [setSearchParams],
  );
  return [order, setOrder];
}

/** Oldest first, or the latest created first. */
export default function ListOrderToggle({
  order,
  onChange,
  onReload,
  reloading,
}: {
  order: ListOrder;
  onChange: (order: ListOrder) => void;
  /** Shown in latest order: look again for what was created since */
  onReload?: () => void;
  reloading?: boolean;
}): JSX.Element {
  return (
    <div className="inline-flex items-center gap-1">
      <div
        role="radiogroup"
        aria-label="Order"
        className="inline-flex rounded-full border border-border p-0.5 text-sm"
      >
        {(Object.keys(labels) as ListOrder[]).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={order === value}
            onClick={() => onChange(value)}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              order === value
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[value]}
          </button>
        ))}
      </div>
      {order === "latest" && onReload ? (
        <button
          type="button"
          onClick={onReload}
          disabled={reloading}
          title="Reload"
          aria-label="Reload"
          className="rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          <RotateCw className={cn("h-4 w-4", reloading && "animate-spin")} />
        </button>
      ) : null}
    </div>
  );
}
