// Pure aggregation over feed rows: everything the champion summary bar and the
// draft build panel show is computed here, so it can be unit-tested.
import type { MatchRow, Role, StaticItem } from "./types";

export interface WeightedRow {
  m: MatchRow;
  w: number;
}

export interface Share<T> {
  value: T;
  /** weighted number of games */
  n: number;
  /** share of all (weighted) games, 0..1 */
  pct: number;
  /** win rate of the games that used it, 0..1 */
  wr: number;
}

export interface RuneCombo {
  primary: number;
  keystone: number;
  sub: number;
}

export interface BuildSummary {
  games: number;
  weight: number;
  winRate: number;
  roles: Share<Role>[];
  runes: Share<RuneCombo>[];
  /** most common complete page for the top rune combo */
  runePage: { r: number[]; sh: number[] } | null;
  boots: Share<number>[];
  items: Share<number>[];
  spells: Share<[number, number]>[];
  skillPriority: Share<string>[];
  skillOrder: string;
  starters: Share<number[]>[];
  corePaths: Share<number[]>[];
  /** popularity of the 1st, 2nd, 3rd… completed item */
  slots: Share<number>[][];
}

type Items = Record<string, StaticItem>;

class Tally<T> {
  private map = new Map<string, { value: T; n: number; wins: number }>();
  add(key: string, value: T, w: number, win: number) {
    let e = this.map.get(key);
    if (!e) this.map.set(key, (e = { value, n: 0, wins: 0 }));
    e.n += w;
    e.wins += w * win;
  }
  shares(total: number, limit = Infinity): Share<T>[] {
    return [...this.map.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, limit)
      .map((e) => ({ value: e.value, n: e.n, pct: total > 0 ? e.n / total : 0, wr: e.n > 0 ? e.wins / e.n : 0 }));
  }
}

/** Tier-3 boots are counted as the tier-2 boot they upgrade from. */
export function baseBoot(id: number, items: Items): number {
  return items[id]?.base ?? id;
}

/** The boots a player ended the game with (0 = none). */
export function finalBoots(m: MatchRow, items: Items): number {
  for (const id of [...m.fb, m.rbi]) if (id && items[id]?.boots && (items[id].gold >= 700 || items[id].base)) return baseBoot(id, items);
  for (let i = m.ci.length - 1; i >= 0; i--) if (items[m.ci[i]]?.boots) return baseBoot(m.ci[i], items);
  return 0;
}

/** Completed items without boots, in purchase order. */
export function completedNonBoots(m: MatchRow, items: Items): number[] {
  return m.ci.filter((id) => !items[id]?.boots);
}

/** Items bought before minions spawn (trinkets excluded), sorted for stable grouping. */
export function starterItems(m: MatchRow, items: Items): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < m.ip.length; i += 3) {
    const [id, sec, type] = [m.ip[i], m.ip[i + 1], m.ip[i + 2]];
    if (sec > 60) break;
    if (type === 1 && !items[id]?.trinket) out.push(id);
    else if (type === 2) {
      const idx = out.lastIndexOf(id);
      if (idx >= 0) out.splice(idx, 1);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Order in which Q/W/E are maxed, e.g. "Q>E>W". Skills not maxed by the end of
 * the game are ordered by points spent. Returns null for very short sequences.
 */
export function skillPriority(order: string): string | null {
  if (order.length < 8) return null;
  const count: Record<string, number> = { Q: 0, W: 0, E: 0 };
  const first: Record<string, number> = { Q: 99, W: 99, E: 99 };
  const maxed: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (!(s in count)) continue;
    if (first[s] === 99) first[s] = i;
    if (++count[s] === 5) maxed.push(s);
  }
  const rest = ["Q", "W", "E"].filter((s) => !maxed.includes(s)).sort((a, b) => count[b] - count[a] || first[a] - first[b]);
  return [...maxed, ...rest].join(">");
}

/** A real, representative skill sequence: follow the most common prefix, then take the longest game. */
function representativeOrder(rows: WeightedRow[]): string {
  let candidates = rows.filter((r) => r.m.so.length >= 6);
  for (const len of [6, 9, 12, 15, 18]) {
    const tally = new Tally<string>();
    for (const r of candidates) if (r.m.so.length >= len) tally.add(r.m.so.slice(0, len), r.m.so.slice(0, len), r.w, r.m.w);
    const top = tally.shares(1, 1)[0];
    if (!top) break;
    candidates = candidates.filter((r) => r.m.so.startsWith(top.value));
  }
  let best = "";
  for (const r of candidates) if (r.m.so.length > best.length) best = r.m.so;
  return best.slice(0, 18);
}

export function summarize(rows: WeightedRow[], items: Items): BuildSummary {
  let weight = 0;
  let wins = 0;
  const roles = new Tally<Role>();
  const runes = new Tally<RuneCombo>();
  const boots = new Tally<number>();
  const popular = new Tally<number>();
  const spells = new Tally<[number, number]>();
  const priority = new Tally<string>();
  const starters = new Tally<number[]>();
  const core3 = new Tally<number[]>();
  const core2 = new Tally<number[]>();
  const slots: Tally<number>[] = [];
  let core3Weight = 0;
  let core2Weight = 0;
  let starterWeight = 0;
  let priorityWeight = 0;
  const slotWeight: number[] = [];

  for (const { m, w } of rows) {
    if (w <= 0) continue;
    weight += w;
    wins += w * m.w;
    if (m.role) roles.add(m.role, m.role, w, m.w);
    if (m.r.length >= 3 && m.r[0]) {
      runes.add(`${m.r[0]}.${m.r[2]}.${m.r[1]}`, { primary: m.r[0], keystone: m.r[2], sub: m.r[1] }, w, m.w);
    }
    const b = finalBoots(m, items);
    if (b) boots.add(String(b), b, w, m.w);
    const done = completedNonBoots(m, items);
    for (const id of new Set(done)) popular.add(String(id), id, w, m.w);
    done.forEach((id, i) => {
      (slots[i] ??= new Tally<number>()).add(String(id), id, w, m.w);
      slotWeight[i] = (slotWeight[i] ?? 0) + w;
    });
    if (done.length >= 3) {
      core3.add(done.slice(0, 3).join("."), done.slice(0, 3), w, m.w);
      core3Weight += w;
    }
    if (done.length >= 2) {
      core2.add(done.slice(0, 2).join("."), done.slice(0, 2), w, m.w);
      core2Weight += w;
    }
    if (m.sp.length === 2) {
      const pair = [...m.sp].sort((a, b) => a - b) as [number, number];
      spells.add(pair.join("."), pair, w, m.w);
    }
    const pr = skillPriority(m.so);
    if (pr) {
      priority.add(pr, pr, w, m.w);
      priorityWeight += w;
    }
    const st = starterItems(m, items);
    if (st.length) {
      starters.add(st.join("."), st, w, m.w);
      starterWeight += w;
    }
  }

  const runeShares = runes.shares(weight, 4);
  let runePage: BuildSummary["runePage"] = null;
  if (runeShares[0]) {
    const top = runeShares[0].value;
    const pages = new Tally<number[]>();
    const shards = new Tally<number[]>();
    for (const { m, w } of rows) {
      if (m.r[0] === top.primary && m.r[2] === top.keystone && m.r[1] === top.sub) {
        pages.add(m.r.join("."), m.r, w, m.w);
        if (m.sh.length) shards.add(m.sh.join("."), m.sh, w, m.w);
      }
    }
    const page = pages.shares(1, 1)[0];
    if (page) runePage = { r: page.value, sh: shards.shares(1, 1)[0]?.value ?? [] };
  }

  const priorityShares = priority.shares(priorityWeight, 3);
  const topPriority = priorityShares[0]?.value;
  const skillOrder = topPriority ? representativeOrder(rows.filter((r) => skillPriority(r.m.so) === topPriority)) : "";

  // Three-item paths need games that lasted long enough; fall back to two items for thin samples.
  const corePaths = core3Weight >= weight * 0.3 ? core3.shares(core3Weight, 4) : core2.shares(core2Weight, 4);

  return {
    games: rows.filter((r) => r.w > 0).length,
    weight,
    winRate: weight > 0 ? wins / weight : 0,
    roles: roles.shares(weight),
    runes: runeShares,
    runePage,
    boots: boots.shares(weight, 4),
    items: popular.shares(weight, 12),
    spells: spells.shares(weight, 3),
    skillPriority: priorityShares,
    skillOrder,
    starters: starters.shares(starterWeight, 3),
    corePaths,
    slots: slots.slice(0, 6).map((t, i) => t.shares(slotWeight[i], 4)),
  };
}

// ── Champion page filters ───────────────────────────────────────────────────
export interface FeedFilters {
  role: Role | null;
  server: string | null;
  players: "all" | "challenger" | "otp";
  opponent: number | null;
  winsOnly: boolean;
}

export const NO_FILTERS: FeedFilters = { role: null, server: null, players: "all", opponent: null, winsOnly: false };

export function filterRows(rows: MatchRow[], f: FeedFilters): MatchRow[] {
  return rows.filter(
    (m) =>
      (!f.role || m.role === f.role) &&
      (!f.server || m.reg === f.server) &&
      (f.players === "all" || (f.players === "otp" ? m.p.otp === 1 : m.p.tier === "C")) &&
      (!f.opponent || m.opp === f.opponent) &&
      (!f.winsOnly || m.w === 1)
  );
}

/** Item purchases grouped per game minute, as shown in the expanded "Item Path". */
export interface PathGroup {
  minute: number;
  events: { id: number; sold: boolean; count: number }[];
}

export function itemPathGroups(m: MatchRow): PathGroup[] {
  const groups: PathGroup[] = [];
  for (let i = 0; i + 2 < m.ip.length; i += 3) {
    const id = m.ip[i];
    const minute = Math.floor(m.ip[i + 1] / 60);
    const sold = m.ip[i + 2] === 2;
    let g = groups[groups.length - 1];
    if (!g || g.minute !== minute) groups.push((g = { minute, events: [] }));
    const same = g.events.find((e) => e.id === id && e.sold === sold);
    if (same) same.count++;
    else g.events.push({ id, sold, count: 1 });
  }
  return groups;
}
