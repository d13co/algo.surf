import { network } from "src/packages/core-sdk/constants";

/** surf idx serves fee/TPS series and block proposer analytics. */
const SURF_IDX_HOSTS: Record<string, string> = {
  Mainnet: "https://surf-mainnet-idx.d13.co",
};
// REACT_APP_SURF_IDX points a build at another surf idx, e.g. one on the LAN.
const surfIdxHost = process.env.REACT_APP_SURF_IDX || SURF_IDX_HOSTS[network];
export const surfIdxSupported = !!surfIdxHost;

export async function surfIdxGet<T>(path: string): Promise<T> {
  const response = await fetch(`${surfIdxHost}${path}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
