"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { suggestBans, suggestPicks, tierOf, type DraftIndex, type PairNote, type Suggestion } from "@/lib/draft/engine";
import { pct, signed } from "@/lib/format";
import { ROLES } from "@/lib/types";
import { useDraft } from "@/stores/draft";
import { ChampionIcon, RoleIcon } from "@/components/ui/icons";

const TIER_STYLE: Record<string, string> = {
  S: "bg-gold/20 text-gold",
  A: "bg-win/20 text-win",
  B: "bg-white/10 text-fg-secondary",
  C: "bg-white/5 text-fg-muted",
  D: "bg-loss/15 text-loss",
};

export function TierBadge({ tier }: { tier: string }) {
  return <span className={clsx("chip w-5 justify-center font-bold", TIER_STYLE[tier])}>{tier}</span>;
}

function Points({ value, className }: { value: number; className?: string }) {
  return <span className={clsx("tabular font-semibold", value > 0.05 ? "text-win" : value < -0.05 ? "text-loss" : "text-fg-muted", className)}>{signed(value)}</span>;
}

function Notes({ label, notes }: { label: string; notes: PairNote[] }) {
  const { data, roleName } = useI18n();
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[10px] uppercase tracking-wide text-fg-muted">{label}</span>
      {notes.map((n) => (
        <span
          key={`${n.champ}.${n.role}`}
          className="flex items-center gap-1 text-[11px]"
          title={`${data?.champions[n.champ]?.name} (${roleName(ROLES[n.role])}) · ${n.games} · ${n.winRate != null ? pct(n.winRate) : ""}`}
        >
          <ChampionIcon id={n.champ} size={16} round />
          <Points value={n.points} />
        </span>
      ))}
    </div>
  );
}

function PickRow({ s, rank, onPick, inPool }: { s: Suggestion; rank: number; onPick: () => void; inPool: boolean }) {
  const { t, data } = useI18n();
  const tier = tierOf(s.base.points, s.pickRate * 100);
  return (
    <li className="flex items-start gap-2.5 border-b border-border px-3 py-2 last:border-b-0" data-testid="suggestion" data-champion={s.champ}>
      <span className="tabular mt-2 w-4 text-center text-xs text-fg-muted">{rank}</span>
      <ChampionIcon id={s.champ} size={40} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-fg">{data?.champions[s.champ]?.name}</span>
          <TierBadge tier={tier} />
          {inPool && (
            <span className="text-gold" title={t("draft.pool")}>
              ★
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
          <span>
            {t("draft.base")} <Points value={s.base.points} />
          </span>
          <span className="tabular">
            {pct(s.base.winRate)} · {s.base.games} {t("common.games")}
          </span>
          {s.blind != null && s.blind < -0.05 && (
            <span title={t("draft.blind")}>
              {t("draft.blindRisk")} <Points value={s.blind} />
            </span>
          )}
        </div>
        <Notes label={t("draft.counter")} notes={s.counters} />
        <Notes label={t("draft.synergy")} notes={s.synergies} />
      </div>
      <div className="flex flex-col items-end gap-1">
        <Points value={s.points} className="text-base" />
        <button type="button" className="btn !px-2 !py-0.5 !text-xs" onClick={onPick}>
          {t("draft.pick")}
        </button>
      </div>
    </li>
  );
}

export function Suggestions({ index }: { index: DraftIndex }) {
  const { t, data, roleName } = useI18n();
  const { ally, enemy, bans, myRole, risk, pool, onlyPool, setPick, addBan, setOnlyPool } = useDraft();
  const [tab, setTab] = useState<"picks" | "bans">("picks");
  const [roleOverride, setRoleOverride] = useState<number | null>(null);
  const role = roleOverride ?? myRole;

  const unavailable = useMemo(() => new Set([...ally, ...enemy, ...bans].filter(Boolean)), [ally, enemy, bans]);
  const poolSet = useMemo(() => new Set(pool), [pool]);
  const usePool = onlyPool && pool.length > 0;

  const picks = useMemo(() => suggestPicks(index, ally, enemy, role, { risk, unavailable, pool: usePool ? poolSet : null, limit: 15 }), [index, ally, enemy, role, risk, unavailable, usePool, poolSet]);
  const banList = useMemo(() => suggestBans(index, ally, enemy, { risk, unavailable, limit: 10 }), [index, ally, enemy, risk, unavailable]);

  return (
    <div className="panel overflow-hidden" data-testid="suggestions">
      <div className="flex border-b border-border" role="tablist">
        {(["picks", "bans"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={clsx("flex-1 px-3 py-2.5 text-sm font-semibold transition-colors", tab === k ? "border-b-2 border-accent text-fg" : "text-fg-muted hover:text-fg")}
            data-testid={`tab-${k}`}
          >
            {t(k === "picks" ? "draft.suggestions" : "draft.banSuggestions")}
          </button>
        ))}
      </div>

      {tab === "picks" ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <div className="flex gap-1" role="group" aria-label={t("draft.forRole")}>
              {ROLES.map((r, i) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleOverride(i === myRole ? null : i)}
                  aria-pressed={role === i}
                  aria-label={roleName(r)}
                  title={roleName(r)}
                  className={clsx("btn !px-2 !py-1", role === i && "btn-active")}
                  data-testid={`suggest-role-${r}`}
                >
                  <RoleIcon role={r} size={15} />
                </button>
              ))}
            </div>
            <label className={clsx("ml-auto flex items-center gap-1.5 text-xs", pool.length ? "cursor-pointer text-fg-secondary" : "text-fg-muted")} title={t("draft.pool.hint")}>
              <input type="checkbox" className="accent-accent" checked={usePool} disabled={pool.length === 0} onChange={(e) => setOnlyPool(e.target.checked)} data-testid="only-pool" />
              {t("draft.onlyPool")} ({pool.length})
            </label>
          </div>
          {enemy[role] === 0 && picks.length > 0 && <p className="border-b border-border bg-surface-tertiary/40 px-3 py-1.5 text-[11px] text-fg-muted">{t("draft.blind")}</p>}
          {picks.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-fg-muted">{t("draft.noSuggestions")}</p>
          ) : (
            <ol className="max-h-[720px] overflow-y-auto">
              {picks.map((s, i) => (
                <PickRow key={s.champ} s={s} rank={i + 1} inPool={poolSet.has(s.champ)} onPick={() => setPick("ally", role, s.champ)} />
              ))}
            </ol>
          )}
        </>
      ) : banList.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-fg-muted">{t("draft.noSuggestions")}</p>
      ) : (
        <ol className="max-h-[720px] overflow-y-auto">
          {banList.map((s, i) => (
            <li key={s.champ} className="flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-b-0" data-testid="ban-suggestion" data-champion={s.champ}>
              <span className="tabular w-4 text-center text-xs text-fg-muted">{i + 1}</span>
              <ChampionIcon id={s.champ} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <span className="truncate">{data?.champions[s.champ]?.name}</span>
                  <RoleIcon role={ROLES[s.role]} size={13} className="shrink-0 text-fg-muted" />
                </div>
                <div className="tabular text-[11px] text-fg-muted">
                  {t("common.pickRate")} {pct(s.pickRate, 1)} · {pct(s.base.winRate)} · {s.base.games} {t("common.games")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-fg-muted">{t("draft.threat")}</div>
                <Points value={s.points} />
              </div>
              <button type="button" className="btn !px-2 !py-0.5 !text-xs" onClick={() => addBan(s.champ)}>
                Ban
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-border px-3 py-2 text-[11px] leading-snug text-fg-muted">{t("draft.scoreHint")}</p>
    </div>
  );
}
