import { describe, expect, it } from "vitest";
import { matchesQuery, normalize, playedRoles, totalGames } from "@/lib/champions";
import { duration, kdaRatio, pct, signed, timeAgo } from "@/lib/format";
import { translate } from "@/lib/i18n";
import { boardFromQuery, boardToQuery } from "@/stores/draft";
import type { MetaFile, StaticChampion } from "@/lib/types";

describe("champion search", () => {
  const kaisa = { name: "Kai'Sa", key: "Kaisa" } as StaticChampion;
  const wukong = { name: "Wukong", key: "MonkeyKing" } as StaticChampion;
  it("ignores case, punctuation and spaces", () => {
    expect(normalize("Kai'Sa")).toBe("kaisa");
    expect(normalize("Dr. Mundo")).toBe("drmundo");
    expect(matchesQuery(kaisa, "KAI SA")).toBe(true);
  });
  it("handles Turkish letters", () => {
    expect(normalize("İVERN")).toBe("ivern");
    expect(normalize("ışık")).toBe("isik");
  });
  it("matches the internal key as well as the display name", () => {
    expect(matchesQuery(wukong, "monkey")).toBe(true);
    expect(matchesQuery(wukong, "wuk")).toBe(true);
    expect(matchesQuery(wukong, "ahri")).toBe(false);
  });
  it("matches everything for an empty query", () => {
    expect(matchesQuery(kaisa, "  ")).toBe(true);
  });
});

describe("played roles", () => {
  const meta = { champions: { 1: { roles: { mid: [80, 40], support: [20, 10], top: [5, 2] } }, 2: { roles: {} } } } as unknown as MetaFile;
  it("lists roles with a real share of the champion's games, most played first", () => {
    expect(playedRoles(meta, 1)).toEqual(["mid", "support"]);
    expect(totalGames(meta, 1)).toBe(105);
  });
  it("is empty for champions without games", () => {
    expect(playedRoles(meta, 2)).toEqual([]);
    expect(playedRoles(undefined, 1)).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats percentages and signed deltas", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.1234, 1)).toBe("12.3%");
    expect(signed(1.26)).toBe("+1.3");
    expect(signed(-0.4)).toBe("−0.4");
  });
  it("formats KDA including deathless games", () => {
    expect(kdaRatio(4, 2, 6)).toBe("5.00");
    expect(kdaRatio(4, 0, 6)).toBe("Perfect");
    expect(kdaRatio(0, 0, 0)).toBe("0.00");
  });
  it("formats durations", () => {
    expect(duration(1805)).toBe("30:05");
  });
  it("formats relative time in both languages", () => {
    const now = 1_800_000_000_000;
    expect(timeAgo(now / 1000 - 120, "en", now)).toBe("2m ago");
    expect(timeAgo(now / 1000 - 3 * 3600, "tr", now)).toBe("3 sa önce");
    expect(timeAgo(now / 1000 - 2 * 86400, "en", now)).toBe("2d ago");
  });
  it("fills placeholders in translations", () => {
    expect(translate("en", "detail.min", { n: 7 })).toBe("7 min");
    expect(translate("tr", "draft.build.basis", { n: 40, m: 6 })).toContain("40");
  });
});

describe("draft links", () => {
  const state = { ally: [54, 0, 103, 0, 0], enemy: [0, 64, 0, 222, 0], bans: [238, 92], myRole: 2 };
  it("round-trips a board through the URL", () => {
    expect(boardFromQuery(`?${boardToQuery(state)}`)).toEqual(state);
  });
  it("returns null when the URL carries no draft", () => {
    expect(boardFromQuery("")).toBeNull();
    expect(boardFromQuery("?utm=1")).toBeNull();
  });
  it("places a champion coming from a champion page into the user's role", () => {
    expect(boardFromQuery("?pick=51&r=3")).toMatchObject({ ally: [0, 0, 0, 51, 0], myRole: 3 });
    expect(boardFromQuery("?pick=103")?.ally).toEqual([0, 0, 103, 0, 0]);
  });
  it("ignores malformed values", () => {
    const b = boardFromQuery("?a=x.103.&r=9&b=abc.5")!;
    expect(b.ally).toEqual([0, 103, 0, 0, 0]);
    expect(b.myRole).toBeUndefined();
    expect(b.bans).toEqual([5]);
  });
});
