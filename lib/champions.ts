import { ROLES, type MetaFile, type Role, type StaticChampion } from "./types";

/** Lower-case, accent-free text for forgiving search ("kaisa" finds "Kai'Sa", "sivir" finds "Sivir"). */
export function normalize(s: string): string {
  return s
    .toLocaleLowerCase("en-US")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]/g, "");
}

export function matchesQuery(c: StaticChampion, query: string): boolean {
  const q = normalize(query);
  return !q || normalize(c.name).includes(q) || normalize(c.key).includes(q);
}

/** Total games of a champion across roles in the statistics window. */
export function totalGames(meta: MetaFile | undefined, id: number): number {
  const roles = meta?.champions[id]?.roles ?? {};
  return ROLES.reduce((s, r) => s + (roles[r]?.[0] ?? 0), 0);
}

/** Roles a champion is really played in (at least 15% of its games), most played first. */
export function playedRoles(meta: MetaFile | undefined, id: number): Role[] {
  const roles = meta?.champions[id]?.roles ?? {};
  const total = totalGames(meta, id);
  if (total === 0) return [];
  return ROLES.filter((r) => (roles[r]?.[0] ?? 0) / total >= 0.15).sort((a, b) => (roles[b]?.[0] ?? 0) - (roles[a]?.[0] ?? 0));
}

export function sortedChampions(champions: Record<string, StaticChampion>, locale: string): StaticChampion[] {
  return Object.values(champions).sort((a, b) => a.name.localeCompare(b.name, locale));
}
