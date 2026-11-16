import { ColumnDef } from "@tanstack/react-table";
import { A_Application } from "src/packages/core-sdk/types";
import {
  ApplicationClient,
  APPLICATIONS_PAGE_SIZE,
} from "src/packages/core-sdk/clients/applicationClient";
import { CoreApplication } from "src/packages/core-sdk/classes/core/CoreApplication";
import explorer from "src/utils/dappflow";
import LinkToApplication from "../Links/LinkToApplication";
import LinkToAccount from "../Links/LinkToAccount";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import CreatedList from "src/components/v2/CreatedList";
import DeletedMark from "src/components/v2/DeletedMark";
import type { FetchAfter } from "src/hooks/useCreatedList";

const columns: ColumnDef<A_Application, any>[] = [
  {
    id: "id",
    header: "Application ID",
    meta: { width: "20%" },
    cell: ({ row }) => (
      <>
        <LinkToApplication copy="left" id={row.original.id} />
        <DeletedMark deleted={row.original.deleted} atRound={row.original.deletedAtRound} />
      </>
    ),
  },
  {
    id: "escrow",
    header: "Application Escrow",
    cell: ({ row }) => {
      const addr = new CoreApplication(row.original).getApplicationAddress();
      return (
        <LinkToAccount
          copy="left"
          copySize="s"
          noEscrow
          address={addr}
          strip={30}
        />
      );
    },
  },
  {
    id: "creator",
    header: "Creator",
    cell: ({ row }) => (
      <LinkToAccount
        copy="left"
        copySize="s"
        address={row.original.params.creator}
        strip={30}
      />
    ),
  },
];

const columnLabels: Record<string, string> = {
  id: "Application ID",
  escrow: "Application Escrow",
  creator: "Creator",
};

const fetchAfter: FetchAfter<A_Application> = async (next, limit, options) => {
  const page = await new ApplicationClient(explorer.network).getApplications(next, limit, options);
  return { items: page.applications, nextToken: page["next-token"] };
};

function Applications(): JSX.Element {
  useTitle("Applications");

  return (
    <CreatedList
      kind="applications"
      columns={columns}
      columnLabels={columnLabels}
      pageSize={APPLICATIONS_PAGE_SIZE}
      fetchAfter={fetchAfter}
      idOf={(app) => app.id}
    />
  );
}

export default Applications;
