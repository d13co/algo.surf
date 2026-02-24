import { TableRow, TableCell } from "./table";

export function SkeletonRows({
  rows,
  columns,
  animate = true,
}: {
  rows: number;
  columns: number;
  animate?: boolean;
}) {
  if (rows <= 0) return null;
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow key={`skeleton-${i}`} className="border-muted">
          {Array.from({ length: columns }, (_, j) => (
            <TableCell key={j} className="max-w-0">
              {animate ? (
                <div className="h-5 w-2/3 rounded bg-muted animate-pulse" />
              ) : (
                <div className="h-5" />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function SkeletonCards({
  rows,
  fields,
  animate = true,
}: {
  rows: number;
  fields: number;
  animate?: boolean;
}) {
  if (rows <= 0) return null;
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={`skeleton-card-${i}`}
          className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm"
        >
          {Array.from({ length: fields }, (_, j) => (
            <div key={j} className="flex justify-between gap-2">
              {animate ? (
                <>
                  <div className="h-5 w-1/4 rounded bg-muted animate-pulse" />
                  <div className="h-5 w-1/3 rounded bg-muted animate-pulse" />
                </>
              ) : (
                <div className="h-5" />
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
