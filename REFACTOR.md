# Refactoring Opportunities

## Part 1: Dead Code / V1 Remnants to Delete

### 1a. Files safe to delete outright
- `src/assets/swagger-theme.scss` — 1719 lines, not imported anywhere
- `src/react-app-env.d.ts` — CRA `react-scripts` type reference; project uses Vite (`vite-env.d.ts`)
- `src/components/Common/OpenInDropdown/` — empty directory (replaced by `src/components/v2/OpenInMenu.tsx`)
- `src/components/Modules/Explorer/Common/AccountBalance/AccountBalance.scss` — orphaned, component gone
- `src/components/Modules/Explorer/Explorer/Explorer.scss` — blank file, imported by `Explorer.tsx`
- `src/components/App/App.scss` — blank file, imported by `App.tsx`

### 1b. Old LoadingTile (v1) — migrate then delete
- `src/components/App/SearchFromPath.tsx:4` imports `../Common/LoadingTile/LoadingTile` (the v1 SCSS-based one)
- Fix: change import to `src/components/v2/LoadingTile`
- Then delete: `src/components/Common/LoadingTile/LoadingTile.tsx` + `LoadingTile.scss`

### 1c. AlgoIcon — migrate SCSS class to Tailwind
- `src/components/Modules/Explorer/AlgoIcon/AlgoIcon.tsx` uses `className="algo-icon"` from SCSS
- Fix: replace with equivalent Tailwind classes, remove `./AlgoIcon.scss` import, delete scss file

### 1d. BoxesList SCSS with MUI class reference
- `src/components/Modules/Explorer/Lists/BoxesList/BoxesList.scss:33` references `.MuiAlert-message`
- The `BoxesList.tsx` in that dir is now a thin re-export wrapper; check if SCSS is even imported
- If not imported: delete it

### 1e. DisplayAccount — consolidate with LinkToAccount
- `src/components/Common/DisplayAccount.tsx` — 7-line component, renders address without a link
- Used only in `FromCell.tsx` and `ToCell.tsx`
- Fix: replace usages with `LinkToAccount` (with appropriate props), delete `DisplayAccount.tsx`

### 1f. microalgosToAlgos — single source
- `Account.tsx:31` and `Block.tsx:15` import `microalgosToAlgos` from `algosdk` directly
- All other files import from `src/utils/common.ts`
- Fix: standardize to one source (either always `algosdk` or always `common.ts`)

---

## Part 2: Duplicate Patterns in V2 Code

### 2a. Desktop/Mobile Table + Pagination (HIGHEST IMPACT)
**8 files** share a near-identical ~60-line JSX block:
- `AccountAssets.tsx`, `AccountCreatedAssets.tsx`, `AccountCreatedApplications.tsx`
- `AccountOptedApplications.tsx`, `AccountControllerTo.tsx`, `Accounts.tsx`
- `Assets.tsx`, `Applications.tsx`

Pattern repeated in each:
```tsx
{/* Desktop table */}
<div className="hidden md:block">
  <Table className="table-fixed">
    <TableHeader>...</TableHeader>
    <TableBody>
      {rows.length > 0 ? rows.map(...) : <TableRow><TableCell colSpan={n}>No X</TableCell></TableRow>}
    </TableBody>
  </Table>
</div>
{/* Mobile cards */}
<div className="md:hidden space-y-2">
  {rows.length > 0 ? rows.map(row => <XCard />) : <div>No X</div>}
</div>
<TablePagination ... />
```

Extract `<DataTable>` to `src/components/v2/DataTable.tsx`:
```tsx
<DataTable table={table} columns={columns} CardComponent={AssetCard} emptyLabel="No assets" isLoading={isLoading} />
```
Estimated savings: ~600 lines across 8 files.

### 2b. Generic Mobile Card (folds into 2a)
Each list file defines a local `*Card` component with identical inner JSX (~12 lines):
```tsx
function XCard({ row }) {
  return (
    <div className="rounded-lg border border-muted bg-card p-3 space-y-2 text-sm">
      {visibleCells.map(cell => (
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground shrink-0">{columnLabels[cell.column.id]}</span>
          <span className="text-right min-w-0 overflow-hidden max-w-[80%]">{flexRender(...)}</span>
        </div>
      ))}
    </div>
  );
}
```
Extract `<MobileCard row={row} columnLabels={columnLabels} />` to `src/components/v2/MobileCard.tsx`, or fold it directly into `DataTable`.

### 2c. Manual Pagination Buttons (not using TablePagination)
3 files implement inline pagination instead of the existing `TablePagination` component:
- `ApplicationGlobalState.tsx` (~52 lines of manual chevron buttons + "Show all")
- `ApplicationLocalState.tsx` (~52 lines, identical)
- `AccountControllerTo.tsx` (partial manual buttons)

Fix: add optional `onShowAll` prop to `src/components/v2/TablePagination.tsx` and use it in all 3 files.

### 2d. InfiniteTransactions Wrapper Pattern
5 files share the same structure:
```tsx
const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useXTransactions(id);
const transactions = useMemo(() => data?.pages.flatMap(p => p.transactions) ?? [], [data]);
function reachedLastPage() { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }
return <TransactionsList transactions={transactions} reachedLastPage={reachedLastPage} ... />
```
Files: `AccountTransactions`, `AssetTransactions`, `ApplicationTransactions`, `GroupTransactions`, `Transactions`.

Note: `BlockTransactions` differs (uses non-infinite `useBlock` + `CoreBlock` — not a candidate).

Fix: extract a `useInfiniteTransactionsList(queryHook, id)` hook, or a wrapper component.

### 2e. Duplicate State Table (AppCall Global/Local Delta)
`AppCallTxnGlobalStateDelta.tsx` and `AppCallTxnLocalStateDelta.tsx` both render an identical 3-column (Operation/Key/Value) table with desktop+mobile card pattern.
Fix: extract `<StateDeltaTable rows={rows} />` to a shared component.

### 2f. AssetBalance — replace raw fetch with useQuery
`src/components/Modules/Explorer/v2/AssetBalance.tsx` uses `useEffect`+`useState` to fetch asset data.
The `useAsset(id)` hook already exists at `src/hooks/useAsset.ts`.
Fix: replace the `useEffect`/`setState` block with `const { data: asset } = useAsset(id)`.

### 2g. Dym useMemo per page
`Application.tsx` and `Asset.tsx` both repeat:
```tsx
const dym = searchParams.get("dym");
const [dymString, dymLink] = useMemo(() => { ... }, [dym]);
{dym ? <Dym text={dymString} link={dymLink} /> : null}
```
Fix: create a `useDym()` hook or move the logic into `<Dym>` itself.

---

## Priority Order

1. **1a–1d** — delete orphaned files, no risk
2. **1e–1f** — small code consolidations
3. **2f** — 1-file anti-pattern fix (useEffect → useQuery)
4. **2a+2b** — biggest payoff (~600 lines removed across 8 files)
5. **2c** — small TablePagination extension
6. **2e** — state table extraction
7. **2d** — InfiniteTransactions hook/wrapper
8. **2g** — useDym hook (low priority)
