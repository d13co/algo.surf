import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import RecordPageHeader from "src/components/v2/RecordPageHeader";
import LoadingTile from "src/components/v2/LoadingTile";
import ListToolbar from "src/components/v2/ListToolbar";
import { DataTable } from "src/components/v2/DataTable";
import { surfIdxOffMessage, useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { LsigUse, USES_LIMIT, useLsigTemplate } from "src/hooks/useLsig";
import { usePersistenBooleanState } from "src/utils/usePersistenBooleanState";
import { useStableHeight } from "src/hooks/useStableHeight";
import ApplicationProgram from "../ApplicationProgram";
import CustomError from "../CustomError";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToLsigUse from "../Links/LinkToLsigUse";
import WarningNotice from "../WarningNotice";

const columns: ColumnDef<LsigUse, any>[] = [
  {
    id: "lsig",
    accessorFn: (u) => u.lsig,
    header: "Logic sig",
    cell: ({ row }) => <LinkToAccount copy="left" copySize="s" address={row.original.lsig} strip={20} />,
  },
  {
    id: "signer",
    accessorFn: (u) => u.signer ?? "",
    header: "Delegated by",
    cell: ({ row }) =>
      row.original.signer ? (
        <LinkToAccount copySize="s" address={row.original.signer} strip={20} subPage="delegations" />
      ) : (
        <span className="text-muted-foreground" title="An escrow: the logic sig authorized its own address's txns">
          Escrow
        </span>
      ),
  },
  {
    id: "sender",
    accessorFn: (u) => u.sender ?? "",
    header: "Rekeyed sender",
    cell: ({ row }) =>
      row.original.sender ? (
        <LinkToAccount copySize="s" address={row.original.sender} strip={20} />
      ) : (
        <span className="text-muted-foreground">&mdash;</span>
      ),
  },
  {
    id: "txns",
    accessorFn: (u) => u.txns,
    header: "Txns",
    cell: ({ row }) => <span>{row.original.txns.toLocaleString()}</span>,
  },
  {
    id: "first",
    accessorFn: (u) => u.firstRound,
    header: "First used",
    cell: ({ row }) => <LinkToLsigUse use={row.original} />,
  },
  {
    id: "last",
    accessorFn: (u) => u.lastRound,
    header: "Last used",
    cell: ({ row }) => <LinkToLsigUse use={row.original} last />,
  },
];

const columnLabels: Record<string, string> = {
  lsig: "Logic sig",
  signer: "Delegated by",
  sender: "Rekeyed sender",
  txns: "Txns",
  first: "First used",
  last: "Last used",
};

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-2.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** One logic sig template from surf idx: its first program and its most recent uses. */
function LsigTemplate(): JSX.Element {
  const { template: id } = useParams();
  useTitle(`Logic sig template ${id}`);
  const caps = useSurfIdxCaps();
  const { data, isLoading, isError, error } = useLsigTemplate(id);
  const [programExpanded, setProgramExpanded] = usePersistenBooleanState("lsig-template-program-expanded", false);
  // A stable array: a new one each render would reset the table's page, rendering again, forever.
  const uses = useMemo(() => data?.uses ?? [], [data]);

  const table = useReactTable({
    data: uses,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Click a header to sort by it; starts most recently used first, as the server lists them.
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => `${row.lsig}:${row.signer}:${row.sender}`,
    initialState: { pagination: { pageSize: 10 }, sorting: [{ id: "last", desc: true }] },
  });
  const { pageIndex, pageSize } = table.getState().pagination;
  const currentRowCount = table.getRowModel().rows.length;
  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  if (caps && !caps.lsigs) return <div className="mt-6 text-muted-foreground">{surfIdxOffMessage(caps)}</div>;
  if (!id || !/^[0-9a-f]{16}$/.test(id)) return <CustomError error="A template id is 16 lowercase hex digits" />;
  if (isError) return <CustomError error={(error as Error).message} />;
  if (data === null) return <CustomError error={`No logic sig of template ${id} was seen`} />;

  return (
    <div className="mt-5">
      <RecordPageHeader
        label="Logic sig template"
        id={data?.name || id}
        copyValue={id}
        truncate
        jsonViewer={{
          obj: () => data ?? {},
          dataKey: data,
          filename: `lsig-template-${id}.json`,
          title: `Logic sig template ${id}`,
        }}
      />

      {isLoading || !data ? (
        <LoadingTile />
      ) : (
        <div>
          <WarningNotice className="mt-4 mb-6">
            Anyone can fill a template with their own values: a logic sig of this template isn't necessarily genuine.
          </WarningNotice>

          <div className="rounded-lg p-5 pt-2.5 bg-background-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.name ? <Field label="Template id"><span className="font-mono">{id}</span></Field> : null}
              <Field label="Programs">{data.programs.toLocaleString()}</Field>
              <Field label="Uses shown">
                {data.uses.length.toLocaleString()}
                {data.uses.length >= USES_LIMIT ? " most recent" : ""}
              </Field>
            </div>
          </div>

          <div className="mt-6 rounded-lg bg-background-card overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between p-5 cursor-pointer text-left"
              onClick={() => setProgramExpanded(!programExpanded)}
            >
              <span className="font-medium">Logic Program</span>
              <ChevronDown size={20} className={`transition-transform ${programExpanded ? "rotate-180" : ""}`} />
            </button>
            {programExpanded ? (
              <div className="px-5 pb-5">
                <div className="text-sm text-muted-foreground mb-3">
                  The first program seen of this template. Others differ in their constants and branch targets.
                </div>
                {/* Not "Logic program": that name opens in TEAL, and this one opens in base64. */}
                <ApplicationProgram id={0} name="Template program" program={data.logic} />
              </div>
            ) : null}
          </div>

          <div className="mt-6">
            <ListToolbar
              pageIndex={pageIndex}
              pageCount={table.getPageCount()}
              canPreviousPage={table.getCanPreviousPage()}
              canNextPage={table.getCanNextPage()}
              onFirst={() => table.setPageIndex(0)}
              onPrev={() => table.previousPage()}
              onNext={() => table.nextPage()}
              onLast={() => table.setPageIndex(table.getPageCount() - 1)}
            />
            <DataTable
              table={table}
              columns={columns}
              columnLabels={columnLabels}
              emptyLabel="No uses"
              tableRef={tableRef}
              tableStyle={stableStyle}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default LsigTemplate;
