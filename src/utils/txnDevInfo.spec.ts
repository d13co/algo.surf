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

  it("takes clear state programs' costs out of the pool", () => {
    // A clear state program (50, its budget capped at 700) then an app call (100): 1,400 in all.
    const g: SCBudgetRun[] = [
      { path: [0], kind: "clear", "app-id": 8, cost: 50, "budget-before": 700, "budget-after": 650 },
      { path: [1], kind: "approval", "app-id": 9, cost: 100, "budget-before": 1350, "budget-after": 1250 },
    ];
    expect(summarizeBudget(g, 0)).toMatchObject({ clearUsed: 50, groupAppUsed: 150, groupAppBudget: 1400, appPooled: true });
    // One after the last approval: the approval's budget-after still counts it.
    const after: SCBudgetRun[] = [
      { path: [0], kind: "approval", "app-id": 9, cost: 100, "budget-before": 1400, "budget-after": 1300 },
      { path: [1], kind: "clear", "app-id": 8, cost: 50, "budget-before": 700, "budget-after": 650 },
    ];
    expect(summarizeBudget(after, -1)).toMatchObject({ groupAppUsed: 150, groupAppBudget: 1400 });
    // An inner clear state call's cost, like an inner approval's.
    const inner: SCBudgetRun[] = [
      { path: [0], kind: "approval", "app-id": 9, cost: 100, "budget-before": 700, "budget-after": 1270 },
      { path: [0, 0], kind: "clear", "app-id": 8, cost: 30, "budget-before": 700, "budget-after": 670 },
    ];
    expect(budgetAdded(inner[0], inner)).toBe(700);
  });

  it("sums unpooled budgets", () => {
    const apps: SCBudgetRun[] = [
      { path: [0], kind: "approval", "app-id": 1, cost: 100, "budget-before": 700, "budget-after": 600 },
      { path: [1], kind: "approval", "app-id": 2, cost: 200, "budget-before": 700, "budget-after": 500 },
    ];
    expect(summarizeBudget(apps, -1)).toMatchObject({ appPooled: false, groupAppUsed: 300, groupAppBudget: 1400 });
    const sigs: SCBudgetRun[] = [
      { path: [0], kind: "logic-sig", cost: 10, "budget-before": 20000, "budget-after": 19990 },
      { path: [1], kind: "logic-sig", cost: 20, "budget-before": 20000, "budget-after": 19980 },
    ];
    expect(summarizeBudget(sigs, -1)).toMatchObject({ lsigPooled: false, lsigPool: 40000, groupLsigUsed: 30 });
    expect(summarizeBudget(runs, -1)).toMatchObject({ appPooled: true, lsigPooled: true });
    // Unpooled, an approval and a clear state call: two budgets of their own.
    const mixed: SCBudgetRun[] = [
      { path: [0], kind: "clear", "app-id": 1, cost: 50, "budget-before": 700, "budget-after": 650 },
      { path: [1], kind: "approval", "app-id": 2, cost: 100, "budget-before": 700, "budget-after": 600 },
    ];
    expect(summarizeBudget(mixed, -1)).toMatchObject({ appPooled: false, groupAppUsed: 150, groupAppBudget: 1400 });
  });

  it("counts every app call's budget", () => {
    // A clear state call alone.
    expect(summarizeBudget([{ path: [0], kind: "clear", "app-id": 1, cost: 5, "budget-before": 700, "budget-after": 695 }], -1).groupAppBudget).toBe(700);
    // A clear state program after the last approval, with an inner app call: 3 × 700.
    const late: SCBudgetRun[] = [
      { path: [0], kind: "approval", "app-id": 1, cost: 100, "budget-before": 1400, "budget-after": 1300 },
      { path: [1], kind: "clear", "app-id": 2, cost: 50, "budget-before": 700, "budget-after": 650 },
      { path: [1, 0], kind: "approval", "app-id": 3, cost: 30, "budget-before": 1950, "budget-after": 1920 },
    ];
    expect(summarizeBudget(late, -1)).toMatchObject({ groupAppUsed: 180, groupAppBudget: 2100 });
  });
});
