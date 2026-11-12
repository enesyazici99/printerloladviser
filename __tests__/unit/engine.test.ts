import { describe, expect, it } from "vitest";
import { analyzeComp, assignRoles, buildIndex, champRating, duo, matchup, pickRate, roleCandidates, suggestBans, suggestPicks, tierOf, toPoints, toRating, toWinRate, winChance } from "@/lib/draft/engine";
import { CHAMPIONS, DRAFT } from "./helpers";

const index = buildIndex(DRAFT);
const none = new Set<number>();
const EMPTY = [0, 0, 0, 0, 0];
const AHRI = 103;
const SYNDRA = 134;
const ZED = 238;
const LEE = 64;

describe("rating maths", () => {
  it("converts between win rate and rating consistently", () => {
    expect(toRating(0.5)).toBe(0);
    expect(toWinRate(toRating(0.57))).toBeCloseTo(0.57);
    expect(toPoints(toRating(0.57))).toBeCloseTo(7);
  });
  it("shrinks champion win rates towards 50%, less so with a bold setting", () => {
    const raw = toRating(0.6);
    const normal = champRating(index, AHRI, 2, "normal");
    const bold = champRating(index, AHRI, 2, "bold");
    const safe = champRating(index, AHRI, 2, "safe");
    expect(normal).toBeGreaterThan(0);
    expect(normal).toBeLessThan(raw);
    expect(bold).toBeGreaterThan(normal);
    expect(safe).toBeLessThan(normal);
  });
  it("rates a champion without games as average", () => {
    expect(champRating(index, 999, 2, "normal")).toBe(0);
  });
  it("computes pick rate per team slot", () => {
    expect(pickRate(index, AHRI, 2)).toBe(0.2); // 400 games in 1000 matches (2 mid slots each)
  });
});

describe("matchups and duos", () => {
  it("is symmetric: what one side gains the other loses", () => {
    const a = matchup(index, AHRI, 2, ZED, 2, "normal");
    const z = matchup(index, ZED, 2, AHRI, 2, "normal");
    expect(a.games).toBe(200);
    expect(a.winRate).toBeCloseTo(0.3);
    expect(z.winRate).toBeCloseTo(0.7);
    expect(a.delta).toBeLessThan(0);
    expect(z.delta).toBeCloseTo(-a.delta, 6);
  });
  it("measures the matchup beyond the champions' own strength", () => {
    // Ahri (60%) beats Syndra (50%) 55% of the time — roughly what base strength predicts.
    const m = matchup(index, AHRI, 2, SYNDRA, 2, "normal");
    expect(Math.abs(toPoints(m.delta))).toBeLessThan(1.5);
  });
  it("returns zero for pairs without data", () => {
    expect(matchup(index, AHRI, 2, 51, 3, "normal")).toEqual({ delta: 0, games: 0, winRate: null });
    expect(duo(index, AHRI, 2, 51, 3, "normal").delta).toBe(0);
  });
  it("finds duo synergy regardless of argument order", () => {
    const a = duo(index, AHRI, 2, LEE, 1, "normal");
    const b = duo(index, LEE, 1, AHRI, 2, "normal");
    expect(a.delta).toBeGreaterThan(0);
    expect(a.delta).toBeCloseTo(b.delta, 6);
    expect(a.winRate).toBeCloseTo(0.7);
  });
  it("believes small samples less with the cautious setting", () => {
    const safe = Math.abs(matchup(index, AHRI, 2, ZED, 2, "safe").delta);
    const bold = Math.abs(matchup(index, AHRI, 2, ZED, 2, "bold").delta);
    expect(bold).toBeGreaterThan(safe);
  });
});

describe("suggestPicks", () => {
  it("only offers champions that are really played in the role", () => {
    const mids = roleCandidates(index, 2);
    expect(mids.sort()).toEqual([AHRI, SYNDRA, ZED].sort());
    expect(mids).not.toContain(1); // Annie has only 5 mid games
    expect(roleCandidates(index, 1)).toEqual([LEE]); // Zed has 4 jungle games: not a jungler
  });
  it("ranks by base strength when nothing else is known", () => {
    const picks = suggestPicks(index, EMPTY, EMPTY, 3, { risk: "normal", unavailable: none });
    expect(picks.map((p) => p.champ)).toEqual([51, 222]);
    expect(picks[0].base).toMatchObject({ games: 500, winRate: 0.56 });
    expect(picks[0].points).toBeGreaterThan(0);
  });
  it("prefers a safe blind pick over one with a common hard counter", () => {
    // Ahri is the strongest mid on paper, but half of the enemy mids (Zed) beat her badly.
    const picks = suggestPicks(index, EMPTY, EMPTY, 2, { risk: "normal", unavailable: none });
    const ahri = picks.find((p) => p.champ === AHRI)!;
    const syndra = picks.find((p) => p.champ === SYNDRA)!;
    expect(ahri.blind).toBeLessThan(0);
    expect(syndra.blind).toBe(0);
    expect(ahri.base.points).toBeGreaterThan(syndra.base.points);
    expect(picks.indexOf(syndra)).toBeLessThan(picks.indexOf(ahri));
  });
  it("moves a counter pick up when the enemy laner is known", () => {
    const enemy = [0, 0, AHRI, 0, 0];
    const picks = suggestPicks(index, EMPTY, enemy, 2, { risk: "normal", unavailable: new Set([AHRI]) });
    const zed = picks.find((p) => p.champ === ZED)!;
    const syndra = picks.find((p) => p.champ === SYNDRA)!;
    expect(zed.counters[0]).toMatchObject({ champ: AHRI, role: 2, games: 200 });
    expect(zed.counters[0].points).toBeGreaterThan(0);
    expect(zed.points).toBeGreaterThan(zed.base.points);
    expect(zed.blind).toBeNull();
    // Zed is 10 points weaker than Syndra on paper but ends up close or ahead thanks to the matchup.
    expect(zed.points - zed.base.points).toBeGreaterThan(syndra.points - syndra.base.points);
  });
  it("adds synergy with allies", () => {
    const ally = [0, LEE, 0, 0, 0];
    const picks = suggestPicks(index, ally, EMPTY, 2, { risk: "normal", unavailable: new Set([LEE]) });
    const ahri = picks.find((p) => p.champ === AHRI)!;
    expect(ahri.synergies[0]).toMatchObject({ champ: LEE, role: 1, games: 200 });
    expect(ahri.synergies[0].points).toBeGreaterThan(0);
  });
  it("never suggests picked or banned champions", () => {
    const picks = suggestPicks(index, EMPTY, EMPTY, 2, { risk: "normal", unavailable: new Set([AHRI, SYNDRA]) });
    expect(picks.map((p) => p.champ)).toEqual([ZED]);
  });
  it("can be limited to the player's pool", () => {
    const picks = suggestPicks(index, EMPTY, EMPTY, 2, { risk: "normal", unavailable: none, pool: new Set([ZED]) });
    expect(picks.map((p) => p.champ)).toEqual([ZED]);
  });
  it("honours the limit", () => {
    expect(suggestPicks(index, EMPTY, EMPTY, 2, { risk: "normal", unavailable: none, limit: 2 })).toHaveLength(2);
  });
});

describe("suggestBans", () => {
  it("targets the strongest popular picks for the enemy's open roles", () => {
    const bans = suggestBans(index, EMPTY, EMPTY, { risk: "normal", unavailable: none });
    expect(bans[0].champ).toBe(51); // Caitlyn: strong and picked in a quarter of all games
    expect(new Set(bans.map((b) => b.champ)).size).toBe(bans.length);
    for (let i = 1; i < bans.length; i++) expect(bans[i - 1].priority).toBeGreaterThanOrEqual(bans[i].priority);
  });
  it("ignores roles the enemy has already filled", () => {
    const enemy = [0, 0, SYNDRA, 0, 0];
    const bans = suggestBans(index, EMPTY, enemy, { risk: "normal", unavailable: new Set([SYNDRA]) });
    expect(bans.some((b) => b.role === 2)).toBe(false);
  });
  it("raises a champion that counters our pick", () => {
    const ally = [0, 0, AHRI, 0, 0];
    const bans = suggestBans(index, ally, EMPTY, { risk: "bold", unavailable: new Set([AHRI]) });
    const zed = bans.find((b) => b.champ === ZED)!;
    const syndra = bans.find((b) => b.champ === SYNDRA)!;
    expect(zed.counters[0].champ).toBe(AHRI);
    expect(zed.points - zed.base.points).toBeGreaterThan(syndra.points - syndra.base.points);
  });
});

describe("winChance", () => {
  it("is 50% for an empty or mirrored-strength draft", () => {
    expect(winChance(index, EMPTY, EMPTY, "normal")).toBe(0.5);
    expect(winChance(index, [0, 0, 0, 0, 412], [0, 0, 0, 0, 89], "normal")).toBeCloseTo(0.5);
  });
  it("is antisymmetric between the two sides", () => {
    const a = [0, LEE, AHRI, 0, 0];
    const b = [0, 0, ZED, 222, 0];
    const p = winChance(index, a, b, "normal");
    expect(winChance(index, b, a, "normal")).toBeCloseTo(1 - p, 10);
  });
  it("rewards synergy and punishes a bad matchup", () => {
    const withLee = winChance(index, [0, LEE, AHRI, 0, 0], EMPTY, "normal");
    const alone = winChance(index, [0, 0, AHRI, 0, 0], EMPTY, "normal");
    expect(withLee).toBeGreaterThan(alone);
    // Against Zed, Ahri does worse than the strength of the two champions alone would predict.
    const vsZed = winChance(index, [0, 0, AHRI, 0, 0], [0, 0, ZED, 0, 0], "normal");
    const onPaper = toWinRate(champRating(index, AHRI, 2, "normal") - champRating(index, ZED, 2, "normal"));
    expect(vsZed).toBeLessThan(onPaper);
    expect(winChance(index, [0, 0, AHRI, 0, 0], [0, 0, SYNDRA, 0, 0], "normal")).toBeGreaterThan(0.5);
  });
});

describe("assignRoles", () => {
  it("puts champions where they are played most", () => {
    expect(assignRoles(index, [222, LEE, AHRI, 412, 54])).toEqual([54, LEE, AHRI, 222, 412]);
  });
  it("resolves conflicts between two champions of the same main role", () => {
    // Zed has a few jungle games, Ahri none: Ahri keeps mid, Zed goes jungle.
    expect(assignRoles(index, [ZED, AHRI])).toEqual([0, ZED, AHRI, 0, 0]);
  });
  it("keeps champions that already have a slot", () => {
    expect(assignRoles(index, [AHRI], [0, 0, SYNDRA, 0, 0])[2]).toBe(SYNDRA);
  });
});

describe("analyzeComp", () => {
  it("measures the damage split and warns about one-sided damage", () => {
    const fullAd = analyzeComp([92, LEE, ZED, 51, 0], CHAMPIONS);
    expect(fullAd.ad).toBe(1);
    expect(fullAd.warnings).toContain("draft.comp.warn.fullAd");
    const mixed = analyzeComp([54, LEE, AHRI, 51, 412], CHAMPIONS);
    expect(mixed.ad).toBeGreaterThan(0.3);
    expect(mixed.ad).toBeLessThan(0.7);
    expect(mixed.warnings).not.toContain("draft.comp.warn.fullAd");
  });
  it("warns when there is no frontline", () => {
    expect(analyzeComp([92, LEE, AHRI, 51, 412], CHAMPIONS).warnings).toContain("draft.comp.warn.noFrontline");
  });
  it("counts tanks as frontline", () => {
    const comp = analyzeComp([54, LEE, AHRI, 51, 89], CHAMPIONS);
    expect(comp.frontline).toBe(2);
    expect(comp.warnings).not.toContain("draft.comp.warn.noFrontline");
  });
  it("stays quiet while the draft is still short", () => {
    expect(analyzeComp([92, 0, ZED, 0, 0], CHAMPIONS).warnings).toEqual([]);
  });
  it("is neutral for an empty team", () => {
    expect(analyzeComp(EMPTY, CHAMPIONS)).toMatchObject({ picks: 0, ad: 0.5, ap: 0.5 });
  });
});

describe("tierOf", () => {
  it("combines strength and popularity", () => {
    expect(tierOf(4, 0)).toBe("S");
    expect(tierOf(1, 10)).toBe("S");
    expect(tierOf(0.5, 0)).toBe("B");
    expect(tierOf(-3, 1)).toBe("D");
  });
});
