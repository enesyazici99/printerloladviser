// Build for one specific game: the champion's pro games are weighted by how
// closely they resemble the current draft (same lane opponent, similar enemy
// team), then summarised like the champion page. Nothing is hand-written —
// every item, rune and spell shown was actually built by a Challenger/GM player.
import { summarize, type BuildSummary, type Share, type WeightedRow } from "../builds";
import type { MatchRow, Role, StaticChampion, StaticItem } from "../types";

type Champions = Record<string, StaticChampion>;

export interface DraftContext {
  role: Role;
  /** enemy champion in the same role (0 = unknown) */
  laneOpponent: number;
  /** all known enemy champions */
  enemies: number[];
  /** known allied champions (without the player's own) */
  allies: number[];
  /** newest patch in the data */
  currentPatch: string;
}

interface Profile {
  ap: number;
  durability: number;
  cc: number;
}

/** Coarse description of a team: magic damage share, tankiness, crowd control. */
export function teamProfile(ids: number[], champions: Champions): Profile | null {
  let ad = 0;
  let ap = 0;
  let durability = 0;
  let cc = 0;
  let n = 0;
  for (const id of ids) {
    const c = champions[id];
    if (!c) continue;
    n++;
    const s = c.style ?? { damage: 2, durability: 2, cc: 2, mobility: 2, utility: 2 };
    if (c.dmg === "ap") ap += s.damage;
    else if (c.dmg === "ad") ad += s.damage;
    else {
      ad += s.damage / 2;
      ap += s.damage / 2;
    }
    durability += s.durability;
    cc += s.cc;
  }
  if (n === 0) return null;
  return { ap: ap / Math.max(1, ad + ap), durability: durability / n, cc: cc / n };
}

const patchValue = (p: string) => {
  const [a, b] = p.split(".").map(Number);
  return a * 100 + b;
};

/** Weight of one pro game for the current draft (0 = ignore). */
export function rowWeight(m: MatchRow, ctx: DraftContext, champions: Champions, target: Profile | null): number {
  let w = 1;
  // Recency: builds change with patches.
  const age = patchValue(ctx.currentPatch) - patchValue(m.v);
  w *= age <= 0 ? 1 : age === 1 ? 0.7 : 0.4;
  // Lane opponent: the strongest signal for runes, starting items and first buys.
  if (ctx.laneOpponent > 0) {
    if (m.opp === ctx.laneOpponent) w *= 8;
    else {
      const a = champions[m.opp];
      const b = champions[ctx.laneOpponent];
      if (a && b && a.dmg === b.dmg && a.tags[0] === b.tags[0]) w *= 1.8; // same kind of opponent
    }
  }
  // Enemy team: shared champions and a similar damage/tankiness profile.
  if (m.en?.length && ctx.enemies.length) {
    let shared = 0;
    for (const id of ctx.enemies) if (id !== ctx.laneOpponent && m.en.includes(id)) shared++;
    w *= 1.5 ** shared;
    const p = teamProfile(m.en, champions);
    if (p && target) {
      const dist = Math.abs(p.ap - target.ap) * 2 + Math.abs(p.durability - target.durability) * 0.5 + Math.abs(p.cc - target.cc) * 0.3;
      w *= 0.6 + 1.2 * Math.exp(-dist * dist * 4);
    }
  }
  // Slight preference for games that were won.
  if (m.w) w *= 1.15;
  return w;
}

export interface AdaptiveBuild {
  summary: BuildSummary;
  /** rows used (role filtered) */
  games: number;
  /** games against the exact lane opponent */
  laneGames: number;
  /** Kish effective sample size of the weighted rows */
  effective: number;
  /** items built clearly more often in games like this one than on average */
  lifted: { id: number; pct: number; basePct: number }[];
  similar: MatchRow[];
}

const MIN_ROLE_ROWS = 12;

export function adaptiveBuild(rows: MatchRow[], ctx: DraftContext, champions: Champions, items: Record<string, StaticItem>): AdaptiveBuild | null {
  let pool = rows.filter((m) => m.role === ctx.role);
  if (pool.length < MIN_ROLE_ROWS) pool = rows; // off-role pick: use everything we have
  if (pool.length === 0) return null;

  const target = teamProfile(ctx.enemies, champions);
  const weighted: WeightedRow[] = pool.map((m) => ({ m, w: rowWeight(m, ctx, champions, target) }));
  const summary = summarize(weighted, items);

  const sum = weighted.reduce((s, r) => s + r.w, 0);
  const sumSq = weighted.reduce((s, r) => s + r.w * r.w, 0);

  // Compare with the unweighted picture to find what is special about this game.
  const baseline = summarize(pool.map((m) => ({ m, w: 1 })), items);
  const basePct = new Map<number, number>(baseline.items.map((s: Share<number>) => [s.value, s.pct]));
  for (const s of baseline.boots) basePct.set(s.value, s.pct);
  const lifted = [...summary.items, ...summary.boots]
    .map((s) => ({ id: s.value, pct: s.pct, basePct: basePct.get(s.value) ?? 0 }))
    .filter((x) => x.pct >= 0.12 && x.pct - x.basePct >= 0.08)
    .sort((a, b) => b.pct - b.basePct - (a.pct - a.basePct))
    .slice(0, 4);

  const similar = [...weighted]
    .sort((a, b) => b.w - a.w || b.m.t - a.m.t)
    .slice(0, 5)
    .map((r) => r.m);

  return {
    summary,
    games: pool.length,
    laneGames: ctx.laneOpponent ? pool.filter((m) => m.opp === ctx.laneOpponent).length : 0,
    effective: sumSq > 0 ? (sum * sum) / sumSq : 0,
    lifted: ctx.enemies.length ? lifted : [],
    similar,
  };
}
