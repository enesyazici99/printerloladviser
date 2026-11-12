"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { analyzeComp, winChance, type CompAnalysis, type DraftIndex } from "@/lib/draft/engine";
import { pct } from "@/lib/format";
import { useDraft } from "@/stores/draft";

export function WinChance({ index }: { index: DraftIndex }) {
  const { t } = useI18n();
  const ally = useDraft((s) => s.ally);
  const enemy = useDraft((s) => s.enemy);
  const risk = useDraft((s) => s.risk);
  const chance = useMemo(() => winChance(index, ally, enemy, risk), [index, ally, enemy, risk]);
  const picks = ally.filter(Boolean).length + enemy.filter(Boolean).length;
  if (picks === 0) return null;
  return (
    <div className="panel px-3 py-3" data-testid="win-chance">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="tabular text-lg font-bold text-win" data-testid="win-chance-ally">
          {pct(chance, 1)}
        </span>
        <span className="panel-title text-center">{t("draft.winChance")}</span>
        <span className="tabular text-lg font-bold text-loss">{pct(1 - chance, 1)}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-loss/70">
        <div className="bg-win transition-[width] duration-300" style={{ width: `${chance * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-fg-muted">{t("draft.winChance.note")}</p>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  // Riot's playstyle scale runs from 1 to 3.
  const fill = Math.max(0, Math.min(1, (value - 1) / 2));
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-24 shrink-0 text-fg-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-tertiary">
        <div className="h-full rounded-full bg-fg-secondary" style={{ width: `${fill * 100}%` }} />
      </div>
    </div>
  );
}

function CompCard({ title, comp, tone }: { title: string; comp: CompAnalysis; tone: "win" | "loss" }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5" data-testid={`comp-${tone === "win" ? "ally" : "enemy"}`}>
      <h3 className={clsx("panel-title", tone === "win" ? "text-win" : "text-loss")}>{title}</h3>
      {comp.picks === 0 ? (
        <p className="text-sm text-fg-muted">—</p>
      ) : (
        <>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-fg-muted">
              <span>
                {t("draft.comp.ad")} {pct(comp.ad)}
              </span>
              <span>{t("draft.comp.damage")}</span>
              <span>
                {t("draft.comp.ap")} {pct(comp.ap)}
              </span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-[#7c6cf0]">
              <div className="bg-[#e0894a]" style={{ width: `${comp.ad * 100}%` }} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Meter label={t("draft.comp.cc")} value={comp.cc} />
            <Meter label={t("draft.comp.durability")} value={comp.durability} />
            <Meter label={t("draft.comp.mobility")} value={comp.mobility} />
          </div>
          {comp.warnings.length > 0 && (
            <ul className="space-y-1">
              {comp.warnings.map((w) => (
                <li key={w} className="flex gap-1.5 text-[11px] leading-snug text-gold" data-testid="comp-warning">
                  <span aria-hidden>⚠</span>
                  {t(w)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function CompPanel() {
  const { t, data } = useI18n();
  const ally = useDraft((s) => s.ally);
  const enemy = useDraft((s) => s.enemy);
  const comps = useMemo(() => (data ? { ally: analyzeComp(ally, data.champions), enemy: analyzeComp(enemy, data.champions) } : null), [ally, enemy, data]);
  if (!comps) return null;
  return (
    <div className="panel grid gap-4 p-3 sm:grid-cols-2" data-testid="comp-panel">
      <CompCard title={`${t("draft.ally")} · ${t("draft.comp")}`} comp={comps.ally} tone="win" />
      <CompCard title={`${t("draft.enemy")} · ${t("draft.comp")}`} comp={comps.enemy} tone="loss" />
    </div>
  );
}
