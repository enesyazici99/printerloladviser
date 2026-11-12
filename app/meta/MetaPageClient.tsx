"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { useMeta } from "@/lib/data";
import { tierOf, toPoints, toRating } from "@/lib/draft/engine";
import { pct, signed } from "@/lib/format";
import { ROLES, type Role } from "@/lib/types";
import { ChampionIcon, RoleIcon, Spinner } from "@/components/ui/icons";
import { TierBadge } from "@/components/draft/Suggestions";

type SortKey = "tier" | "pick" | "win" | "games";
const TIER_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 } as const;
const PRIOR = 300; // same prior as the draft engine's balanced setting
const MIN_GAMES = 8;

export function MetaPageClient() {
  const { t, data, error, roleName } = useI18n();
  const { data: meta, error: metaError } = useMeta();
  const [role, setRole] = useState<Role>("mid");
  const [sort, setSort] = useState<SortKey>("tier");

  const rows = useMemo(() => {
    if (!meta) return [];
    const list = Object.entries(meta.champions)
      .map(([id, c]) => {
        const [g, w] = c.roles[role] ?? [0, 0];
        const pick = meta.matches > 0 ? g / (2 * meta.matches) : 0;
        const points = toPoints(toRating((w + PRIOR * 0.5) / (g + PRIOR)));
        return { id: Number(id), g, w, pick, wr: g ? w / g : 0, points, tier: tierOf(points, pick * 100) };
      })
      .filter((r) => r.g >= MIN_GAMES && r.pick >= 0.002);
    const by: Record<SortKey, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      tier: (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.points + b.pick * 25 - (a.points + a.pick * 25),
      pick: (a, b) => b.pick - a.pick,
      win: (a, b) => b.points - a.points,
      games: (a, b) => b.g - a.g,
    };
    return list.sort(by[sort]);
  }, [meta, role, sort]);

  if (error || metaError) return <div className="panel px-4 py-10 text-center text-sm text-loss">{t("common.error")}</div>;
  if (!data || !meta) return <Spinner label={t("common.loading")} />;

  const th = (key: SortKey, label: string, className?: string) => (
    <th className={clsx("px-3 py-2 font-semibold", className)} aria-sort={sort === key ? "descending" : undefined}>
      <button type="button" onClick={() => setSort(key)} className={clsx("uppercase tracking-wider hover:text-fg", sort === key && "text-accent")} data-sort={key}>
        {label} {sort === key && "↓"}
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("meta.title")}</h1>
        <p className="mt-0.5 text-sm text-fg-secondary">{t("meta.subtitle")}</p>
        <p className="mt-1 text-xs text-fg-muted">{t("meta.sample", { n: meta.matches.toLocaleString("en-US"), p: meta.patches.join(", ") })}</p>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist">
        {ROLES.map((r) => (
          <button key={r} type="button" role="tab" aria-selected={role === r} className={clsx("btn", role === r && "btn-active")} onClick={() => setRole(r)} data-role={r}>
            <RoleIcon role={r} size={15} />
            {roleName(r)}
          </button>
        ))}
      </div>
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm" data-testid="meta-table">
          <thead className="border-b border-border text-left text-[11px] text-fg-muted">
            <tr>
              <th className="w-10 px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold uppercase tracking-wider">{t("meta.champion")}</th>
              {th("tier", t("meta.tier"))}
              {th("win", t("common.winRate"), "text-right")}
              {th("pick", t("common.pickRate"), "text-right")}
              {th("games", t("common.games"), "text-right")}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-white/[0.02]" data-testid="meta-row">
                <td className="tabular px-3 py-1.5 text-fg-muted">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <Link href={`/champion/${data.champions[r.id]?.key}/`} prefetch={false} className="flex items-center gap-2 font-medium text-fg hover:text-accent">
                    <ChampionIcon id={r.id} size={30} />
                    {data.champions[r.id]?.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  <TierBadge tier={r.tier} />
                </td>
                <td className="tabular px-3 py-1.5 text-right">
                  <span className={clsx("font-semibold", r.wr >= 0.5 ? "text-win" : "text-loss")}>{pct(r.wr, 1)}</span>
                  <span className="ml-2 text-[11px] text-fg-muted" title={t("draft.base")}>
                    {signed(r.points)}
                  </span>
                </td>
                <td className="tabular px-3 py-1.5 text-right text-fg-secondary">{pct(r.pick, 1)}</td>
                <td className="tabular px-3 py-1.5 text-right text-fg-muted">{r.g}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-fg-muted">
                  {t("common.noData")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
