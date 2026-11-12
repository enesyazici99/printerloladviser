"use client";

import { useState } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { kdaRatio, SERVER_LABEL, timeAgo } from "@/lib/format";
import type { MatchRow as Row } from "@/lib/types";
import { ChampionIcon, ItemIcon, RoleIcon, RuneIcon, SpellIcon } from "@/components/ui/icons";
import { MatchDetail } from "./MatchDetail";

/** Grid shared by the header and every row so columns line up. */
export const ROW_GRID =
  "grid items-center gap-x-3 gap-y-2 grid-cols-[minmax(0,1fr)_auto_auto] md:grid-cols-[64px_minmax(140px,1.1fr)_104px_96px_84px_minmax(240px,1.5fr)_20px]";

export function MatchListHeader({ showChampion }: { showChampion?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={clsx(ROW_GRID, "hidden border-b border-border px-3 py-2 md:grid")}>
      <span />
      <span className="panel-title">{t("row.player")}</span>
      <span className="panel-title">{showChampion ? t("meta.champion") : t("row.matchup")}</span>
      <span className="panel-title">{t("row.kda")}</span>
      <span className="panel-title">{t("row.runes")}</span>
      <span className="panel-title">{t("row.items")}</span>
      <span />
    </div>
  );
}

export function PlayerBadge({ m }: { m: Row }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-fg" title={`${m.p.n}#${m.p.tag}`}>
          {m.p.n}
        </span>
        {m.p.otp === 1 && (
          <span className="chip bg-gold/15 text-gold" title="One-trick">
            {t("row.otp")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-fg-muted">
        <span className={clsx("font-semibold", m.p.tier === "C" ? "text-gold" : "text-fg-secondary")}>{m.p.tier === "C" ? "Challenger" : "Grandmaster"}</span>
        <span className="tabular">{m.p.lp} LP</span>
        <span>· {SERVER_LABEL[m.reg] ?? m.reg.toUpperCase()}</span>
      </div>
    </div>
  );
}

export function MatchRow({ m, championId, showChampion }: { m: Row; championId: number; showChampion?: boolean }) {
  const { t, lang, data } = useI18n();
  const [open, setOpen] = useState(false);
  const win = m.w === 1;
  const items = m.fb.slice(0, 6);
  const trinket = m.fb[6];

  return (
    <div className={clsx("border-b border-border last:border-b-0", win ? "bg-win-bg" : "bg-loss-bg")} data-testid="match-row" data-win={win ? "1" : "0"}>
      <div className={clsx("relative", open && "border-b border-border/60")}>
        <span className={clsx("absolute inset-y-0 left-0 w-[3px]", win ? "bg-win" : "bg-loss")} aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${m.p.n} — ${win ? t("common.win") : t("common.loss")}`}
          className={clsx(ROW_GRID, "w-full px-3 py-2 text-left transition-colors hover:bg-white/[0.03]")}
        >
          <div className="hidden text-[11px] leading-tight text-fg-muted md:block">
            <div className={clsx("font-semibold", win ? "text-win" : "text-loss")}>{win ? t("common.win") : t("common.loss")}</div>
            <div suppressHydrationWarning>{timeAgo(m.t, lang)}</div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {m.role && <RoleIcon role={m.role} size={14} className="shrink-0 text-fg-muted" />}
            <PlayerBadge m={m} />
          </div>

          <div className="flex items-center gap-1.5">
            <ChampionIcon id={championId} size={showChampion ? 34 : 30} />
            {m.opp > 0 && (
              <>
                <span className="text-[10px] font-semibold uppercase text-fg-muted">{t("common.vs")}</span>
                <ChampionIcon id={m.opp} size={26} round className="opacity-90" />
              </>
            )}
          </div>

          <div className="tabular text-right md:text-left">
            <div className="text-sm font-semibold text-fg">
              {m.k} <span className="text-fg-muted">/</span> <span className="text-loss">{m.de}</span> <span className="text-fg-muted">/</span> {m.a}
            </div>
            <div className="text-[11px] text-fg-muted">{kdaRatio(m.k, m.de, m.a)} KDA</div>
          </div>

          <div className="hidden items-center gap-1.5 md:flex">
            <div className="flex items-center">
              <RuneIcon id={m.r[2]} size={28} />
              <RuneIcon id={m.r[1]} size={16} className="-ml-1.5 mt-3 rounded-full bg-surface p-[1px]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <SpellIcon id={m.sp[0]} size={17} />
              <SpellIcon id={m.sp[1]} size={17} />
            </div>
          </div>

          <div className="col-span-3 flex items-center gap-1 md:col-span-1">
            {items.map((id, i) => (
              <ItemIcon key={i} id={id} size={28} />
            ))}
            <span className="mx-0.5 h-5 w-px bg-border" />
            <ItemIcon id={trinket} size={24} className="rounded-full" />
            {m.rbi > 0 && data?.items[m.rbi] && <ItemIcon id={m.rbi} size={24} className="ring-1 ring-gold/50" />}
            <div className="ml-auto flex items-center gap-2 md:hidden">
              <span className="text-[11px] text-fg-muted" suppressHydrationWarning>
                {timeAgo(m.t, lang)}
              </span>
            </div>
          </div>

          <svg viewBox="0 0 20 20" className={clsx("hidden h-4 w-4 text-fg-muted transition-transform md:block", open && "rotate-180")} fill="currentColor" aria-hidden>
            <path d="M5.300 7.300a1 1 0 011.400 0L10 10.600l3.300-3.300a1 1 0 111.400 1.400l-4 4a1 1 0 01-1.400 0l-4-4a1 1 0 010-1.400z" />
          </svg>
        </button>
      </div>
      {open && <MatchDetail m={m} championId={championId} linkChampion={showChampion} />}
    </div>
  );
}
