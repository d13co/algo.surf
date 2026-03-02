import { useMemo, useState, useEffect, useRef } from "react";
import { useAccounts, useEscrowBatch } from "src/hooks/useAccount";
import { A_SearchAccount } from "src/packages/core-sdk/types";
import { microalgosToAlgos } from "src/utils/common";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { Button } from "src/components/v2/ui/button";
import { Input } from "src/components/v2/ui/input";
import LinkToAccount from "../Links/LinkToAccount";
import AlgoIcon from "../../AlgoIcon/AlgoIcon";
import NumberFormat from "react-number-format";
import { Filter, Loader2, X } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import { useSearchParams } from "react-router-dom";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import { useStableHeight } from "src/hooks/useStableHeight";
import { useDebounce } from "src/hooks/useDebounce";
import { isValidBase32Prefix, completeAddress } from "src/utils/completeAddress";
import { DataTable } from "src/components/v2/DataTable";

const columns: ColumnDef<A_SearchAccount, any>[] = [
  {
    id: "address",
    header: "Address",
    cell: ({ row }) => (
      <LinkToAccount
        copy="left"
        copySize="s"
        address={row.original.address}
        strip={30}
      />
    ),
  },
  {
    id: "balance",
    header: "Balance",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1">
        <AlgoIcon />
        <NumberFormat
          value={microalgosToAlgos(row.original.amount)}
          displayType="text"
          thousandSeparator
        />
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <span>{row.original.status}</span>,
  },
  {
    id: "created-assets",
    header: "Created assets",
    cell: ({ row }) => <span>{row.original["total-created-assets"]}</span>,
  },
  {
    id: "created-apps",
    header: "Created apps",
    cell: ({ row }) => <span>{row.original["total-created-apps"]}</span>,
  },
];

const columnLabels: Record<string, string> = {
  address: "Address",
  balance: "Balance",
  status: "Status",
  "created-assets": "Created assets",
  "created-apps": "Created apps",
};

function Accounts(): JSX.Element {
  useTitle("Accounts");

  const [searchParams, setSearchParams] = useSearchParams();
  const [prefix, setPrefix] = useState(() => {
    const s = searchParams.get("s") ?? "";
    return s.toUpperCase().replace(/[^A-Z2-7]/g, "").slice(0, 52);
  });
  const [debouncedPrefix, flushPrefix] = useDebounce(prefix, 1500);
  const isDebouncing = prefix !== debouncedPrefix;

  // Sync debounced prefix → ?s= query param
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedPrefix) {
        next.set("s", debouncedPrefix);
      } else {
        next.delete("s");
      }
      return next;
    }, { replace: true });
  }, [debouncedPrefix, setSearchParams]);

  const prefixToken = useMemo(() => {
    if (!debouncedPrefix) return undefined;
    if (!isValidBase32Prefix(debouncedPrefix)) return undefined;
    return completeAddress(debouncedPrefix);
  }, [debouncedPrefix]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAccounts(prefixToken);

  // Filter to only accounts whose address starts with the searched prefix.
  const accounts = useMemo(() => {
    const all = data?.pages.flatMap((p) => p.accounts) ?? [];
    if (!debouncedPrefix) return all;
    return all.filter((a) => a.address.startsWith(debouncedPrefix));
  }, [data, debouncedPrefix]);

  // When filtering by prefix, stop pagination once the indexer returns
  // accounts that no longer match (we've left the prefix range).
  const effectiveHasNextPage = useMemo(() => {
    if (!hasNextPage) return false;
    if (!debouncedPrefix || !data) return hasNextPage;
    const lastPage = data.pages[data.pages.length - 1];
    if (!lastPage || lastPage.accounts.length === 0) return false;
    const lastAccount = lastPage.accounts[lastPage.accounts.length - 1];
    return lastAccount.address.startsWith(debouncedPrefix);
  }, [hasNextPage, debouncedPrefix, data]);

  const allAddresses = useMemo(
    () => accounts.map((a) => a.address),
    [accounts],
  );
  useEscrowBatch(allAddresses);

  const loading = !data;

  const table = useReactTable({
    data: accounts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.address,
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const prefixTokenRef = useRef(prefixToken);
  useEffect(() => {
    if (prefixTokenRef.current !== prefixToken) {
      prefixTokenRef.current = prefixToken;
      table.setPageIndex(0);
    }
  }, [prefixToken, table]);

  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const currentRowCount = table.getRowModel().rows.length;
  const padCount = effectiveHasNextPage && !debouncedPrefix ? pageSize - currentRowCount : 0;

  const { ref: tableRef, style: stableStyle } = useStableHeight(currentRowCount === pageSize);

  function onPageChange(newPage: number) {
    table.setPageIndex(newPage);
    if (newPage >= pageCount - 1 && effectiveHasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }

  return (
    <div>
      {/* Search + Pagination toolbar */}
      <ListToolbar
        pageIndex={pageIndex}
        pageCount={pageCount}
        canPreviousPage={table.getCanPreviousPage()}
        canNextPage={table.getCanNextPage()}
        onFirst={() => onPageChange(0)}
        onPrev={() => onPageChange(pageIndex - 1)}
        onNext={() => onPageChange(pageIndex + 1)}
        onLast={() => onPageChange(pageCount - 1)}
        loading={isFetchingNextPage}
      >
        {/* Filter by address prefix */}
        <div className="relative sm:max-w-[420px] w-full">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Filter by address"
            className="pl-9 pr-16 rounded-full"
            value={prefix}
            onChange={(e) => {
              const cleaned = e.target.value.toUpperCase().replace(/[^A-Z2-7]/g, "");
              setPrefix(cleaned.slice(0, 52));
            }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isDebouncing && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {prefix && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => { setPrefix(""); flushPrefix(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </ListToolbar>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading accounts...</span>
        </div>
      ) : (
        <DataTable
          table={table}
          columns={columns}
          columnLabels={columnLabels}
          emptyLabel="No accounts"
          padCount={padCount}
          isFetchingNextPage={isFetchingNextPage}
          tableRef={tableRef}
          tableStyle={stableStyle}
        />
      )}
    </div>
  );
}

export default Accounts;
