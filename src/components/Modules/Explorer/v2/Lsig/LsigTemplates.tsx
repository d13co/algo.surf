import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { surfIdxOffMessage, useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { LsigTemplateSummary, templateLabel, useLsigTemplates } from "src/hooks/useLsig";
import { useStableHeight } from "src/hooks/useStableHeight";
import ListToolbar from "src/components/v2/ListToolbar";
import FilterInput from "src/components/v2/FilterInput";
import { DataTable } from "src/components/v2/DataTable";
import LinkToTemplateUse from "../Links/LinkToTemplateUse";
import LinkToLsigTemplate from "../Links/LinkToLsigTemplate";

const columns: ColumnDef<LsigTemplateSummary, any>[] = [
  {
    id: "template",
    accessorFn: templateLabel,
    header: "Template",
    cell: ({ row }) => <LinkToLsigTemplate template={row.original.template} name={row.original.name} />,
  },
  {
    id: "programs",
    accessorFn: (t) => t.programs,
    header: "Programs",
    cell: ({ row }) => <span>{row.original.programs.toLocaleString()}</span>,
  },
  {
    id: "delegators",
    accessorFn: (t) => t.delegators,
    header: "Delegators",
    cell: ({ row }) => <span>{row.original.delegators.toLocaleString()}</span>,
  },
  {
    id: "txns",
    accessorFn: (t) => t.txns,
    header: "Txns",
    cell: ({ row }) => <span>{row.original.txns.toLocaleString()}</span>,
  },
  {
    id: "first",
    accessorFn: (t) => t.firstRound,
    header: "First used",
    cell: ({ row }) => <LinkToTemplateUse round={row.original.firstRound} template={row.original.template} />,
  },
  {
    id: "last",
    accessorFn: (t) => t.lastRound,
    header: "Last used",
    cell: ({ row }) => <LinkToTemplateUse round={row.original.lastRound} template={row.original.template} last />,
  },
];

const columnLabels: Record<string, string> = {
  template: "Template",
  programs: "Programs",
  delegators: "Delegators",
  txns: "Txns",
  first: "First used",
  last: "Last used",
};

/** Logic sig templates from surf idx: programs that differ only in their constants. */
function LsigTemplates(): JSX.Element {
  useTitle("Logic sigs");
  const caps = useSurfIdxCaps();
  const { data, isError, error } = useLsigTemplates();
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!data || !f) return data ?? [];
    return data.filter((t) => t.template.startsWith(f) || t.name?.toLowerCase().includes(f));
  }, [data, filter]);

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Click a header to sort by it; numbers sort largest first, as the server lists them.
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.template,
    initialState: { pagination: { pageSize: 25 }, sorting: [{ id: "programs", desc: true }] },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const currentRowCount = table.getRowModel().rows.length;
  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  if (caps && !caps.lsigs) return <div className="mt-6 text-muted-foreground">{surfIdxOffMessage(caps)}</div>;

  return (
    <div>
      <p className="mt-2 text-sm text-muted-foreground">
        Logic sigs that are one program filled in with different values, such as per-user or per-pool escrows, share a
        template. Listed are templates with 2 or more programs, or delegated by 2 or more accounts. Anyone can fill a
        template with their own values, so a shared template doesn't make a logic sig genuine.
      </p>
      <ListToolbar
        className="mt-3"
        pageIndex={pageIndex}
        pageCount={table.getPageCount()}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => table.setPageIndex(0)}
        onPrev={() => table.previousPage()}
        onNext={() => table.nextPage()}
        onLast={() => table.setPageIndex(table.getPageCount() - 1)}
      >
        <FilterInput
          value={filter}
          onChange={(v) => {
            setFilter(v);
            table.setPageIndex(0);
          }}
          onClear={() => setFilter("")}
          placeholder="Filter by name or id"
          inputClassName="pl-9 pr-16 rounded-full"
        />
      </ListToolbar>
      {isError ? (
        <div className="py-16 text-center text-muted-foreground">{(error as Error).message}</div>
      ) : !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading templates...</span>
        </div>
      ) : (
        <DataTable
          table={table}
          columns={columns}
          columnLabels={columnLabels}
          emptyLabel="No templates"
          tableRef={tableRef}
          tableStyle={stableStyle}
        />
      )}
    </div>
  );
}

export default LsigTemplates;
