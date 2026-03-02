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
| `Transaction.tsx:44` | `const txnInstance = txnObj ? new CoreTransaction(txnObj) : null` — not memoized |
| `AssetBalance.tsx:57–63` | Three separate `new CoreAsset(asset)` calls in one render |
| `Account.tsx:118–120` | `new CoreAccount(accountInfo)` — not memoized, while two more are created inside `useMemo` |
| `LiveBlocks.tsx:54` | `new CoreBlock(block)` inside `.map()` in render, not in `useMemo` |
| `BlockTransactions.tsx:12` | `new CoreBlock(blockInfo).getTransactions()` — inline, not memoized |
| Table cell components (`AmountCell`, `FeeCell`, `TypeCell`, etc.) | `new CoreTransaction(row.original)` on every render |

**Fix examples:**
```tsx
// Transaction.tsx
const txnInstance = useMemo(
  () => txnObj ? new CoreTransaction(txnObj) : null,
  [txnObj]
);

// AssetBalance.tsx — create once, use 3 times
const coreAsset = useMemo(() => new CoreAsset(asset), [asset]);
```

### 3. Repeated `CoreTransaction` instantiation in `groupPositions` loop (`js-cache-property-access`)
**File:** `TransactionsList.tsx:115–133`

In the `groupPositions` useMemo, each transaction is wrapped in `new CoreTransaction()` up to 3 times (once as current, once as prevGroup of the next iteration, once as nextGroup of the prior iteration).

```tsx
// Current: O(3n) CoreTransaction instantiations
const group = new CoreTransaction(transactions[i]).getGroup();
const prevGroup = i > 0 ? new CoreTransaction(transactions[i - 1]).getGroup() : null;
const nextGroup = i < transactions.length - 1 ? new CoreTransaction(transactions[i + 1]).getGroup() : null;

// Fix: pre-compute group IDs once, O(n)
const groups = transactions.map((t) => new CoreTransaction(t).getGroup());
// then use groups[i], groups[i-1], groups[i+1]
```

---

## MEDIUM

### 4. Multiple iterations over `transactions` in `TransactionsList.tsx` (`js-combine-iterations`)

Three separate `useMemo` blocks each iterate `transactions`:
- `columnVisibility` — iterates the page slice, calling `new CoreTransaction(t).getType()` per item
- `allAddresses` — iterates all transactions
- `groupPositions` — iterates all transactions

The `allAddresses` and `groupPositions` passes could be combined into a single loop.

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
