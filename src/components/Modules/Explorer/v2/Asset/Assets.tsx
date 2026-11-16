import { ColumnDef } from "@tanstack/react-table";
import { A_Asset } from "src/packages/core-sdk/types";
import { AssetClient, ASSETS_PAGE_SIZE } from "src/packages/core-sdk/clients/assetClient";
import explorer from "src/utils/dappflow";
import LinkToAsset from "../Links/LinkToAsset";
import LinkToAccount from "../Links/LinkToAccount";
import useTitle from "src/components/Common/UseTitle/UseTitle";
import CreatedList from "src/components/v2/CreatedList";
import DeletedMark from "src/components/v2/DeletedMark";
import type { FetchAfter } from "src/hooks/useCreatedList";

const columns: ColumnDef<A_Asset, any>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <>
        <LinkToAsset id={row.original.index} name={row.original.params.name} />
        <DeletedMark deleted={row.original.deleted} atRound={row.original.deletedAtRound} />
      </>
    ),
  },
  {
    id: "index",
    header: "ID",
    cell: ({ row }) => <LinkToAsset id={row.original.index} />,
  },
  {
    id: "unit",
    header: "Unit",
    cell: ({ row }) => <span>{row.original.params["unit-name"]}</span>,
  },
  {
    id: "url",
    header: "Url",
    cell: ({ row }) => {
      const url = row.original.params.url;
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline truncate block"
        >
          {url}
        </a>
      ) : (
        <span className="text-muted-foreground">--None--</span>
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
  name: "Name",
  index: "ID",
  unit: "Unit",
  url: "Url",
  creator: "Creator",
};

const fetchAfter: FetchAfter<A_Asset> = async (next, limit, options) => {
  const page = await new AssetClient(explorer.network).getAssets(next, limit, options);
  return { items: page.assets, nextToken: page["next-token"] };
};

function Assets(): JSX.Element {
  useTitle("Assets");

  return (
    <CreatedList
      kind="assets"
      columns={columns}
      columnLabels={columnLabels}
      pageSize={ASSETS_PAGE_SIZE}
      fetchAfter={fetchAfter}
      idOf={(asset) => asset.index}
    />
  );
}

export default Assets;
