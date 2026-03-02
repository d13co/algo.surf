# Best Practices Review (Vercel React)

Based on a review of this codebase against the Vercel React Best Practices guide (v1.0.0).

---

## CRITICAL

### 1. Route-based code splitting (`bundle-dynamic-imports`) ✅ DONE
**File:** `src/components/App/AppRouter.tsx`

All 20+ route components converted from eager imports to `React.lazy()` with a `<Suspense fallback={null}>` boundary wrapping `<Routes>`. Each route chunk is now fetched on-demand.

Also fixed: `persistOptions={{ persister }}` (new object every render) extracted to module-level `const PERSIST_OPTIONS = { persister }`.

---

## HIGH

### 2. Unmemoized Core class instantiations in render (`rerender-memo`)

`new CoreTransaction()`, `new CoreBlock()`, `new CoreAsset()`, `new CoreAccount()` are created inside render functions without memoization. These should be wrapped in `useMemo`.

| File | Issue |
|------|-------|
| ~~`Transaction.tsx:44`~~ | ✅ FIXED — `txnInstance` wrapped in `useMemo([txnObj])` |
| ~~`AssetBalance.tsx:57–63`~~ | ✅ FIXED — refactored to use `useAsset` hook (React Query), single `coreAsset` instance, returns `null` before asset loads |
| ~~`Account.tsx:118–120`~~ | ✅ FIXED — memoized via `useMemo([accountInfo])`; `createdApplications` and `optedApplications` now reuse the same instance |
| ~~`LiveBlocks.tsx:54`~~ | ✅ FIXED — `blocks.map(b => new CoreBlock(b))` hoisted into `useMemo([blocks])` |
| ~~`BlockTransactions.tsx:12`~~ | ✅ FIXED — `new CoreBlock(blockInfo).getTransactions()` wrapped in `useMemo([blockInfo])` |
| ~~Table cell components~~ | ✅ FIXED — all 7 cells (`AmountCell`, `FeeCell`, `TypeCell`, `FromCell`, `ToCell`, `TxnIdCell`, `AgeCell`, `BlockCell`) use `React.useMemo(() => new CoreTransaction(row.original), [row.original])` |

### 3. ✅ FIXED — Repeated `CoreTransaction` instantiation in `groupPositions` loop + multiple iterations (`js-cache-property-access`, `js-combine-iterations`)
**File:** `TransactionsList.tsx`

`allAddresses` and `groupPositions` were two separate `useMemo` blocks each iterating all transactions. Combined into a single pass. `groupPositions` now pre-computes group IDs in one `O(n)` map, eliminating the previous `O(3n)` pattern where each element was wrapped up to 3 times.

### 5. `NameCell` / `CreatedAtCell` waterfall in `AccountCreatedApplications.tsx`

Each `NameCell` and `CreatedAtCell` fetches `useApplication(appId)` → waits → then fetches `useBlock(createdAtRound)`. This is a sequential waterfall per cell: N apps = N×2 sequential fetches on first load. React Query caching helps on revisits but not the initial render.

---

## GOOD PATTERNS (confirmed correct)

- **Functional setState** — `useLiveData.tsx` correctly uses `setState((s) => applyBlock(s, ...))` throughout
- **Primitive effect dependencies** — `useEscrowBatch` uses `addresses.join(",")` as a primitive dep instead of the array reference (`rerender-dependencies`)
- **Module-level cache** — `escrowCache` Map and `escrowPending` Set in `useAccount.ts` is a correct implementation of `js-cache-function-results`
- **Direct lodash imports** — `import chunk from "lodash/chunk.js"` avoids the barrel import trap (`bundle-barrel-imports`)
- **Conditional rendering uses ternaries** — codebase correctly uses `? ... : null` instead of `{num && <Component />}` throughout, avoiding the accidental `0` render bug (`rendering-conditional-render`)
- **QueryClient at module level** — `query-client.ts` exports a singleton, not recreated per render (`advanced-init-once`)
- **React Query for deduplication** — equivalent to SWR dedup; all data fetching is deduplicated via query keys (`client-swr-dedup`)
