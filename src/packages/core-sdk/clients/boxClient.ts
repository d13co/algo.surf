import { Algodv2 } from "algosdk";
import type { Indexer } from "algosdk";
import { A_BoxNames, A_Box } from "../types";
import { Network } from "../network";

const BOX_PAGE_SIZE = 500;

export interface BoxNamesPage {
  boxes: A_BoxNames;
  nextToken?: string;
}

export class BoxClient {
  client: Algodv2;
  indexer: Indexer;
  network: Network;

  constructor(network: Network) {
    this.network = network;
    this.client = network.getClient();
    this.indexer = network.getIndexer();
  }

  async getBoxNamesPage(id: number, nextToken?: string): Promise<BoxNamesPage> {
    let req = this.indexer.searchForApplicationBoxes(id).limit(BOX_PAGE_SIZE);
    if (nextToken) {
      req = req.nextToken(nextToken);
    }
    const result = await req.do();
    const boxes = result.boxes.map(({ name }) => ({
      name: Buffer.from(name).toString("base64"),
    }));
    return { boxes, nextToken: result.nextToken };
  }

  async getBox(id: number, name: string): Promise<A_Box> {
    const { value } = await this.client
      .getApplicationBoxByName(id, new Uint8Array(Buffer.from(name, "base64")))
      .do();
    return { name, value: Buffer.from(value).toString("base64") };
  }
}
