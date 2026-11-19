import { describe, expect, it } from "vitest";
import { budgetAdded, isOpUp, SCBudgetRun, summarizeBudget } from "./txnDevInfo";

// A logic sig payment (0) and an app call (1) in a group. The app call spends
// 100, calls inner 1 (+700, which spends 200), spends 50, calls an op-up
// (+700, spends 2), then spends 750: 900 of its own.
const runs: SCBudgetRun[] = [
  { path: [0], txid: "P", kind: "logic-sig", cost: 30, "budget-before": 40000, "budget-after": 39970 },
  { path: [1], txid: "A", kind: "approval", "app-id": 5, cost: 900, "budget-before": 700, "budget-after": 998 },
  { path: [1, 0], kind: "approval", "app-id": 6, cost: 200, "budget-before": 1300, "budget-after": 1100 },
  { path: [1, 1], kind: "approval", "app-id": 7, cost: 2, "budget-before": 1750, "budget-after": 1748 },
];

describe("budget", () => {
  it("summarizes a transaction and its group", () => {
    expect(summarizeBudget(runs, 1)).toMatchObject({ appUsed: 1102, clearUsed: 0, lsigUsed: 0, groupAppUsed: 1102, opUps: 1 });
    // used 1,102 + 998 left at the end = 2,100: three app calls' 700 each.
    expect(summarizeBudget(runs, 1).groupAppBudget).toBe(2100);
    expect(summarizeBudget(runs, 0)).toMatchObject({ lsigUsed: 30, lsigPool: 40000, groupLsigUsed: 30 });
  });

  it("finds op-ups and what inner calls added", () => {
    expect(runs.filter(isOpUp).map((r) => r.path)).toEqual([[1, 1]]);
    // Two inner app calls: 700 each.
    expect(budgetAdded(runs[1], runs)).toBe(1400);
  });
});
