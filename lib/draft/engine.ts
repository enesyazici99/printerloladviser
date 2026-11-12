// Draft scoring. The model follows the open-source DraftGap approach: every
// champion, lane matchup and duo is turned into an Elo-like rating, small
// samples are shrunk towards what the champions' own ratings predict, and the
// ratings are summed into a team win probability.
//
// All numbers come from draft.json (Challenger/Grandmaster games only).
import type { DraftFile, StaticChampion } from "../types";
import type { StringKey } from "../i18n";

export const ROLE_COUNT = 5;

export type Risk = "safe" | "normal" | "bold";
/**
 * Prior strength in "games": how much evidence a sample needs before it is believed.
 * A prior of N games corresponds to assuming true effects are spread by about
 * sqrt(0.25 / N): 300 games ≈ ±3 points for champions, 250 ≈ ±3 for lane
 * matchups, 600 ≈ ±2 for pairs that do not share a lane.
 */
const PRIORS: Record<Risk, { champ: number; lane: number; pair: number }> = {
  safe: { champ: 750, lane: 625, pair: 1500 },
  normal: { champ: 300, lane: 250, pair: 600 },
  bold: { champ: 120, lane: 100, pair: 240 },
};

/** Opponents in the same lane (incl. the 2v2 bot lane) interact far more than the rest of the map. */
const sharesLane = (ra: number, rb: number) => ra === rb || (ra >= 3 && rb >= 3);

export interface DraftIndex {
  matches: number;
  patches: string[];
  /** champion id -> games/wins per role index */
  champs: Map<number, [number, number][]>;
  matchups: Map<number, [number, number]>;
  duos: Map<number, [number, number]>;
}

const slot = (champ: number, role: number) => champ * ROLE_COUNT + role;
const pairKey = (a: number, ra: number, b: number, rb: number) => slot(a, ra) * 16384 + slot(b, rb);

export function buildIndex(file: DraftFile): DraftIndex {
  const champs = new Map<number, [number, number][]>();
  for (const [id, roles] of Object.entries(file.base)) {
    const arr: [number, number][] = Array.from({ length: ROLE_COUNT }, () => [0, 0]);
    for (const [r, gw] of Object.entries(roles)) arr[Number(r)] = gw;
    champs.set(Number(id), arr);
  }
  const load = (flat: number[]) => {
    const map = new Map<number, [number, number]>();
    for (let i = 0; i + 5 < flat.length; i += 6) map.set(pairKey(flat[i], flat[i + 1], flat[i + 2], flat[i + 3]), [flat[i + 4], flat[i + 5]]);
    return map;
  };
  return { matches: file.matches, patches: file.patches, champs, matchups: load(file.matchups), duos: load(file.duos) };
}

export const toRating = (winRate: number) => 400 * Math.log10(winRate / (1 - winRate));
export const toWinRate = (rating: number) => 1 / (1 + 10 ** (-rating / 400));
/** Rating expressed as percentage points around 50%. */
export const toPoints = (rating: number) => (toWinRate(rating) - 0.5) * 100;

export function roleGames(index: DraftIndex, champ: number, role: number): [number, number] {
  return index.champs.get(champ)?.[role] ?? [0, 0];
}

/** Share of games in which the champion was picked in that role (0..1). */
export function pickRate(index: DraftIndex, champ: number, role: number): number {
  return index.matches > 0 ? roleGames(index, champ, role)[0] / (2 * index.matches) : 0;
}

export function champRating(index: DraftIndex, champ: number, role: number, risk: Risk): number {
  const [g, w] = roleGames(index, champ, role);
  const p = PRIORS[risk].champ;
  return toRating((w + p * 0.5) / (g + p));
}

interface PairResult {
  /** rating beyond what the two champions' own strength predicts */
  delta: number;
  games: number;
  /** raw win rate of the first champion (null without games) */
  winRate: number | null;
}

/** How champion a (role ra) does against enemy b (role rb). */
export function matchup(index: DraftIndex, a: number, ra: number, b: number, rb: number, risk: Risk): PairResult {
  const swap = a > b;
  const rec = swap ? index.matchups.get(pairKey(b, rb, a, ra)) : index.matchups.get(pairKey(a, ra, b, rb));
  if (!rec || rec[0] === 0) return { delta: 0, games: 0, winRate: null };
  const games = rec[0];
  const wins = swap ? games - rec[1] : rec[1];
  const expected = champRating(index, a, ra, risk) - champRating(index, b, rb, risk);
  const p = sharesLane(ra, rb) ? PRIORS[risk].lane : PRIORS[risk].pair;
  const shrunk = (wins + p * toWinRate(expected)) / (games + p);
  return { delta: toRating(shrunk) - expected, games, winRate: wins / games };
}

/** How champions a and b do on the same team. */
export function duo(index: DraftIndex, a: number, ra: number, b: number, rb: number, risk: Risk): PairResult {
  const swap = a > b;
  const rec = swap ? index.duos.get(pairKey(b, rb, a, ra)) : index.duos.get(pairKey(a, ra, b, rb));
  if (!rec || rec[0] === 0) return { delta: 0, games: 0, winRate: null };
  const [games, wins] = rec;
  const expected = champRating(index, a, ra, risk) + champRating(index, b, rb, risk);
  const p = sharesLane(ra, rb) ? PRIORS[risk].lane : PRIORS[risk].pair; // the bot-lane duo plays together all game
  const shrunk = (wins + p * toWinRate(expected)) / (games + p);
  return { delta: toRating(shrunk) - expected, games, winRate: wins / games };
}

/** A team as five role slots (top, jungle, mid, adc, support); 0 = empty. */
export type Team = number[];

export interface PairNote {
  champ: number;
  role: number;
  /** percentage points */
  points: number;
  games: number;
  winRate: number | null;
}

export interface Suggestion {
  champ: number;
  role: number;
  /** total, in percentage points of win chance */
  points: number;
  rating: number;
  base: { points: number; games: number; winRate: number };
  counters: PairNote[];
  synergies: PairNote[];
  /** expected lane downside against the field; only set when the enemy laner is unknown */
  blind: number | null;
  pickRate: number;
}

const MIN_ROLE_GAMES = 8;
const MIN_ROLE_SHARE = 0.002;

/** Champions that are really played in a role (enough games to say anything). */
export function roleCandidates(index: DraftIndex, role: number): number[] {
  const out: number[] = [];
  for (const [id, roles] of index.champs) {
    const g = roles[role][0];
    if (g >= MIN_ROLE_GAMES && g / (2 * Math.max(1, index.matches)) >= MIN_ROLE_SHARE) out.push(id);
  }
  return out;
}

/**
 * Average lane downside against the popular opponents of a role (negative or 0).
 * Used to prefer safe picks while the enemy laner is still hidden.
 */
function blindDownside(index: DraftIndex, champ: number, role: number, risk: Risk): number {
  let total = 0;
  let weight = 0;
  for (const opp of roleCandidates(index, role)) {
    if (opp === champ) continue;
    const share = pickRate(index, opp, role);
    weight += share;
    total += share * Math.min(0, matchup(index, champ, role, opp, role, risk).delta);
  }
  return weight > 0 ? total / weight : 0;
}

export interface SuggestOptions {
  risk: Risk;
  /** champions that cannot be picked (already picked or banned) */
  unavailable: Set<number>;
  /** when set, only these champions are considered */
  pool?: Set<number> | null;
  limit?: number;
}

/** Rank champions for an open slot of `ally` given what both teams have so far. */
export function suggestPicks(index: DraftIndex, ally: Team, enemy: Team, role: number, opts: SuggestOptions): Suggestion[] {
  const { risk, unavailable, pool } = opts;
  const laneKnown = enemy[role] > 0;
  const out: Suggestion[] = [];
  for (const champ of roleCandidates(index, role)) {
    if (unavailable.has(champ)) continue;
    if (pool && !pool.has(champ)) continue;
    const [g, w] = roleGames(index, champ, role);
    const baseRating = champRating(index, champ, role, risk);
    let rating = baseRating;
    const counters: PairNote[] = [];
    const synergies: PairNote[] = [];
    for (let r = 0; r < ROLE_COUNT; r++) {
      if (enemy[r] > 0) {
        const m = matchup(index, champ, role, enemy[r], r, risk);
        rating += m.delta;
        if (m.games > 0) counters.push({ champ: enemy[r], role: r, points: toPoints(m.delta), games: m.games, winRate: m.winRate });
      }
      if (r !== role && ally[r] > 0) {
        const d = duo(index, champ, role, ally[r], r, risk);
        rating += d.delta;
        if (d.games > 0) synergies.push({ champ: ally[r], role: r, points: toPoints(d.delta), games: d.games, winRate: d.winRate });
      }
    }
    let blind: number | null = null;
    if (!laneKnown) {
      const down = blindDownside(index, champ, role, risk);
      rating += down;
      blind = toPoints(down);
    }
    out.push({
      champ,
      role,
      rating,
      points: toPoints(rating),
      base: { points: toPoints(baseRating), games: g, winRate: g > 0 ? w / g : 0 },
      counters,
      synergies,
      blind,
      pickRate: pickRate(index, champ, role),
    });
  }
  out.sort((a, b) => b.rating - a.rating);
  return opts.limit ? out.slice(0, opts.limit) : out;
}

export interface BanSuggestion extends Suggestion {
  /** threat weighted by how often the champion is actually picked */
  priority: number;
}

/**
 * Bans: the picks that would hurt us most in the enemy's open roles, weighted
 * by how often they are played (banning a champion nobody picks wastes the ban).
 */
export function suggestBans(index: DraftIndex, ally: Team, enemy: Team, opts: SuggestOptions): BanSuggestion[] {
  const best = new Map<number, BanSuggestion>();
  for (let role = 0; role < ROLE_COUNT; role++) {
    if (enemy[role] > 0) continue;
    for (const s of suggestPicks(index, enemy, ally, role, { ...opts, pool: null, limit: undefined })) {
      // Popularity saturates: a 10% pick rate matters much more than 1%, 25% barely more than 15%.
      const popularity = 1 - Math.exp(-s.pickRate / 0.06);
      const priority = (s.points + 6) * popularity;
      const prev = best.get(s.champ);
      if (!prev || priority > prev.priority) best.set(s.champ, { ...s, priority });
    }
  }
  return [...best.values()].sort((a, b) => b.priority - a.priority).slice(0, opts.limit ?? 8);
}

/** Win chance of `ally` (0..1) from everything known about both drafts. */
export function winChance(index: DraftIndex, ally: Team, enemy: Team, risk: Risk): number {
  let rating = 0;
  for (let r = 0; r < ROLE_COUNT; r++) {
    if (ally[r] > 0) rating += champRating(index, ally[r], r, risk);
    if (enemy[r] > 0) rating -= champRating(index, enemy[r], r, risk);
    for (let r2 = r + 1; r2 < ROLE_COUNT; r2++) {
      if (ally[r] > 0 && ally[r2] > 0) rating += duo(index, ally[r], r, ally[r2], r2, risk).delta;
      if (enemy[r] > 0 && enemy[r2] > 0) rating -= duo(index, enemy[r], r, enemy[r2], r2, risk).delta;
    }
    for (let r2 = 0; r2 < ROLE_COUNT; r2++) {
      if (ally[r] > 0 && enemy[r2] > 0) rating += matchup(index, ally[r], r, enemy[r2], r2, risk).delta;
    }
  }
  return toWinRate(rating);
}

/**
 * Put champions with unknown roles into the most plausible role slots
 * (maximises how often each champion is played in its assigned role).
 * `fixed` keeps champions that already have a role where they are.
 */
export function assignRoles(index: DraftIndex, champs: number[], fixed: Team = [0, 0, 0, 0, 0]): Team {
  const team = [...fixed];
  const free = champs.filter((c) => c > 0 && !team.includes(c)).slice(0, ROLE_COUNT);
  const open = team.map((c, i) => (c > 0 ? -1 : i)).filter((i) => i >= 0);
  let bestScore = -Infinity;
  let best: number[] = [];
  const used = new Array(open.length).fill(false);
  const current: number[] = [];
  const walk = (i: number, score: number) => {
    if (i === free.length) {
      if (score > bestScore) {
        bestScore = score;
        best = [...current];
      }
      return;
    }
    for (let s = 0; s < open.length; s++) {
      if (used[s]) continue;
      used[s] = true;
      current.push(open[s]);
      walk(i + 1, score + Math.log(roleGames(index, free[i], open[s])[0] + 0.5));
      current.pop();
      used[s] = false;
    }
  };
  walk(0, 0);
  free.forEach((c, i) => {
    if (best[i] != null) team[best[i]] = c;
  });
  return team;
}

// ── Composition analysis ────────────────────────────────────────────────────
export interface CompAnalysis {
  picks: number;
  /** physical share of the team's damage, 0..1 */
  ad: number;
  ap: number;
  /** averages on Riot's 1–3 playstyle scale */
  cc: number;
  durability: number;
  mobility: number;
  ranged: number;
  frontline: number;
  warnings: StringKey[];
}

export function analyzeComp(team: Team, champions: Record<string, StaticChampion>): CompAnalysis {
  let ad = 0;
  let ap = 0;
  let cc = 0;
  let durability = 0;
  let mobility = 0;
  let ranged = 0;
  let frontline = 0;
  let picks = 0;
  team.forEach((id, role) => {
    const c = id > 0 ? champions[id] : null;
    if (!c) return;
    picks++;
    const style = c.style ?? { damage: 2, durability: 2, cc: 2, mobility: 2, utility: 2 };
    // Supports contribute little of a team's damage regardless of their kit.
    const dmg = style.damage * (role === 4 ? 0.5 : 1);
    if (c.dmg === "ad") ad += dmg;
    else if (c.dmg === "ap") ap += dmg;
    else {
      ad += dmg / 2;
      ap += dmg / 2;
    }
    cc += style.cc;
    durability += style.durability;
    mobility += style.mobility;
    if (c.ranged) ranged++;
    if (style.durability >= 3 || c.tags[0] === "Tank") frontline++;
  });
  const total = ad + ap;
  const warnings: StringKey[] = [];
  if (picks >= 4) {
    if (total > 0 && ad / total >= 0.8) warnings.push("draft.comp.warn.fullAd");
    if (total > 0 && ap / total >= 0.8) warnings.push("draft.comp.warn.fullAp");
    if (frontline === 0) warnings.push("draft.comp.warn.noFrontline");
    if (cc / picks < 1.5) warnings.push("draft.comp.warn.lowCc");
    if (ranged === 0) warnings.push("draft.comp.warn.noRanged");
  }
  return {
    picks,
    ad: total > 0 ? ad / total : 0.5,
    ap: total > 0 ? ap / total : 0.5,
    cc: picks ? cc / picks : 0,
    durability: picks ? durability / picks : 0,
    mobility: picks ? mobility / picks : 0,
    ranged,
    frontline,
    warnings,
  };
}

/** S/A/B/C/D from strength (percentage points) and how often the champion is picked. */
export function tierOf(points: number, pickRatePct: number): "S" | "A" | "B" | "C" | "D" {
  const score = points + Math.min(3, pickRatePct / 4);
  if (score >= 3.5) return "S";
  if (score >= 1.5) return "A";
  if (score >= 0) return "B";
  if (score >= -1.5) return "C";
  return "D";
}
