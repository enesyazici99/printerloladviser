"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { itemPathGroups, skillPriority } from "@/lib/builds";
import { spellIcon } from "@/lib/data";
import { duration } from "@/lib/format";
import { ROLES, type MatchRow, type RuneStyle, type StaticRune } from "@/lib/types";
import { ChampionIcon, ItemIcon, RoleIcon, RuneIcon, ShardIcon } from "@/components/ui/icons";

/** A titled block of the expanded row. */
function Card({ title, aside, children, className, testId }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <section className={clsx("rounded-lg border border-border bg-surface-secondary/80 p-3", className)} data-testid={testId}>
      <header className="mb-2.5 flex items-center justify-between gap-3">
        <h4 className="panel-title">{title}</h4>
        {aside}
      </header>
      {children}
    </section>
  );
}

/**
 * One row of a rune tree. Every rune sits in a cell of the same size, so rows
 * line up as a grid; the chosen rune is large, in full colour and ringed, the
 * alternatives are small and faded.
 */
function RuneRow({ runes, chosen, cell, keystone }: { runes: StaticRune[]; chosen: Set<number>; cell: number; keystone?: boolean }) {
  const on = Math.round(cell * (keystone ? 0.92 : 0.8));
  const off = Math.round(cell * 0.58);
  return (
    <div className="flex items-center justify-around" style={{ height: cell }}>
      {runes.map((rune) => {
        const picked = chosen.has(rune.id);
        return (
          <span key={rune.id} data-selected={picked ? "1" : undefined} className="flex items-center justify-center" style={{ width: cell, height: cell }}>
            {picked ? (
              <span className="rounded-full bg-black/50 ring-2 ring-gold shadow-[0_0_10px_rgb(var(--gold)/0.35)]">
                <RuneIcon id={rune.id} size={on} className="block" />
              </span>
            ) : (
              <RuneIcon id={rune.id} size={off} className="opacity-30 grayscale" />
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The three rows of stat shards in the order the client shows them (offense, flex, defense). */
const SHARD_ROWS = [
  [5008, 5005, 5007],
  [5008, 5010, 5001],
  [5011, 5013, 5001],
];

function Shards({ chosen, size }: { chosen: number[]; size: number }) {
  return (
    <div className="space-y-1 border-t border-border pt-2">
      {SHARD_ROWS.map((row, i) => {
        // An unknown shard (new patch) is still shown, on its own.
        const options = row.includes(chosen[i]) ? row : [chosen[i]];
        return (
          <div key={i} className="flex items-center justify-around">
            {options.map((id) =>
              id === chosen[i] ? (
                <span key={id} className="rounded-full ring-2 ring-gold" data-shard-selected="1">
                  <ShardIcon id={id} size={size} />
                </span>
              ) : (
                <span key={id} className="opacity-35 grayscale">
                  <ShardIcon id={id} size={size} />
                </span>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function RuneTree({ style, subtitle, children }: { style: RuneStyle; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      {/* Fixed height keeps the rows of the two trees on the same lines. */}
      <div className="mb-2 flex h-9 items-center gap-2 border-b border-border pb-2">
        <RuneIcon id={style.id} size={22} />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-xs font-semibold text-fg">{style.name}</div>
          {subtitle && <div className="truncate text-[10px] font-medium text-gold">{subtitle}</div>}
        </div>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** Full rune page: both trees with the chosen runes highlighted, plus the stat shards. */
export function RunePage({ r, sh, compact }: { r: number[]; sh: number[]; compact?: boolean }) {
  const { data } = useI18n();
  if (!data) return null;
  const primary = data.runes.find((s) => s.id === r[0]);
  const secondary = data.runes.find((s) => s.id === r[1]);
  const chosen = new Set(r.slice(2));
  const cell = compact ? 34 : 38;
  const keystone = primary?.slots[0].find((rune) => chosen.has(rune.id));
  // Secondary runes are picked from two of the three rows; name them for the header.
  const secondaryNames = secondary?.slots
    .slice(1)
    .flat()
    .filter((rune) => chosen.has(rune.id))
    .map((rune) => rune.name)
    .join(" · ");
  return (
    <div className={clsx("flex gap-3", compact ? "w-[310px]" : "w-[340px]", "max-w-full")} data-testid="rune-page">
      {primary && (
        <RuneTree style={primary} subtitle={keystone?.name}>
          {primary.slots.map((slot, i) => (
            <RuneRow key={i} runes={slot} chosen={chosen} cell={i === 0 ? cell + 6 : cell} keystone={i === 0} />
          ))}
        </RuneTree>
      )}
      <div className="w-px self-stretch bg-border" aria-hidden />
      {secondary && (
        <RuneTree style={secondary} subtitle={secondaryNames}>
          {secondary.slots.slice(1).map((slot, i) => (
            <RuneRow key={i} runes={slot} chosen={chosen} cell={cell} />
          ))}
          {sh.length === 3 && <Shards chosen={sh} size={compact ? 18 : 20} />}
        </RuneTree>
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
  const columns = { gridTemplateColumns: `44px repeat(${levels.length}, minmax(20px, 26px))` };
  return (
    <div className="overflow-x-auto" data-testid="skill-grid">
      <div className="inline-grid gap-[3px]" style={columns}>
        <span />
        {levels.map((_, i) => (
          <span key={i} className="text-center text-[10px] tabular text-fg-muted">
            {i + 1}
          </span>
        ))}
        {["Q", "W", "E", "R"].map((key, row) => (
          <div key={key} className="contents">
            <div className="flex h-6 items-center gap-1.5">
              {champ && data ? (
                <img src={spellIcon(data.version, champ.spells[row].img)} alt={champ.spells[row].name} title={`${key} — ${champ.spells[row].name}`} width={24} height={24} loading="lazy" className="h-6 w-6 rounded" />
              ) : (
                <span className="h-6 w-6 rounded bg-surface-tertiary" />
              )}
              <span className="text-[11px] font-bold text-fg-secondary">{key}</span>
            </div>
            {levels.map((s, i) => (
              <div
                key={i}
                className={clsx(
                  "flex h-6 items-center justify-center rounded text-[10px] font-bold tabular",
                  s === key ? (key === "R" ? "bg-gold text-black" : "bg-accent text-white") : "bg-surface-tertiary/70 text-transparent"
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

/** Purchases grouped by game minute. */
function ItemPath({ m }: { m: MatchRow }) {
  const { t } = useI18n();
  const groups = itemPathGroups(m);
  if (groups.length === 0) return <p className="text-xs text-fg-muted">{t("detail.noTimeline")}</p>;
  return (
    <ol className="flex flex-wrap gap-1.5" data-testid="item-path">
      {groups.map((g, gi) => (
        <li key={gi} className="rounded-md border border-border bg-surface/70 px-1.5 pb-1.5 pt-1">
          <span className="mb-1 block text-center text-[10px] font-medium tabular text-fg-muted">{g.minute === 0 ? t("detail.start") : t("detail.min", { n: g.minute })}</span>
          <div className="flex items-center gap-1">
            {g.events.map((e, ei) => (
              <span key={ei} className="relative" title={e.sold ? t("detail.sold") : undefined}>
                <ItemIcon id={e.id} size={28} dim={e.sold} />
                {e.count > 1 && <span className="absolute -bottom-1 -right-1 rounded bg-surface px-1 text-[9px] font-bold leading-tight text-fg ring-1 ring-border">×{e.count}</span>}
                {e.sold && <span className="pointer-events-none absolute left-0 top-1/2 h-0.5 w-full -rotate-45 bg-loss" aria-hidden />}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Finished items in the order they were completed, with the minute of completion. */
function CompletedItems({ m }: { m: MatchRow }) {
  const { t } = useI18n();
  const minuteOf = (id: number) => {
    for (let i = 0; i + 2 < m.ip.length; i += 3) if (m.ip[i] === id && m.ip[i + 2] === 1) return Math.floor(m.ip[i + 1] / 60);
    return null;
  };
  if (m.ci.length === 0) return <p className="text-xs text-fg-muted">—</p>;
  return (
    <ol className="flex flex-wrap items-start gap-y-2" data-testid="completed-items">
      {m.ci.map((id, i) => {
        const min = minuteOf(id);
        return (
          <li key={i} className="flex items-start">
            {i > 0 && <span className="mx-1.5 mt-5 h-px w-4 bg-border-secondary" aria-hidden />}
            <div className="flex flex-col items-center gap-1">
              <span className="relative">
                <ItemIcon id={id} size={40} />
                <span className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">{i + 1}</span>
              </span>
              <span className="text-[10px] tabular text-fg-muted">{min != null ? t("detail.min", { n: min }) : ""}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Teams({ m, championId }: { m: MatchRow; championId: number }) {
  const { t } = useI18n();
  if (!m.tm || !m.en) return null;
  const team = (ids: number[], label: string, win: boolean) => (
    <div className={clsx("rounded-lg border p-3", win ? "border-win/30 bg-win-bg" : "border-loss/30 bg-loss-bg")}>
      <div className={clsx("mb-2 text-xs font-semibold", win ? "text-win" : "text-loss")}>
        {label} · {win ? t("common.win") : t("common.loss")}
      </div>
      <div className="flex gap-2">
        {ids.map((id, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <ChampionIcon id={id} size={40} className={id === championId ? "ring-2 ring-gold" : undefined} />
            {m.ro === 1 && <RoleIcon role={ROLES[i]} size={12} className="text-fg-muted" />}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="teams">
      {team(m.tm, t("detail.allies"), m.w === 1)}
      {team(m.en, t("detail.enemies"), m.w === 0)}
    </div>
  );
}

export function MatchDetail({ m, championId, linkChampion }: { m: MatchRow; championId: number; linkChampion?: boolean }) {
  const { t, data } = useI18n();
  const [tab, setTab] = useState<"build" | "match">("build");
  const champ = data?.champions[championId];
  const priority = skillPriority(m.so);
  const stats: [string, string][] = [
    [t("detail.duration"), duration(m.d)],
    [t("row.kda"), `${m.k} / ${m.de} / ${m.a}`],
    [t("detail.cs"), `${m.cs} (${(m.cs / Math.max(1, m.d / 60)).toFixed(1)}/min)`],
    [t("detail.gold"), m.g.toLocaleString("en-US")],
    ...(m.kp != null ? ([[t("detail.kp"), `${m.kp}%`]] as [string, string][]) : []),
  ];
  return (
    <div className="bg-surface/70 px-3 py-3 sm:px-4" data-testid="match-detail">
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
          <Card title={t("detail.runePage")} className="self-start">
            <RunePage r={m.r} sh={m.sh} />
          </Card>
          <div className="min-w-0 space-y-3">
            <Card title={t("detail.completed")}>
              <CompletedItems m={m} />
            </Card>
            <Card title={t("detail.itemPath")}>
              <ItemPath m={m} />
            </Card>
            <Card title={t("detail.skillOrder")} aside={priority && <span className="text-[11px] font-semibold tracking-wide text-fg-secondary">{priority.split(">").join(" › ")}</span>}>
              <SkillGrid order={m.so} championId={championId} />
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-surface-secondary/80 px-3 py-2">
                <dt className="panel-title">{k}</dt>
                <dd className="mt-0.5 tabular text-sm font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <Teams m={m} championId={championId} />
        </div>
      )}
    </div>
  );
}
