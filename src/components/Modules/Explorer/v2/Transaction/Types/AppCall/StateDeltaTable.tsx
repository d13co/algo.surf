import MultiFormatViewer from "src/components/v2/MultiFormatViewer";
import NumberFormatCopy from "src/components/v2/NumberFormatCopy";

interface StateDeltaRow {
  key: string;
  operationLabel: string;
  isUint: boolean;
  uintValue?: number | string;
  bytesValue?: string;
}

interface StateDeltaTableProps {
  rows: StateDeltaRow[];
}

export function StateDeltaTable({ rows }: StateDeltaTableProps): JSX.Element {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <colgroup>
            <col style={{ width: 60 }} />
            <col style={{ width: "30%" }} />
            <col />
          </colgroup>
          <thead>
            <tr className="border-b border-primary">
              <th className="text-left py-2 px-1 text-muted-foreground font-medium">Operation</th>
              <th className="text-left py-2 px-1 text-muted-foreground font-medium">Key</th>
              <th className="text-left py-2 px-1 text-muted-foreground font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border">
                <td className="py-2 px-1 align-top">{row.operationLabel}</td>
                <td className="py-2 px-1 align-top">
                  <MultiFormatViewer view="auto" value={row.key} side="left" />
                </td>
                <td className="py-2 px-1 align-top">
                  {row.isUint ? (
                    <NumberFormatCopy
                      value={row.uintValue}
                      copyPosition="left"
                      displayType="text"
                      thousandSeparator
                    />
                  ) : (
                    <MultiFormatViewer
                      side="left"
                      view="auto"
                      includeNum="auto"
                      value={row.bytesValue}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-lg border border-muted p-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Operation</span>
              <span>{row.operationLabel}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Key</span>
              <span className="text-right min-w-0 overflow-hidden max-w-[80%]">
                <MultiFormatViewer view="auto" value={row.key} side="left" />
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Value</span>
              <span className="text-right min-w-0 overflow-hidden max-w-[80%]">
                {row.isUint ? (
                  <NumberFormatCopy
                    value={row.uintValue}
                    copyPosition="left"
                    displayType="text"
                    thousandSeparator
                  />
                ) : (
                  <MultiFormatViewer
                    side="left"
                    view="auto"
                    includeNum="auto"
                    value={row.bytesValue}
                  />
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
