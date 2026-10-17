import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAccount } from "src/hooks/useAccount";
import { useRound, useRoundNavigate } from "src/hooks/useRound";
import { useTimeTravelSupport } from "src/hooks/useTimeTravel";
import { CoreAccount } from "src/packages/core-sdk/classes/core/CoreAccount";
import { modelsv2 } from "algosdk";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  ColumnDef,
} from "@tanstack/react-table";
import { Button } from "src/components/v2/ui/button";
import LinkToApplication from "../Links/LinkToApplication";
import LinkToAccount from "../Links/LinkToAccount";
import ApplicationLocalState from "../Application/ApplicationLocalState";
import VersionsLink from "../Versions/VersionsLink";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/v2/ui/dialog";
import { Loader2 } from "lucide-react";
import ListToolbar from "src/components/v2/ListToolbar";
import FilterInput from "src/components/v2/FilterInput";
import { DataTable } from "src/components/v2/DataTable";
import { useFilteredApplications } from "src/hooks/useFilteredApplications";

const columnLabels: Record<string, string> = {
  id: "Application ID",
  state: "State",
};

function AccountOptedApplications(): JSX.Element {
  const { address, id } = useParams();
  const { round } = useRound();
  const navigate = useRoundNavigate();
  const { data: accountInfo, isLoading } = useAccount(address, round);

  const optedApplications = useMemo(() => {
    if (!accountInfo) return [];
    return [...new CoreAccount(accountInfo).getOptedApplications()]
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [accountInfo]);

  const { searchTerm, setSearchTerm, filtered, searchStatus } = useFilteredApplications(optedApplications);

  const columns: ColumnDef<modelsv2.ApplicationLocalState, any>[] = useMemo(
    () => [
      {
        id: "id",
        header: "Application ID",
        cell: ({ row }) => (
          <LinkToApplication id={Number(row.original.id)} copy="left" />
        ),
      },
      {
        id: "state",
        header: "",
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="muted"
              className="h-7 px-2.5 text-xs -my-1 border-primary text-primary hover:bg-primary hover:text-background"
              onClick={() =>
                navigate(`/account/${address}/opted-applications/${Number(row.original.id)}`)
              }
            >
              View State
            </Button>
          </div>
        ),
      },
    ],
    [address, navigate]
  );

  const handleClose = () => {
    navigate(`/account/${address}/opted-applications`);
  };

  const localState = useMemo(() => {
    return accountInfo?.appsLocalState?.find(
      ({ id: i }) => Number(i) === Number(id)
    );
  }, [id, accountInfo]);

  const hasVersions = useTimeTravelSupport();
  const versions = useMemo(
    () => (hasVersions && id ? { path: `/account/${address}/versions`, object: `local:${Number(id)}` } : undefined),
    [hasVersions, address, id]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => String(row.id),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <>
      <div>
        <ListToolbar
          className="mt-3"
          pageIndex={pageIndex}
          pageCount={pageCount}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          onFirst={() => table.setPageIndex(0)}
          onPrev={() => table.previousPage()}
          onNext={() => table.nextPage()}
          onLast={() => table.setPageIndex(pageCount - 1)}
          loading={isLoading}
        >
          <div className="flex items-center gap-3">
            <FilterInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Filter applications"
              className="w-[195px]"
            />
            <div className="text-sm text-muted-foreground whitespace-nowrap">{searchStatus}</div>
          </div>
        </ListToolbar>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DataTable
            table={table}
            columns={columns}
            columnLabels={columnLabels}
            emptyLabel="No applications"
            mobileCellItemsCenter
          />
        )}
      </div>

      <Dialog open={!!id} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto overflow-x-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <span>
                App <LinkToApplication id={Number(id)} /> Local State
              </span>
              {versions ? (
                <VersionsLink
                  path={versions.path}
                  filter={{ object: versions.object, fields: [] }}
                  title="Versions of this local state"
                />
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <div>
            <div className="mb-3 text-sm truncate">
              Account:{" "}
              <LinkToAccount
                address={address}
                copy="none"
                copySize="m"
                strip={20}
              />
            </div>
            <ApplicationLocalState state={localState} versions={versions} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AccountOptedApplications;
