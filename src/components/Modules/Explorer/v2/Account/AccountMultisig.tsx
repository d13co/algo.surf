import { useParams } from "react-router-dom";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { Loader2, Pencil, PencilOff } from "lucide-react";
import { MSIG_LIMIT, MsigMember, useMsigSubsigners, useMsigsOf } from "src/hooks/useMsig";
import { surfIdxOffMessage, useSurfIdxCaps } from "src/hooks/useSurfIdxCaps";
import { useStableHeight } from "src/hooks/useStableHeight";
import ListToolbar from "src/components/v2/ListToolbar";
import { DataTable } from "src/components/v2/DataTable";
import LinkToAccount from "../Links/LinkToAccount";
import LinkToBlockTxn from "../Links/LinkToBlockTxn";

/** "subsigners": the keys of the multisig at this address. "multisigs": the multisigs this key is in. */
export type MsigView = "subsigners" | "multisigs";

function columnsFor(view: MsigView): ColumnDef<MsigMember, any>[] {
  const other = view === "subsigners" ? "signer" : "msig";
  return [
    {
      id: "account",
      accessorFn: (r) => r[other],
      header: view === "subsigners" ? "Subsigner" : "Multisig",
      // Each links to its own side's tab: a key's other multisigs, or a multisig's other keys.
      cell: ({ row }) => (
        <LinkToAccount
          copy="left"
          copySize="s"
          address={row.original[other]}
          strip={20}
          subPage={view === "subsigners" ? "multisigs" : "subsigners"}
        />
      ),
    },
    {
      id: "signed",
      accessorFn: (r) => (r.signed ? 1 : 0),
      header: "Signed",
      cell: ({ row }) =>
        row.original.signed ? (
          <span
            className="inline-flex items-center gap-1.5"
            title="The key signed for this multisig. For an old-style delegated logic sig (until consensus v41), it signed the program."
          >
            <Pencil size={16} className="shrink-0" /> Signed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground" title="The key never signed for this multisig">
            <PencilOff size={14} className="shrink-0 opacity-50" /> Never
          </span>
        ),
    },
    {
      id: "txn",
      accessorFn: (r) => r.round * 1e5 + r.index,
      header: "First txn",
      cell: ({ row }) => {
        const { round, index, signed } = row.original;
        return (
          <LinkToBlockTxn
            round={round}
            pick={(txns) => txns[index]}
            title={
              signed
                ? `The first txn the key signed for this multisig, in block ${round}`
                : `The first txn of this multisig, in block ${round}: the key never signed one`
            }
          />
        );
      },
    },
  ];
}

const COLUMNS: Record<MsigView, ColumnDef<MsigMember, any>[]> = {
  subsigners: columnsFor("subsigners"),
  multisigs: columnsFor("multisigs"),
};

const columnLabels = (view: MsigView): Record<string, string> => ({
  account: view === "subsigners" ? "Subsigner" : "Multisig",
  signed: "Signed",
  txn: "First txn",
});

const EMPTY: MsigMember[] = [];

/** A multisig's subsigner keys, or the multisigs a key is in, from surf idx. */
function MsigTable({ view, address }: { view: MsigView; address: string | undefined }): JSX.Element {
  const caps = useSurfIdxCaps();
  const subsigners = useMsigSubsigners(address, view === "subsigners");
  const msigsOf = useMsigsOf(address, view === "multisigs");
  const { data: rows, isError, error } = view === "subsigners" ? subsigners : msigsOf;
  const columns = COLUMNS[view];

  const table = useReactTable({
    // The query's own array: stable across renders, so the table keeps its page.
    data: rows ?? EMPTY,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => `${row.signer}:${row.msig}`,
    initialState: { pagination: { pageSize: 10 }, sorting: [{ id: "txn", desc: true }] },
  });

  const { pageIndex, pageSize } = table.getState().pagination;
  const currentRowCount = table.getRowModel().rows.length;
  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  if (caps && !caps.msigs) return <div className="mt-6 text-muted-foreground">{surfIdxOffMessage(caps)}</div>;
  if (isError) return <div className="mt-6 text-muted-foreground">{(error as Error).message}</div>;
  if (!rows) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {rows.length >= MSIG_LIMIT ? (
        <div className="mt-3 text-sm text-muted-foreground">The {MSIG_LIMIT.toLocaleString()} most recent.</div>
      ) : null}
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
      />
      <DataTable
        table={table}
        columns={columns}
        columnLabels={columnLabels(view)}
        emptyLabel={view === "subsigners" ? "Not a multisig, or never used" : "Not in any multisig"}
        tableRef={tableRef}
        tableStyle={stableStyle}
      />
    </div>
  );
}

/** Keyed: a row's link opens the other side's tab on this same route, which starts a fresh table. */
function AccountMultisig({ view }: { view: MsigView }): JSX.Element {
  const { address } = useParams();
  return <MsigTable key={`${view}:${address}`} view={view} address={address} />;
}

export default AccountMultisig;
