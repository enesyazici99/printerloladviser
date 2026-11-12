"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { itemPathGroups } from "@/lib/builds";
import { spellIcon } from "@/lib/data";
import { duration } from "@/lib/format";
import { ROLES, type MatchRow } from "@/lib/types";
import { ChampionIcon, ItemIcon, RoleIcon, RuneIcon, ShardIcon } from "@/components/ui/icons";

/** Full rune page: both trees with the chosen runes highlighted, plus stat shards. */
export function RunePage({ r, sh, compact }: { r: number[]; sh: number[]; compact?: boolean }) {
  const { data } = useI18n();
  if (!data) return null;
  const primary = data.runes.find((s) => s.id === r[0]);
  const secondary = data.runes.find((s) => s.id === r[1]);
  const chosen = new Set(r.slice(2));
  const size = compact ? 24 : 28;
  return (
    <div className="flex flex-wrap items-start gap-5" data-testid="rune-page">
      {primary && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-secondary">
            <RuneIcon id={primary.id} size={16} /> {primary.name}
          </div>
          {primary.slots.map((slot, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {slot.map((rune) => (
                <RuneIcon key={rune.id} id={rune.id} size={i === 0 ? size + 8 : size} dim={!chosen.has(rune.id)} className={chosen.has(rune.id) ? "ring-1 ring-gold/70" : undefined} />
              ))}
            </div>
          ))}
        </div>
      )}
      {secondary && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg-secondary">
            <RuneIcon id={secondary.id} size={16} /> {secondary.name}
          </div>
          {secondary.slots.slice(1).map((slot, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {slot.map((rune) => (
                <RuneIcon key={rune.id} id={rune.id} size={size} dim={!chosen.has(rune.id)} className={chosen.has(rune.id) ? "ring-1 ring-gold/70" : undefined} />
              ))}
            </div>
          ))}
          {sh.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1">
              {sh.map((id, i) => (
                <ShardIcon key={i} id={id} size={compact ? 18 : 20} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Q/W/E/R grid over the levels of the game. */
export function SkillGrid({ order, championId }: { order: string; championId: number }) {
  const { data } = useI18n();
  const champ = data?.champions[championId];
  if (!order) return null;
  const levels = order.slice(0, 18).split("");
  return (
    <div className="overflow-x-auto" data-testid="skill-grid">
      <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `26px repeat(${levels.length}, 22px)` }}>
        {["Q", "W", "E", "R"].map((key, row) => (
          <div key={key} className="contents">
            <div className="relative h-[22px] w-[26px]">
              {champ && data ? (
                <img src={spellIcon(data.version, champ.spells[row].img)} alt={champ.spells[row].name} title={`${key} — ${champ.spells[row].name}`} width={22} height={22} loading="lazy" className="h-[22px] w-[22px] rounded" />
              ) : (
                <span className="text-xs font-bold text-fg-secondary">{key}</span>
              )}
            </div>
            {levels.map((s, i) => (
              <div
                key={i}
                className={clsx(
                  "flex h-[22px] w-[22px] items-center justify-center rounded text-[10px] font-bold tabular",
                  s === key ? (key === "R" ? "bg-gold text-black" : "bg-accent text-white") : "bg-surface-tertiary text-transparent"
                )}
              >
                {s === key ? i + 1 : "·"}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemPath({ m }: { m: MatchRow }) {
  const { t } = useI18n();
  const groups = itemPathGroups(m);
  if (groups.length === 0) return <p className="text-xs text-fg-muted">{t("detail.noTimeline")}</p>;
  return (
    <div className="flex flex-wrap items-end gap-x-1 gap-y-3" data-testid="item-path">
      {groups.map((g, gi) => (
        <div key={gi} className="flex items-end gap-1">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1 rounded-md bg-surface-tertiary/70 p-1">
              {g.events.map((e, ei) => (
                <span key={ei} className="relative" title={e.sold ? t("detail.sold") : undefined}>
                  <ItemIcon id={e.id} size={26} dim={e.sold} />
                  {e.count > 1 && <span className="absolute -bottom-1 -right-1 rounded bg-surface px-0.5 text-[9px] font-bold text-fg">{e.count}</span>}
                  {e.sold && <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-loss">×</span>}
                </span>
              ))}
            </div>
            <span className="text-[10px] tabular text-fg-muted">{g.minute === 0 ? t("detail.start") : t("detail.min", { n: g.minute })}</span>
          </div>
          {gi < groups.length - 1 && <span className="mb-6 text-fg-muted">›</span>}
        </div>
      ))}
    </div>
  );
}

function CompletedItems({ m }: { m: MatchRow }) {
  const minuteOf = (id: number) => {
    for (let i = 0; i + 2 < m.ip.length; i += 3) if (m.ip[i] === id && m.ip[i + 2] === 1) return Math.floor(m.ip[i + 1] / 60);
    return null;
  };
  const { t } = useI18n();
  if (m.ci.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="completed-items">
      {m.ci.map((id, i) => {
        const min = minuteOf(id);
        return (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <ItemIcon id={id} size={34} />
              <span className="text-[10px] tabular text-fg-muted">{min != null ? t("detail.min", { n: min }) : ""}</span>
            </div>
            {i < m.ci.length - 1 && <span className="mb-4 text-fg-muted">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function Teams({ m, championId }: { m: MatchRow; championId: number }) {
  const { t } = useI18n();
  if (!m.tm || !m.en) return null;
  const team = (ids: number[], label: string, win: boolean) => (
    <div>
      <div className={clsx("mb-1.5 text-xs font-semibold", win ? "text-win" : "text-loss")}>
        {label} · {win ? t("common.win") : t("common.loss")}
      </div>
      <div className="flex gap-2">
        {ids.map((id, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <ChampionIcon id={id} size={36} className={id === championId ? "ring-2 ring-gold" : undefined} />
            {m.ro === 1 && <RoleIcon role={ROLES[i]} size={12} className="text-fg-muted" />}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-4" data-testid="teams">
      {team(m.tm, t("detail.allies"), m.w === 1)}
      {team(m.en, t("detail.enemies"), m.w === 0)}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="panel-title mb-2">{title}</h4>
      {children}
    </section>
  );
}

export function MatchDetail({ m, championId, linkChampion }: { m: MatchRow; championId: number; linkChampion?: boolean }) {
  const { t, data } = useI18n();
  const [tab, setTab] = useState<"build" | "match">("build");
  const champ = data?.champions[championId];
  return (
    <div className="bg-surface/60 px-3 py-3 sm:px-4" data-testid="match-detail">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex gap-1" role="tablist">
          {(["build", "match"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("btn !py-1 !text-xs", tab === k && "btn-active")}>
              {t(k === "build" ? "detail.build" : "detail.match")}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-fg-muted">
          {t("common.patch")} {m.v} · {duration(m.d)}
        </span>
        {linkChampion && champ && (
          <Link href={`/champion/${champ.key}/`} className="ml-auto text-xs font-medium text-accent hover:underline">
            {champ.name} — {t("champ.proBuild")} →
          </Link>
        )}
      </div>

      {tab === "build" ? (
        <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
          <Section title={t("detail.runePage")}>
            <RunePage r={m.r} sh={m.sh} />
          </Section>
          <div className="min-w-0 space-y-5">
            <Section title={t("detail.completed")}>
              <CompletedItems m={m} />
            </Section>
            <Section title={t("detail.itemPath")}>
              <ItemPath m={m} />
            </Section>
            <Section title={t("detail.skillOrder")}>
              <SkillGrid order={m.so} championId={championId} />
            </Section>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {[
              [t("detail.duration"), duration(m.d)],
              [t("row.kda"), `${m.k} / ${m.de} / ${m.a}`],
              [t("detail.cs"), `${m.cs} (${(m.cs / Math.max(1, m.d / 60)).toFixed(1)}/min)`],
              [t("detail.gold"), m.g.toLocaleString("en-US")],
              ...(m.kp != null ? [[t("detail.kp"), `${m.kp}%`]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="panel-title">{k}</dt>
                <dd className="tabular font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <Teams m={m} championId={championId} />
        </div>
      )}
    </div>
  );
}
