import type { DraftFile, MatchRow, StaticChampion, StaticItem } from "@/lib/types";

let counter = 0;

/** A plausible feed row; override only what a test cares about. */
export function row(over: Partial<MatchRow> = {}): MatchRow {
  counter++;
  return {
    id: `EUW1_${counter}`,
    t: 1_794_000_000 + counter,
    d: 1800,
    v: "16.22",
    reg: "euw1",
    w: 1,
    role: "adc",
    opp: 202,
    k: 5,
    de: 2,
    a: 7,
    cs: 250,
    g: 13000,
    kp: 55,
    p: { n: `Player${counter}`, tag: "EUW", tier: "C", lp: 1200, otp: 0 },
    r: [8000, 8300, 8008, 9111, 9104, 8014, 8304, 8345],
    sh: [5005, 5008, 5011],
    sp: [4, 7],
    fb: [3031, 3006, 3094, 3036, 0, 0, 3363],
    ci: [3006, 3031, 3094, 3036],
    rbi: 0,
    so: "QWEQQRQWQWRWWEEREE",
    ip: [1055, 5, 1, 2003, 6, 1, 3340, 8, 1, 1001, 300, 1, 3006, 520, 1, 3031, 900, 1, 3094, 1300, 1, 3036, 1700, 1],
    ...over,
  };
}

export const ITEMS: Record<string, StaticItem> = {
  1055: { name: "Doran's Blade", plain: "", gold: 450, tags: [] },
  1054: { name: "Doran's Shield", plain: "", gold: 450, tags: [] },
  2003: { name: "Health Potion", plain: "", gold: 50, tags: ["Consumable"], consumable: 1 },
  3340: { name: "Stealth Ward", plain: "", gold: 0, tags: ["Trinket"], trinket: 1 },
  3363: { name: "Farsight Alteration", plain: "", gold: 0, tags: ["Trinket"], trinket: 1 },
  1001: { name: "Boots", plain: "", gold: 300, tags: ["Boots"], boots: 1 },
  3006: { name: "Berserker's Greaves", plain: "", gold: 1100, tags: ["Boots"], boots: 1, completed: 1 },
  3172: { name: "Gunmetal Greaves", plain: "", gold: 1100, tags: [], boots: 1, completed: 1, base: 3006 },
  3047: { name: "Plated Steelcaps", plain: "", gold: 1200, tags: ["Boots"], boots: 1, completed: 1 },
  3111: { name: "Mercury's Treads", plain: "", gold: 1250, tags: ["Boots"], boots: 1, completed: 1 },
  3031: { name: "Infinity Edge", plain: "", gold: 3450, tags: [], completed: 1 },
  3094: { name: "Rapid Firecannon", plain: "", gold: 2650, tags: [], completed: 1 },
  3036: { name: "Lord Dominik's Regards", plain: "", gold: 3100, tags: [], completed: 1 },
  3033: { name: "Mortal Reminder", plain: "", gold: 3300, tags: [], completed: 1 },
  3156: { name: "Maw of Malmortius", plain: "", gold: 3100, tags: [], completed: 1 },
};

const champ = (id: number, key: string, dmg: StaticChampion["dmg"], tags: string[], style: [number, number, number, number, number], ranged = false): StaticChampion => ({
  id,
  key,
  name: key,
  title: "",
  tags,
  dmg,
  style: { damage: style[0], durability: style[1], cc: style[2], mobility: style[3], utility: style[4] },
  ranged,
  spells: [],
  passive: { name: "", img: "" },
});

export const CHAMPIONS: Record<string, StaticChampion> = {
  51: champ(51, "Caitlyn", "ad", ["Marksman"], [3, 1, 2, 2, 1], true),
  202: champ(202, "Jhin", "ad", ["Marksman"], [3, 1, 2, 1, 1], true),
  222: champ(222, "Jinx", "ad", ["Marksman"], [3, 1, 2, 1, 1], true),
  103: champ(103, "Ahri", "ap", ["Mage", "Assassin"], [3, 1, 2, 3, 1], true),
  134: champ(134, "Syndra", "ap", ["Mage"], [3, 1, 2, 1, 1], true),
  1: champ(1, "Annie", "ap", ["Mage"], [3, 1, 3, 1, 1], true),
  54: champ(54, "Malphite", "ap", ["Tank"], [1, 3, 3, 1, 1]),
  57: champ(57, "Maokai", "ap", ["Tank"], [1, 3, 3, 1, 2]),
  238: champ(238, "Zed", "ad", ["Assassin"], [3, 1, 1, 3, 1]),
  64: champ(64, "LeeSin", "ad", ["Fighter"], [2, 2, 2, 3, 1]),
  412: champ(412, "Thresh", "ap", ["Support"], [1, 2, 3, 2, 3], true),
  89: champ(89, "Leona", "ap", ["Tank", "Support"], [1, 3, 3, 1, 2]),
  92: champ(92, "Riven", "ad", ["Fighter"], [3, 2, 2, 3, 1]),
};

/**
 * A tiny, hand-checkable draft dataset (1000 matches):
 *  - mid: Ahri strong (60%), Syndra average (50%), Zed weak (40%); Annie has too few games to count
 *  - adc: Caitlyn (56%) is stronger than Jinx (50%)
 *  - Zed beats Ahri far more often than the base rates predict
 *  - Ahri + LeeSin win together more than expected
 */
export const DRAFT: DraftFile = {
  generatedAt: "2026-11-12T00:00:00.000Z",
  patches: ["16.22", "16.21"],
  matches: 1000,
  base: {
    103: { 2: [400, 240] },
    134: { 2: [400, 200] },
    238: { 2: [400, 160], 1: [4, 2] },
    64: { 1: [600, 300], 0: [30, 15] },
    51: { 3: [500, 280] },
    222: { 3: [500, 250] },
    412: { 4: [500, 250] },
    89: { 4: [500, 250] },
    54: { 0: [500, 250] },
    92: { 0: [500, 250] },
    1: { 2: [5, 3] },
  },
  // a, roleA, b, roleB, games, winsOfA (a < b)
  matchups: [103, 2, 238, 2, 200, 60, 103, 2, 134, 2, 100, 55],
  duos: [64, 1, 103, 2, 200, 140],
};
