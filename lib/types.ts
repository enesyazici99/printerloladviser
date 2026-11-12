// Shapes of the JSON files produced by scripts/data/build-data.mjs.

export type Role = "top" | "jungle" | "mid" | "adc" | "support";
export const ROLES: Role[] = ["top", "jungle", "mid", "adc", "support"];

export interface PlayerInfo {
  /** Riot ID game name */
  n: string;
  tag: string;
  /** "C" = Challenger, "GM" = Grandmaster */
  tier: "C" | "GM";
  lp: number;
  /** 1 when the player is a one-trick of the champion in this row */
  otp: 0 | 1;
}

/** One player's game on a champion (a row of the pro feed). */
export interface MatchRow {
  id: string;
  /** end of game, unix seconds */
  t: number;
  /** duration in seconds */
  d: number;
  /** patch, e.g. "16.22" */
  v: string;
  /** platform: kr, euw1, na1 */
  reg: string;
  w: 0 | 1;
  role: Role | null;
  /** lane opponent champion id (0 = unknown) */
  opp: number;
  k: number;
  de: number;
  a: number;
  cs: number;
  g: number;
  kp: number | null;
  p: PlayerInfo;
  /** [primaryStyle, subStyle, keystone, p1, p2, p3, s1, s2] */
  r: number[];
  sh: number[];
  sp: number[];
  /** final inventory: 6 slots + trinket */
  fb: number[];
  /** completed items in purchase order */
  ci: number[];
  rbi: number;
  /** skill order, one letter per level */
  so: string;
  /** flat triples: itemId, second, type (1 bought, 2 sold) */
  ip: number[];
  /** own team / enemy team champions, ordered top..support when ro = 1 */
  tm?: number[];
  en?: number[];
  ro?: number;
  /** champion id — only present in the mixed home feed */
  c?: number;
}

export interface ChampionFile {
  id: number;
  key: string;
  updated: string;
  matches: MatchRow[];
  /** lane matchups per role: [opponentId, games, wins] */
  lane: Partial<Record<Role, [number, number, number][]>>;
}

export interface StaticChampion {
  id: number;
  key: string;
  name: string;
  title: string;
  tags: string[];
  dmg: "ad" | "ap" | "mixed";
  style: { damage: number; durability: number; cc: number; mobility: number; utility: number } | null;
  ranged: boolean;
  spells: { name: string; img: string }[];
  passive: { name: string; img: string };
}

export interface StaticItem {
  name: string;
  plain: string;
  gold: number;
  tags: string[];
  boots?: 1;
  trinket?: 1;
  consumable?: 1;
  completed?: 1;
  /** tier-2 boot this tier-3 boot upgrades from */
  base?: number;
}

export interface StaticRune {
  id: number;
  name: string;
  icon: string;
  short: string;
}

export interface RuneStyle {
  id: number;
  key: string;
  name: string;
  icon: string;
  slots: StaticRune[][];
}

export interface StaticData {
  version: string;
  champions: Record<string, StaticChampion>;
  items: Record<string, StaticItem>;
  runes: RuneStyle[];
  shards: Record<string, { name: string; icon: string }>;
  spells: Record<string, { key: string; name: string; img: string }>;
}

export interface MetaFile {
  generatedAt: string;
  ddragon: string;
  platforms: string[];
  patches: string[];
  matches: number;
  feedRows: number;
  players: number;
  champions: Record<
    string,
    { feed: number; feedWins: number; last: number; roles: Partial<Record<Role, [number, number]>> }
  >;
}

export interface DraftFile {
  generatedAt: string;
  patches: string[];
  matches: number;
  /** champion id -> role index -> [games, wins] */
  base: Record<string, Record<string, [number, number]>>;
  /** flat sextuples: a, roleA, b, roleB, games, winsOfA (a < b) */
  matchups: number[];
  /** flat sextuples: a, roleA, b, roleB, games, wins (a < b, same team) */
  duos: number[];
}

export interface FeedFile {
  matches: MatchRow[];
}
