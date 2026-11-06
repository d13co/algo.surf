// Measures the NFD registry's owner-box prefix scan ("O" ‖ pk) on a dtalgod.
// node scripts/nfd-prefix-scan.mjs <algod url> <address>...
import algosdk from "algosdk";
const [url, ...addresses] = process.argv.slice(2);
const u = new URL(url);
const algod = algosdk.DTAlgodClient.from(new algosdk.Algodv2("", `${u.protocol}//${u.hostname}`, u.port || (u.protocol === "https:" ? 443 : 80)));
const REGISTRY = 760937186;
const { lastRound } = await algod.status().do();
for (const address of addresses) {
  const prefix = new Uint8Array([79, ...algosdk.decodeAddress(address).publicKey]);
  const t = Date.now();
  let pages = 0, empty = 0, versions = 0, boxes = 0;
  let next;
  do {
    const req = algod.getApplicationBoxesVersions(REGISTRY).prefix(prefix).maxRound(lastRound).limit(1000);
    if (next) req.next(next);
    const page = await req.do();
    pages++;
    if (!page.versions.length) empty++;
    versions += page.versions.length;
    for (const v of page.versions) boxes += v.boxes?.length ?? 0;
    next = page.nextToken;
  } while (next);
  console.log(`${address.slice(0, 8)}… versions=${versions} box changes=${boxes} pages=${pages} empty=${empty} ${(Date.now() - t) / 1000}s`);
}
