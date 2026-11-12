"use client";

import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import type { BuildSummary } from "@/lib/builds";
import { spellIcon } from "@/lib/data";
import { pct } from "@/lib/format";
import { ItemIcon, RoleIcon, RuneIcon, SpellIcon } from "@/components/ui/icons";

function Card({ title, children, className, testId }: { title: string; children: React.ReactNode; className?: string; testId?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2 px-3 py-3", className)} data-testid={testId}>
      <h3 className="panel-title">{title}</h3>
      {children}
    </div>
  );
}

const Pct = ({ value }: { value: number }) => <span className="tabular text-[11px] font-medium text-fg-secondary">{pct(value)}</span>;

/** "Q > W > E" with the champion's ability icons. */
export function SkillPriority({ priority, championId }: { priority: string; championId: number }) {
  const { data } = useI18n();
  const champ = data?.champions[championId];
  const idx: Record<string, number> = { Q: 0, W: 1, E: 2, R: 3 };
  return (
    <div className="flex items-center gap-1.5">
      {priority.split(">").map((k, i) => (
        <div key={k} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-fg-muted">›</span>}
          <div className="relative">
            {champ && data ? (
              <img src={spellIcon(data.version, champ.spells[idx[k]].img)} alt={champ.spells[idx[k]].name} title={`${k} — ${champ.spells[idx[k]].name}`} width={30} height={30} loading="lazy" className="h-[30px] w-[30px] rounded" />
            ) : (
              <span className="inline-block h-[30px] w-[30px] rounded bg-surface-tertiary" />
            )}
            <span className="absolute -bottom-1 -right-1 rounded bg-surface px-1 text-[10px] font-bold text-fg">{k}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The seven-part summary strip of the champion page. */
export function SummaryBar({ s, championId }: { s: BuildSummary; championId: number }) {
  const { t, roleName } = useI18n();
  const wr = s.winRate;
  return (
    <div className="panel grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto_auto] lg:divide-x" data-testid="summary-bar">
      <Card title={t("common.winRate")} testId="summary-winrate">
        <div className={clsx("text-2xl font-bold tabular", wr >= 0.5 ? "text-win" : "text-loss")}>{pct(wr)}</div>
        <div className="text-[11px] text-fg-muted">
          {s.games} {t("common.games")}
        </div>
      </Card>

      <Card title={t("champ.summary.roles")} testId="summary-roles">
        <div className="space-y-1">
          {s.roles.slice(0, 2).map((r) => (
            <div key={r.value} className="flex items-center gap-1.5 text-sm text-fg" title={roleName(r.value)}>
              <RoleIcon role={r.value} size={16} className="text-fg-secondary" />
              <Pct value={r.pct} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("champ.summary.runes")} testId="summary-runes">
        <div className="flex gap-3">
          {s.runes.slice(0, 2).map((r) => (
            <div key={`${r.value.keystone}.${r.value.sub}`} className="flex flex-col items-center gap-1">
              <div className="flex items-center">
                <RuneIcon id={r.value.keystone} size={34} />
                <RuneIcon id={r.value.sub} size={18} className="-ml-2 mt-4 rounded-full bg-surface p-[1px]" />
              </div>
              <Pct value={r.pct} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("champ.summary.boots")} testId="summary-boots">
        <div className="flex gap-2">
          {s.boots.slice(0, 3).map((b) => (
            <div key={b.value} className="flex flex-col items-center gap-1">
              <ItemIcon id={b.value} size={32} />
              <Pct value={b.pct} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("champ.summary.items")} className="col-span-2 sm:col-span-3 lg:col-span-1" testId="summary-items">
        <div className="flex flex-wrap gap-2">
          {s.items.slice(0, 7).map((it) => (
            <div key={it.value} className="flex flex-col items-center gap-1">
              <ItemIcon id={it.value} size={32} />
              <Pct value={it.pct} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("champ.summary.spells")} testId="summary-spells">
        <div className="space-y-1">
          {s.spells.slice(0, 2).map((sp) => (
            <div key={sp.value.join(".")} className="flex items-center gap-1.5">
              <SpellIcon id={sp.value[0]} size={24} />
              <SpellIcon id={sp.value[1]} size={24} />
              <Pct value={sp.pct} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("champ.summary.skills")} testId="summary-skills">
        {s.skillPriority[0] ? (
          <div className="space-y-1">
            <SkillPriority priority={s.skillPriority[0].value} championId={championId} />
            <Pct value={s.skillPriority[0].pct} />
          </div>
        ) : (
          <span className="text-sm text-fg-muted">—</span>
        )}
      </Card>
    </div>
  );
}

/** Starting items and the most common first three completed items. */
export function BuildPaths({ s }: { s: BuildSummary }) {
  const { t } = useI18n();
  if (s.starters.length === 0 && s.corePaths.length === 0) return null;
  return (
    <div className="panel grid divide-border md:grid-cols-[auto_minmax(0,1fr)] md:divide-x" data-testid="build-paths">
      <Card title={t("champ.summary.start")}>
        <div className="space-y-2">
          {s.starters.slice(0, 2).map((st) => (
            <div key={st.value.join(".")} className="flex items-center gap-1.5">
              {st.value.map((id, i) => (
                <ItemIcon key={i} id={id} size={28} />
              ))}
              <Pct value={st.pct} />
            </div>
          ))}
        </div>
      </Card>
      <Card title={t("champ.summary.core")}>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {s.corePaths.slice(0, 3).map((p) => (
            <div key={p.value.join(".")} className="flex items-center gap-1.5">
              {p.value.map((id, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-fg-muted">→</span>}
                  <ItemIcon id={id} size={32} />
                </span>
              ))}
              <div className="ml-1 leading-tight">
                <div>
                  <Pct value={p.pct} />
                </div>
                <div className={clsx("tabular text-[11px]", p.wr >= 0.5 ? "text-win" : "text-loss")}>
                  {pct(p.wr)} {t("common.winRate").toLowerCase()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
