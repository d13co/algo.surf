import { Algodv2 } from "algosdk";
import type { Indexer } from "algosdk";
import { A_BoxNames, A_Box } from "../types";
import { Network } from "../network";

export class BoxClient {
  client: Algodv2;
  indexer: Indexer;
  network: Network;

  constructor(network: Network) {
    this.network = network;
    this.client = network.getClient();
    this.indexer = network.getIndexer();
  }

  async getBoxNames(id: number): Promise<A_BoxNames> {
    const app = await this.client.getApplicationBoxes(id).do();
    const bufferNames = app.boxes
      .sort(({ name: a }, { name: b }) => Buffer.compare(a, b))
      .map(({ name }) => ({ name: Buffer.from(name).toString("base64") }));
    return bufferNames;
  }

  async getBox(id: number, name: string): Promise<A_Box> {
    const { value } = await this.client
      .getApplicationBoxByName(id, new Uint8Array(Buffer.from(name, "base64")))
      .do();
    return { name, value: Buffer.from(value).toString("base64") };
  }
}
