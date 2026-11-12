import { describe, expect, it } from "vitest";
import { adaptiveBuild, rowWeight, teamProfile, type DraftContext } from "@/lib/draft/build";
import { CHAMPIONS, ITEMS, row } from "./helpers";

const ctx = (over: Partial<DraftContext> = {}): DraftContext => ({ champion: 51, role: "adc", laneOpponent: 0, enemies: [], allies: [], currentPatch: "16.22", ...over });

describe("teamProfile", () => {
  it("describes how magic-heavy and tanky a team is", () => {
    expect(teamProfile([103, 134, 54], CHAMPIONS)!.ap).toBe(1);
    expect(teamProfile([238, 64, 51], CHAMPIONS)!.ap).toBe(0);
    expect(teamProfile([54, 57], CHAMPIONS)!.durability).toBe(3);
    expect(teamProfile([], CHAMPIONS)).toBeNull();
  });
});

describe("rowWeight", () => {
  it("prefers the current patch", () => {
    const now = rowWeight(row({ v: "16.22", w: 0 }), ctx(), CHAMPIONS, null);
    const last = rowWeight(row({ v: "16.21", w: 0 }), ctx(), CHAMPIONS, null);
    const old = rowWeight(row({ v: "16.18", w: 0 }), ctx(), CHAMPIONS, null);
    expect(now).toBeGreaterThan(last);
    expect(last).toBeGreaterThan(old);
  });
  it("weights games against the same lane opponent far above the rest", () => {
    const c = ctx({ laneOpponent: 222, enemies: [222] });
    const same = rowWeight(row({ opp: 222, w: 0 }), c, CHAMPIONS, null);
    const similar = rowWeight(row({ opp: 202, w: 0 }), c, CHAMPIONS, null); // another AD marksman
    const other = rowWeight(row({ opp: 103, w: 0 }), c, CHAMPIONS, null);
    expect(same).toBeGreaterThan(similar * 3);
    expect(similar).toBeGreaterThan(other);
  });
  it("rewards enemy teams that share champions or look alike", () => {
    const enemies = [54, 64, 103, 222, 412];
    const c = ctx({ laneOpponent: 222, enemies });
    const target = teamProfile(enemies, CHAMPIONS);
    const shared = rowWeight(row({ opp: 202, w: 0, en: [54, 64, 103, 202, 412] }), c, CHAMPIONS, target);
    const different = rowWeight(row({ opp: 202, w: 0, en: [92, 238, 238, 202, 89] }), c, CHAMPIONS, target);
    expect(shared).toBeGreaterThan(different * 3);
  });
  it("also considers the player's own team, but less than the enemy team", () => {
    const allies = [54, 64, 103, 412]; // tank top, AD jungle, AP mid, support
    const c = ctx({ allies });
    const allyTarget = teamProfile(allies, CHAMPIONS);
    const sameTeam = rowWeight(row({ w: 0, tm: [54, 64, 103, 51, 412] }), c, CHAMPIONS, null, allyTarget);
    const otherTeam = rowWeight(row({ w: 0, tm: [92, 238, 238, 51, 89] }), c, CHAMPIONS, null, allyTarget);
    const unknownTeam = rowWeight(row({ w: 0 }), c, CHAMPIONS, null, allyTarget);
    expect(sameTeam).toBeGreaterThan(otherTeam * 2);
    expect(unknownTeam).toBe(1); // rows without team data are neither rewarded nor punished
    // Four shared enemies move the weight more than four shared allies.
    const enemies = [54, 64, 103, 412];
    const sameEnemies = rowWeight(row({ w: 0, en: [54, 64, 103, 222, 412] }), ctx({ enemies }), CHAMPIONS, teamProfile(enemies, CHAMPIONS));
    expect(sameEnemies).toBeGreaterThan(sameTeam);
  });
  it("leans slightly towards games that were won", () => {
    expect(rowWeight(row({ w: 1 }), ctx(), CHAMPIONS, null)).toBeGreaterThan(rowWeight(row({ w: 0 }), ctx(), CHAMPIONS, null));
  });
});

describe("adaptiveBuild", () => {
  // 20 ordinary games with Berserker's Greaves, 6 games into an AP-heavy team with Mercury's Treads + Maw.
  const normal = Array.from({ length: 20 }, () => row({ opp: 202, en: [92, 64, 238, 202, 89] }));
  const vsAp = Array.from({ length: 6 }, () =>
    row({ opp: 222, en: [54, 57, 103, 222, 412], ci: [3111, 3031, 3156], fb: [3111, 3031, 3156, 0, 0, 0, 3363], r: [8000, 8400, 8008, 9111, 9104, 8014, 8444, 8451] })
  );
  const rows = [...normal, ...vsAp];

  it("returns the usual build when nothing is known about the enemy", () => {
    const b = adaptiveBuild(rows, ctx(), CHAMPIONS, ITEMS)!;
    expect(b.games).toBe(26);
    expect(b.summary.boots[0].value).toBe(3006);
    expect(b.lifted).toEqual([]);
  });
  it("shifts to what pros built in games like this one", () => {
    const b = adaptiveBuild(rows, ctx({ laneOpponent: 222, enemies: [54, 57, 103, 222, 412] }), CHAMPIONS, ITEMS)!;
    expect(b.laneGames).toBe(6);
    expect(b.summary.boots[0].value).toBe(3111);
    expect(b.summary.runes[0].value.sub).toBe(8400);
    expect(b.lifted.map((x) => x.id)).toContain(3156);
    expect(b.lifted.map((x) => x.id)).toContain(3111);
    expect(b.similar.every((m) => m.opp === 222)).toBe(true);
    expect(b.effective).toBeLessThan(26);
  });
  it("only uses games in the chosen role when there are enough", () => {
    const withMid = [...rows, ...Array.from({ length: 5 }, () => row({ role: "mid" }))];
    expect(adaptiveBuild(withMid, ctx(), CHAMPIONS, ITEMS)!.games).toBe(26);
  });
  it("falls back to all games for an off-role pick", () => {
    expect(adaptiveBuild(rows, ctx({ role: "top" }), CHAMPIONS, ITEMS)!.games).toBe(26);
  });
  it("returns null without any games", () => {
    expect(adaptiveBuild([], ctx(), CHAMPIONS, ITEMS)).toBeNull();
  });
});
