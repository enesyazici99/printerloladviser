"use client";

import { useMemo } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { useChampionFile } from "@/lib/data";
import { adaptiveBuild } from "@/lib/draft/build";
import { pct } from "@/lib/format";
import { ROLES } from "@/lib/types";
import { useDraft } from "@/stores/draft";
import { ChampionIcon, ItemIcon, RuneIcon, SpellIcon, Spinner } from "@/components/ui/icons";
import { RunePage, SkillGrid } from "@/components/matches/MatchDetail";
import { SkillPriority } from "@/components/builds/SummaryBar";
import { MatchList } from "@/components/matches/MatchList";

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="panel-title mb-2">{title}</h3>
      {children}
    </section>
  );
}

/** Items, runes and spells for the user's champion, weighted towards pro games that look like this draft. */
export function BuildPanel({ currentPatch }: { currentPatch: string }) {
  const { t, data } = useI18n();
  const ally = useDraft((s) => s.ally);
  const enemy = useDraft((s) => s.enemy);
  const myRole = useDraft((s) => s.myRole);
  const champId = ally[myRole];
  const champ = champId ? data?.champions[champId] : null;
  const { data: file, isLoading } = useChampionFile(champ?.key);

  const build = useMemo(() => {
    if (!file || !data || !champId) return null;
    return adaptiveBuild(
      file.matches,
      {
        role: ROLES[myRole],
        laneOpponent: enemy[myRole],
        enemies: enemy.filter(Boolean),
        allies: ally.filter((c, i) => c > 0 && i !== myRole),
        currentPatch,
      },
      data.champions,
      data.items
    );
  }, [file, data, champId, myRole, enemy, ally, currentPatch]);

  if (!champId || !champ) {
    return (
      <div className="panel px-4 py-8 text-center text-sm text-fg-muted" data-testid="build-panel-empty">
        {t("draft.build.pickFirst")}
      </div>
    );
  }
  if (isLoading || !file) return <Spinner label={t("common.loading")} />;
  if (!build || build.summary.games === 0) {
    return (
      <div className="panel px-4 py-8 text-center text-sm text-fg-muted" data-testid="build-panel-empty">
        {t("draft.build.noRows")}
      </div>
    );
  }
  const s = build.summary;

  return (
    <div className="space-y-3" data-testid="build-panel" data-champion={champId}>
      <div className="panel p-3">
        <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-border pb-3">
          <ChampionIcon id={champId} size={44} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-fg">
              {champ.name} — {t("draft.build")}
            </h2>
            <p className="text-xs text-fg-muted" data-testid="build-basis">
              {t("draft.build.basis", { n: build.games, m: build.laneGames })}
            </p>
          </div>
          <div className="text-right">
            <div className={clsx("tabular text-lg font-bold", s.winRate >= 0.5 ? "text-win" : "text-loss")}>{pct(s.winRate)}</div>
            <div className="text-[11px] text-fg-muted">{t("common.winRate")}</div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="space-y-4">
            {s.runePage && (
              <Block title={t("detail.runePage")}>
                <RunePage r={s.runePage.r} sh={s.runePage.sh} compact />
                <div className="mt-2 flex flex-wrap gap-3">
                  {s.runes.slice(0, 3).map((r) => (
                    <span key={`${r.value.keystone}.${r.value.sub}`} className="flex items-center gap-1 text-[11px] text-fg-secondary">
                      <RuneIcon id={r.value.keystone} size={18} />
                      <RuneIcon id={r.value.sub} size={12} />
                      <span className="tabular">{pct(r.pct)}</span>
                    </span>
                  ))}
                </div>
              </Block>
            )}
            <Block title={t("champ.summary.spells")}>
              <div className="flex flex-wrap gap-4">
                {s.spells.slice(0, 2).map((sp) => (
                  <span key={sp.value.join(".")} className="flex items-center gap-1.5">
                    <SpellIcon id={sp.value[0]} size={26} />
                    <SpellIcon id={sp.value[1]} size={26} />
                    <span className="tabular text-[11px] text-fg-secondary">{pct(sp.pct)}</span>
                  </span>
                ))}
              </div>
            </Block>
          </div>

          <div className="min-w-0 space-y-4">
            {s.starters[0] && (
              <Block title={t("draft.build.starter")}>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {s.starters.slice(0, 2).map((st) => (
                    <span key={st.value.join(".")} className="flex items-center gap-1.5">
                      {st.value.map((id, i) => (
                        <ItemIcon key={i} id={id} size={30} />
                      ))}
                      <span className="tabular text-[11px] text-fg-secondary">{pct(st.pct)}</span>
                    </span>
                  ))}
                </div>
              </Block>
            )}

            <Block title={t("draft.build.order")}>
              <div className="flex flex-wrap items-start gap-x-2 gap-y-3" data-testid="build-order">
                {s.boots[0] && (
                  <div className="flex flex-col items-center gap-1 rounded-md bg-surface-tertiary/60 p-1.5">
                    <span className="text-[10px] text-fg-muted">{t("champ.summary.boots")}</span>
                    {s.boots.slice(0, 2).map((b, i) => (
                      <span key={b.value} className="flex items-center gap-1">
                        <ItemIcon id={b.value} size={i === 0 ? 34 : 24} />
                        <span className="tabular w-8 text-[10px] text-fg-muted">{pct(b.pct)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {s.slots.slice(0, 5).map((slot, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 rounded-md bg-surface-tertiary/60 p-1.5">
                    <span className="text-[10px] text-fg-muted">{i + 1}.</span>
                    {slot.slice(0, 3).map((it, j) => (
                      <span key={it.value} className="flex items-center gap-1">
                        <ItemIcon id={it.value} size={j === 0 ? 34 : 24} />
                        <span className="tabular w-8 text-[10px] text-fg-muted">{pct(it.pct)}</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </Block>

            {build.lifted.length > 0 && (
              <Block title={t("draft.build.lift")}>
                <div className="flex flex-wrap gap-3" data-testid="build-lifted">
                  {build.lifted.map((x) => (
                    <span key={x.id} className="flex items-center gap-1.5 text-[11px]">
                      <ItemIcon id={x.id} size={30} />
                      <span className="tabular leading-tight">
                        <span className="font-semibold text-win">{pct(x.pct)}</span>
                        <br />
                        <span className="text-fg-muted">↑ {pct(x.basePct)}</span>
                      </span>
                    </span>
                  ))}
                </div>
              </Block>
            )}

            {s.skillPriority[0] && (
              <Block title={t("detail.skillOrder")}>
                <div className="mb-2 flex items-center gap-3">
                  <SkillPriority priority={s.skillPriority[0].value} championId={champId} />
                  <span className="tabular text-[11px] text-fg-secondary">{pct(s.skillPriority[0].pct)}</span>
                </div>
                <SkillGrid order={s.skillOrder} championId={champId} />
              </Block>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="panel-title mb-2 px-1">{t("draft.build.similar")}</h3>
        <MatchList rows={build.similar} championId={champId} />
      </div>
    </div>
  );
}
