"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Risk, Team } from "@/lib/draft/engine";
import type { BoardState } from "@/lib/draft/session";

export type Side = "ally" | "enemy";

const EMPTY: Team = [0, 0, 0, 0, 0];
export const MAX_BANS = 10;

interface DraftState {
  ally: Team;
  enemy: Team;
  /** champions a synced client shows as hovered / intended but not locked; never counted as picks */
  allyHover: Team;
  enemyHover: Team;
  bans: number[];
  /** role index of the user */
  myRole: number;
  risk: Risk;
  pool: number[];
  onlyPool: boolean;
  setPick: (side: Side, role: number, champ: number) => void;
  clearPick: (side: Side, role: number) => void;
  addBan: (champ: number) => void;
  removeBan: (champ: number) => void;
  setMyRole: (role: number) => void;
  setRisk: (risk: Risk) => void;
  togglePool: (champ: number) => void;
  setOnlyPool: (v: boolean) => void;
  applyBoard: (board: Partial<BoardState>) => void;
  reset: () => void;
}

/** A champion can be on the board only once: picking or banning it removes it elsewhere. */
function without(team: Team, champ: number): Team {
  return team.map((c) => (c === champ ? 0 : c));
}

export const useDraft = create<DraftState>()(
  persist(
    (set) => ({
      ally: EMPTY,
      enemy: EMPTY,
      allyHover: EMPTY,
      enemyHover: EMPTY,
      bans: [],
      myRole: 2,
      risk: "normal",
      pool: [],
      onlyPool: false,
      setPick: (side, role, champ) =>
        set((s) => {
          const ally = without(s.ally, champ);
          const enemy = without(s.enemy, champ);
          (side === "ally" ? ally : enemy)[role] = champ;
          // A slot that now holds a pick no longer shows a hover, and the champion is not hovered elsewhere.
          const allyHover = without(s.allyHover, champ);
          const enemyHover = without(s.enemyHover, champ);
          (side === "ally" ? allyHover : enemyHover)[role] = 0;
          return { ally, enemy, allyHover, enemyHover, bans: s.bans.filter((b) => b !== champ) };
        }),
      clearPick: (side, role) =>
        set((s) => {
          const team = [...s[side]];
          const hover = [...(side === "ally" ? s.allyHover : s.enemyHover)];
          team[role] = 0;
          hover[role] = 0;
          return side === "ally" ? { ally: team, allyHover: hover } : { enemy: team, enemyHover: hover };
        }),
      addBan: (champ) =>
        set((s) => (s.bans.includes(champ) || s.bans.length >= MAX_BANS ? s : { bans: [...s.bans, champ], ally: without(s.ally, champ), enemy: without(s.enemy, champ) })),
      removeBan: (champ) => set((s) => ({ bans: s.bans.filter((b) => b !== champ) })),
      setMyRole: (myRole) => set({ myRole }),
      setRisk: (risk) => set({ risk }),
      togglePool: (champ) => set((s) => ({ pool: s.pool.includes(champ) ? s.pool.filter((c) => c !== champ) : [...s.pool, champ] })),
      setOnlyPool: (onlyPool) => set({ onlyPool }),
      applyBoard: (board) =>
        set((s) => ({
          ally: board.ally ?? s.ally,
          enemy: board.enemy ?? s.enemy,
          allyHover: board.allyHover ?? EMPTY,
          enemyHover: board.enemyHover ?? EMPTY,
          bans: board.bans ?? s.bans,
          myRole: board.myRole ?? s.myRole,
        })),
      reset: () => set({ ally: EMPTY, enemy: EMPTY, allyHover: EMPTY, enemyHover: EMPTY, bans: [] }),
    }),
    {
      name: "lol-advisor-draft",
      // Only preferences survive a reload; the board itself lives in the URL.
      partialize: (s) => ({ myRole: s.myRole, risk: s.risk, pool: s.pool, onlyPool: s.onlyPool }),
      skipHydration: true,
    }
  )
);

// ── URL <-> board ───────────────────────────────────────────────────────────
const list = (ids: number[]) => ids.map((c) => (c > 0 ? c : "")).join(".");
const parseTeam = (raw: string | null): Team | undefined => {
  if (raw == null) return undefined;
  const ids = raw.split(".").map((x) => Number(x) || 0);
  return [0, 1, 2, 3, 4].map((i) => ids[i] ?? 0);
};

export function boardToQuery(s: Pick<DraftState, "ally" | "enemy" | "bans" | "myRole">): string {
  const q = new URLSearchParams();
  if (s.ally.some(Boolean)) q.set("a", list(s.ally));
  if (s.enemy.some(Boolean)) q.set("e", list(s.enemy));
  if (s.bans.length) q.set("b", s.bans.join("."));
  q.set("r", String(s.myRole));
  return q.toString();
}

/** Reads a shared draft link. `pick=<id>` (from a champion page) puts that champion in the user's role. */
export function boardFromQuery(search: string): Partial<BoardState> | null {
  const q = new URLSearchParams(search);
  if (![...q.keys()].some((k) => ["a", "e", "b", "r", "pick"].includes(k))) return null;
  const roleRaw = q.get("r");
  const myRole = roleRaw != null && /^[0-4]$/.test(roleRaw) ? Number(roleRaw) : undefined;
  const board: Partial<BoardState> = {
    ally: parseTeam(q.get("a")),
    enemy: parseTeam(q.get("e")),
    bans: q.get("b")
      ? q
          .get("b")!
          .split(".")
          .map(Number)
          .filter((x) => x > 0)
          .slice(0, MAX_BANS)
      : undefined,
  };
  if (myRole != null) board.myRole = myRole;
  const pick = Number(q.get("pick"));
  if (pick > 0) {
    const ally = board.ally ?? [0, 0, 0, 0, 0];
    ally[myRole ?? 2] = pick;
    board.ally = ally;
  }
  return board;
}
