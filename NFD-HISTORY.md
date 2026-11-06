# NFD history

An account tab, "NFD history" (`/account/:address/nfds`), listing the NFDs that listed the account as a verified address (primary or not) and the NFDs it owned, with the round each period started and ended and why it ended. At `?round=R` the periods that held at R come first, marked "at block R". It reads NFDs at past rounds with nfd-ghost-sdk on the time-travel node. Every other NFD read in the app uses the SDK too (see [Names elsewhere](#names-elsewhere)); the app no longer calls the NFD REST API.

## What "listed" and "owned" mean

What nfd-ghost-sdk answers at round R:

- **Listed:** `reverseLookup` at R. Its candidates come only from the registry's `addr/algo/` reverse box and the v1 address lsig; each is then checked (an NFD, not expired or for sale, the address in its `caAlgo`). An NFD whose `caAlgo` holds the address but that neither source lists isn't a link, there or here.
- **Owned:** `getRecord` at R is non-null and its `owner` is the account. Non-null means the app exists and the registry names it (its `name/` box, or the v1 name lsig). An expired NFD is still owned.

The history is exact against those answers, apart from the gaps below.

## Requirements

- A time-travel node for the network with `query` in its capabilities, set as the time-travel algod (`REACT_APP_TIMETRAVEL_ALGOD_URL`, or `localStorage.timetravelAlgodUrl`). The tab shows only when `useTimeTravelCapabilities()?.query` and `sdk.supported()` (one probe query, cached per node) both hold; a probe that failed is asked again after a minute. `pnpm dev:mainnet:tt` uses `mainnet-api-dt.d13.co`, which has queries on.
- nfd-ghost-sdk 2.0.0-dt.6, vendored as `vendor/nfd-ghost-sdk-2.0.0-dt.6.tgz` until it is on npm (then pin `"nfd-ghost-sdk": "2.0.0-dt.6"` exactly). Its peers are the dt5 forks the app already pins in `pnpm-workspace.yaml`, one copy each.

## How it works

The time-travel node's version feeds give the rounds at which an answer can change; the SDK's queries say what the answer is at those rounds. See `src/utils/nfdHistory.ts`. The latest round is read once, and every feed is read with `maxRound(latest)`, so feeds and queries agree on "now".

| Feed | Read | Gives |
|---|---|---|
| Registry reverse box | `getApplicationBoxVersions(registry, sha256("addr/algo/"‖pk))` with values | link candidates over time |
| v1 address lsig | `accountApplicationVersions(lsig, registry)` with values, `i.apps0..15` | v1 link candidates over time |
| Registry owner boxes | `getApplicationBoxesVersions(registry).prefix("O"‖pk)` | every owner box the account ever had, deletions included |
| Each candidate's app | `getApplicationVersions(id).include('keys')` | its change rounds, and which keys changed |
| Each link candidate's `caAlgo` boxes | `getApplicationBoxesVersions(id).prefix("v.caAlgo.")` | v2/v3 verified address changes, which the app feed doesn't show |
| Each owned NFD's naming | `getApplicationBoxVersions(registry, sha256("name/"‖name))`, and for v1 `accountApplicationVersions(nameLsig, registry).key("i.appid")` | when the registry starts or stops naming it |
| NFD assets ever held (stage 2) | indexer `include-all`, unit name `NFD` through Abel, mapped to the app among the 8 ids before the asset | owner candidates from before owner boxes |

App versions are kept when they create or delete the app, when the node can't say which keys changed, or when they change a key below. They split into two round sets:

- **Ownership rounds:** creation, deletion, `i.owner.a`, `i.name`, and the naming feeds' rounds.
- **Link rounds:** the ownership rounds, plus `i.sellamt`, `i.expirationTime`, `i.ver`, any `v.caAlgo.` key (v1), and the `caAlgo` box feed. A candidate's link round counts only while the reverse box or the lsig lists it: outside that, the SDK can't find it either.

`i.reservedOwner.a`, `i.seller.a`, `i.timeChanged` and the `u.*` keys are left out on purpose: neither query reads them.

1. **Links.** `reverseLookupSeries([A], linkRounds, { fields: [], maxPoints })` at the feed rounds, the candidates' link rounds while listed, and the latest round. Expiry happens in time, not in a feed: for each expiry E of a linked NFD before the next sample, `roundAsOfTime(E)` gives R (the last round at or before E), and R and R+1 are read too, since an NFD is expired once a block's timestamp reaches E. Periods split where the primary NFD changes.
2. **Ownership and end reasons.** `getRecordsAt` at every candidate's ownership rounds and at each round a link ended (`expired`, `forSale`, `deleted` or `removed`), in calls of about 50 NFDs: a call cancels all its queries on the first failure, so a failed call loses one batch, which becomes a note.
3. **Naming, a second pass.** For the NFDs some record shows the account owning, the naming feeds' rounds are read with `getRecordsAt` too, and periods are recomputed from every record read.
4. **Stage 2.** A second query, started once stage 1 is done: the asset scan finds older NFD apps, skips stage 1's candidates, and adds their owner periods the same way. Rows append while "Checking older NFDs (asset holdings)…" shows.

Concurrency: the SDK sends 3 query requests at a time and the feeds 2, leaving the node (503 past 8 in flight) room for the page. Busy 503s and 429s are retried by the shared time-travel client, with the retry toast. A failed feed read fails the load, and cancels the reads still running. Results stay in memory (`noPersist`); the SDK caches past rounds.

## Measured (2026-11-06)

First load, stage 1 / stage 2:

| Account | NFDs checked | Feed pages | Record pairs | `mainnet-api-dt.d13.co` | local `:8080` |
|---|---|---|---|---|---|
| `22T47MKF…` (king.dragonfi.algo) | 2 / 19 | 9 / 39 | 12 / 165 | 1.6 s / – (4.8 s both, in the browser) | 0.13 s / 0.8 s |
| `43H6L4VK…` (dealer, 94 owner boxes) | 96 / 51 | 199 / 151 | 101 / 116 | 8.4 s / 5.6 s | 0.7 s / 1.1 s |
| `27CZLZFH…` (bakare.algo) | 2 / 0 | 10 / 0 | 6 / 0 | 2.4 s / 0.4 s | – |
| `XSKED5VK…` (Tinyman escrow) | 0 / 0 | 3 / 0 | 0 / 0 | 0.3 s / 3.6 s | 0.03 s / 3.3 s |

The first version (stash, 2026-10-27, local node) took 2.1–3.5 s, 1.4 s and 12 s for the same three accounts. The escrow's stage 2 is now 3.6 s because holdings older than the registry are dropped before the Abel lookup. On the deployed node the dealer is bound by round trips: about 200 feed pages, 2 at a time, half of them the naming pass. The registry owner-box prefix scan is one page on both nodes (0.3 s for the dealer on the deployed node).

## Verification

`scripts/nfd-history-check.ts` (run with `scripts/nfd-check.vitest.config.ts`, not part of `pnpm test`) loads both stages for the fixtures and 16 accounts from nfd-ghost-sdk's `addresses.txt`, then samples 64 spread rounds, 16 random ones, every period's `from-1`, `from`, `to-1` and `to`, and every round the loader read ±1:

- **Links:** `reverseLookup` must match the loader's link periods exactly, primary included.
- **Ownership:** the loader's owned set must include `getOwned`'s (which only knows owner boxes and assets held at the round); every extra is read with `getRecord` and must name the account as owner.

On 2026-11-06, against local `:8080`: 20 accounts, 87–499 rounds each, no link mismatch, no NFD missing from ownership, and every extra (293 in all) confirmed by `getRecord`.

Fixtures:

- king.dragonfi.algo for `22T47MKF…`: primary from 27,435,631 to exactly 37,821,215, ended `forSale`, and again from exactly 45,666,020. That round changes only `i.timeChanged` in the app; the `caAlgo` box feed is what finds it.
- `818.algo` for `43H6L4VK…`: found through the v1 address lsig.
- `building.algo` for `43H6L4VK…`: owned from 44,601,893, ended `transferred` at 59,651,036, although its owner box remains.
- `bakare.algo` (3,296,744,483) for `27CZLZFH…`: owned while its asset sits in the app; its link ends `expired` at 66,407,306, the first round whose timestamp (1,793,170,507) reaches its expiry (1,793,170,505).
- `batmanmarkets.algo` (2,318,360,299) has never had a verified address, so its expiry ends no link; its owner (`HSHPPMCU…`) keeps an open owner period, as an expired NFD is still owned.
- The Tinyman escrow `XSKED5VK…` finishes, stage 1 first.

## Names elsewhere

The account header, `LinkToAccount`, `DisplayAccount`, the `?alt=` check (`DymNFD`) and `*.algo` search read NFDs with nfd-ghost-sdk at the page's round (`?round=`), through `getNfdReader` (`src/packages/nfd/nfdGhost.ts`):

- **Node.** The time-travel node when one is set and serves this network; else the network's own algod. Nodely's MainNet and TestNet algod run read-only queries (checked 2026-11-06: `sdk.supported()` passes, reads at past rounds work, CORS allows the POST). Where the probe fails (BetaNet, a custom stock node, localnet), no names show.
- **Labels** (`useReverseNFD`) are `reverseLookup([address], { round })`: the SDK batches the labels a page asks for within 10 ms into one query per round. The reader has its own client, so label retries don't raise the retry toast. A pinned round's names never go stale; the latest round's stay an hour.
- **Search** (`searchNFD`, from the search box and from `/name.algo` URLs) is `resolveName(name, { round })`, once the node checks are done: the first verified address, else the owner, with the other verified addresses as `?alt=`. An expired or for-sale NFD has no verified addresses in the SDK, so search opens its owner with a notice.

Checked against the REST API on 2026-11-06 (local `:8080`, latest round):

- **Reverse lookups** (`pnpm verify:rest` in nfd-ghost-sdk, on 2.0.0-dt.6): 1,638 of 1,639 addresses agree on the primary NFD, and 648 of 648 records. The one difference, algpventure.algo, has expired on-chain; REST still called it owned.
- **Search** (`scripts/nfd-search-parity.ts`, v1-nfds.txt and 300 sampled names): 59 of 348 open the same account with the same `?alt=` list. The other 289 are all expired NFDs, for which REST gave no account at all (the old search opened `/account/undefined`); the SDK search opens their owner.

## Known gaps

- **Naming between ownership rounds.** The naming feeds are read only for NFDs some record shows the account owning, so an NFD the registry didn't name at any of its own ownership rounds, but did name in between, is missed. No MainNet case of the registry re-pointing a name without an app version has been found: on 43 accounts (the fixtures and 40 from `addresses.txt`, 657 periods), the periods were the same with and without the naming pass, which costs about one feed request per owned NFD. If it stays that way, the cheaper fallback is to read the latest round for every open owner period and record the rest as a gap.
- **A v3 NFD owned before owner boxes, whose asset stayed in its app**, is found only if it is also a link candidate (the SDK's documented `getOwned` gap).
- **Destroyed NFD assets.** Stage 2 keeps only holdings whose unit name is `NFD` now. If deleting an NFD destroys its asset, that NFD's owner periods are missed. Not confirmed yet (TODO).
- **Owner-box back-fill** is unknown (DESIGN-v2 §9.1), so the asset scan stays.
- **Expiry rounds** come from `roundAsOfTime` (Abel block times on the time-travel node, else the indexer); if that fails, the period ends at the next sampled round instead, with a note.
- **The 60 s time limit** on the deployed node: timed-out requests aren't retried. `getRecordsAt` batches keep requests small, and a failed batch becomes a note naming its NFDs.
- **`include('keys')` pages.** The node's 1 MB page budget counts previous values, programs included; the loader pages until there is no `next-token`, but heavily edited NFDs may take several pages.
