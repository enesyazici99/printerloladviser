import { describe, expect, it } from "vitest";
import { baseBoot, completedNonBoots, filterRows, finalBoots, itemPathGroups, NO_FILTERS, skillPriority, starterItems, summarize } from "@/lib/builds";
import { ITEMS, row } from "./helpers";

const unit = (rows: ReturnType<typeof row>[]) => rows.map((m) => ({ m, w: 1 }));

describe("skillPriority", () => {
  it("orders skills by when they are maxed", () => {
    expect(skillPriority("QWEQQRQWQWRWWEEREE")).toBe("Q>W>E");
    expect(skillPriority("QEWQQRQEQEREEWWRWW")).toBe("Q>E>W");
  });
  it("falls back to points spent when the game ended before a skill was maxed", () => {
    // Q maxed, then 3 points in E and 1 in W
    expect(skillPriority("QEQWQRQEQE")).toBe("Q>E>W");
  });
  it("ignores sequences that are too short to judge", () => {
    expect(skillPriority("QWE")).toBeNull();
  });
});

describe("item helpers", () => {
  it("reads starting items from purchases before minions spawn, without trinkets", () => {
    expect(starterItems(row(), ITEMS)).toEqual([1055, 2003]);
  });
  it("drops a starting item that was bought and sold again before the game started", () => {
    const m = row({ ip: [1055, 3, 1, 1055, 9, 2, 1054, 12, 1, 2003, 13, 1] });
    expect(starterItems(m, ITEMS)).toEqual([1054, 2003]);
  });
  it("counts tier-3 boots as the tier-2 boot they come from", () => {
    expect(baseBoot(3172, ITEMS)).toBe(3006);
    expect(finalBoots(row({ fb: [3172, 3031, 0, 0, 0, 0, 3363] }), ITEMS)).toBe(3006);
  });
  it("finds boots kept in the role-quest slot", () => {
    expect(finalBoots(row({ fb: [3031, 3094, 0, 0, 0, 0, 3363], ci: [3031, 3094], rbi: 3047 }), ITEMS)).toBe(3047);
  });
  it("does not report basic boots as a boot choice", () => {
    expect(finalBoots(row({ fb: [1001, 3031, 0, 0, 0, 0, 3363], ci: [3031] }), ITEMS)).toBe(0);
  });
  it("lists completed items without boots in purchase order", () => {
    expect(completedNonBoots(row(), ITEMS)).toEqual([3031, 3094, 3036]);
  });
  it("groups the item path per minute and marks sales and stacks", () => {
    const m = row({ ip: [1055, 5, 1, 2003, 6, 1, 2003, 7, 1, 1001, 300, 1, 1055, 620, 2, 3031, 625, 1] });
    expect(itemPathGroups(m)).toEqual([
      { minute: 0, events: [{ id: 1055, sold: false, count: 1 }, { id: 2003, sold: false, count: 2 }] },
      { minute: 5, events: [{ id: 1001, sold: false, count: 1 }] },
      { minute: 10, events: [{ id: 1055, sold: true, count: 1 }, { id: 3031, sold: false, count: 1 }] },
    ]);
  });
});

describe("summarize", () => {
  const rows = [
    row({ w: 1 }),
    row({ w: 1 }),
    row({ w: 0, sp: [7, 4] }), // same spells, other order
    row({ w: 0, r: [8000, 8100, 8021, 9111, 9104, 8014, 8139, 8135], ci: [3047, 3031, 3033], fb: [3047, 3031, 3033, 0, 0, 0, 3363], sp: [4, 21], role: "mid", so: "QEWQQRQEQEREEWWRWW" }),
  ];
  const s = summarize(unit(rows), ITEMS);

  it("computes win rate and games", () => {
    expect(s.games).toBe(4);
    expect(s.winRate).toBe(0.5);
  });
  it("ranks roles, runes, boots and items by how often they were used", () => {
    expect(s.roles.map((r) => [r.value, r.pct])).toEqual([["adc", 0.75], ["mid", 0.25]]);
    expect(s.runes[0].value).toEqual({ primary: 8000, keystone: 8008, sub: 8300 });
    expect(s.runes[0].pct).toBe(0.75);
    expect(s.boots.map((b) => [b.value, b.pct])).toEqual([[3006, 0.75], [3047, 0.25]]);
    expect(s.items[0]).toMatchObject({ value: 3031, pct: 1 });
    expect(s.items.find((i) => i.value === 3033)?.pct).toBe(0.25);
  });
  it("reports the win rate of the games that used a choice", () => {
    expect(s.runes[0].wr).toBeCloseTo(2 / 3);
    expect(s.boots[1].wr).toBe(0);
  });
  it("treats summoner spells as an unordered pair", () => {
    expect(s.spells[0]).toMatchObject({ value: [4, 7], pct: 0.75 });
  });
  it("returns the complete page of the most common rune setup", () => {
    expect(s.runePage).toEqual({ r: [8000, 8300, 8008, 9111, 9104, 8014, 8304, 8345], sh: [5005, 5008, 5011] });
  });
  it("picks the dominant skill priority and a real sequence that follows it", () => {
    expect(s.skillPriority[0]).toMatchObject({ value: "Q>W>E", pct: 0.75 });
    expect(s.skillOrder).toBe("QWEQQRQWQWRWWEEREE");
  });
  it("finds starting items and the first three completed items", () => {
    expect(s.starters[0].value).toEqual([1055, 2003]);
    // Shares are among games long enough to finish three items (the fourth row only finished two).
    expect(s.corePaths[0]).toMatchObject({ value: [3031, 3094, 3036], pct: 1 });
  });
  it("tracks what is built first, second, third", () => {
    expect(s.slots[0][0]).toMatchObject({ value: 3031, pct: 1 });
    expect(s.slots[1].map((x) => x.value)).toEqual([3094, 3033]);
  });
  it("lets weights shift the picture", () => {
    const weighted = summarize(rows.map((m, i) => ({ m, w: i === 3 ? 9 : 1 })), ITEMS);
    expect(weighted.boots[0].value).toBe(3047);
    expect(weighted.roles[0].value).toBe("mid");
    expect(weighted.winRate).toBeCloseTo(2 / 12);
  });
  it("handles an empty selection", () => {
    const empty = summarize([], ITEMS);
    expect(empty.games).toBe(0);
    expect(empty.winRate).toBe(0);
    expect(empty.runePage).toBeNull();
    expect(empty.skillOrder).toBe("");
  });
});

describe("filterRows", () => {
  const rows = [
    row({ role: "adc", reg: "kr", w: 1, opp: 222 }),
    row({ role: "adc", reg: "euw1", w: 0, opp: 202, p: { n: "a", tag: "1", tier: "GM", lp: 700, otp: 1 } }),
    row({ role: "mid", reg: "euw1", w: 1, opp: 103 }),
  ];
  it("returns everything without filters", () => {
    expect(filterRows(rows, NO_FILTERS)).toHaveLength(3);
  });
  it("filters by role, server, opponent and result", () => {
    expect(filterRows(rows, { ...NO_FILTERS, role: "adc" })).toHaveLength(2);
    expect(filterRows(rows, { ...NO_FILTERS, server: "kr" })).toHaveLength(1);
    expect(filterRows(rows, { ...NO_FILTERS, opponent: 103 })[0].role).toBe("mid");
    expect(filterRows(rows, { ...NO_FILTERS, winsOnly: true })).toHaveLength(2);
  });
  it("filters by player group", () => {
    expect(filterRows(rows, { ...NO_FILTERS, players: "otp" })).toHaveLength(1);
    expect(filterRows(rows, { ...NO_FILTERS, players: "challenger" })).toHaveLength(2);
  });
  it("combines filters", () => {
    expect(filterRows(rows, { ...NO_FILTERS, role: "adc", server: "euw1", winsOnly: true })).toHaveLength(0);
  });
});
