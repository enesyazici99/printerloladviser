"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { useFeed, useMeta } from "@/lib/data";
import { matchesQuery, playedRoles, sortedChampions } from "@/lib/champions";
import { pct } from "@/lib/format";
import { ROLES, type Role } from "@/lib/types";
import { ChampionIcon, RoleIcon, Spinner } from "@/components/ui/icons";
import { MatchList } from "@/components/matches/MatchList";

export function HomeClient() {
  const { t, lang, data, error, roleName } = useI18n();
  const { data: meta } = useMeta();
  const { data: feed } = useFeed();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | null>(null);

  const champions = useMemo(() => (data ? sortedChampions(data.champions, lang) : []), [data, lang]);
  const visible = useMemo(() => champions.filter((c) => matchesQuery(c, query) && (!role || playedRoles(meta, c.id).includes(role))), [champions, query, role, meta]);

  // Five most played champions of each role in the statistics window.
  const topByRole = useMemo(() => {
    if (!meta) return null;
    return ROLES.map((r) => ({
      role: r,
      picks: Object.entries(meta.champions)
        .map(([id, c]) => ({ id: Number(id), g: c.roles[r]?.[0] ?? 0, w: c.roles[r]?.[1] ?? 0 }))
        .filter((x) => x.g > 0)
        .sort((a, b) => b.g - a.g)
        .slice(0, 5),
    }));
  }, [meta]);

  if (error) return <div className="panel px-4 py-10 text-center text-sm text-loss">{t("common.error")}</div>;
  if (!data) return <Spinner label={t("common.loading")} />;

  return (
    <div className="space-y-6">
      <section className="pt-4 text-center sm:pt-8">
        <h1 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-fg sm:text-3xl">{t("home.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-fg-secondary">{t("home.subtitle")}</p>
        <div className="mx-auto mt-5 max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("home.search")}
            aria-label={t("home.search")}
            className="input !py-2.5 text-center"
            data-testid="champion-search"
          />
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-1" role="group" aria-label={t("champ.filters.role")}>
          <button type="button" className={clsx("btn !px-2.5 !py-1 !text-xs", !role && "btn-active")} onClick={() => setRole(null)}>
            {t("role.all")}
          </button>
          {ROLES.map((r) => (
            <button key={r} type="button" className={clsx("btn !px-2.5 !py-1 !text-xs", role === r && "btn-active")} onClick={() => setRole(role === r ? null : r)} aria-pressed={role === r} data-role={r}>
              <RoleIcon role={r} size={14} />
              {roleName(r)}
            </button>
          ))}
        </div>
      </section>

      <section className="panel p-3" data-testid="champion-grid">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg-muted">{t("home.noChampion")}</p>
        ) : (
          <div className="grid grid-cols-5 gap-x-1 gap-y-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-[repeat(14,minmax(0,1fr))]">
            {visible.map((c) => (
              <Link key={c.id} href={`/champion/${c.key}/`} prefetch={false} className="group flex flex-col items-center gap-1 rounded-md p-1 hover:bg-surface-tertiary" data-champion={c.key}>
                <ChampionIcon id={c.id} size={52} className="h-[52px] w-[52px] ring-1 ring-border group-hover:ring-accent" />
                <span className="w-full truncate text-center text-[11px] text-fg-secondary group-hover:text-fg">{c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {topByRole && meta && meta.matches > 0 && (
        <section data-testid="top-picks">
          <h2 className="panel-title mb-2 px-1">{t("home.topPicks")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {topByRole.map(({ role: r, picks }) => (
              <div key={r} className="panel p-3">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <RoleIcon role={r} size={16} className="text-accent" />
                  {roleName(r)}
                </div>
                <ul className="space-y-1.5">
                  {picks.map((p) => (
                    <li key={p.id}>
                      <Link href={`/champion/${data.champions[p.id]?.key}/`} prefetch={false} className="flex items-center gap-2 rounded text-sm hover:bg-surface-tertiary">
                        <ChampionIcon id={p.id} size={26} />
                        <span className="min-w-0 flex-1 truncate text-fg-secondary">{data.champions[p.id]?.name}</span>
                        <span className="tabular text-[11px] text-fg-muted" title={t("common.pickRate")}>
                          {pct(p.g / (2 * meta.matches), 1)}
                        </span>
                        <span className={clsx("tabular w-9 text-right text-[11px] font-semibold", p.w / p.g >= 0.5 ? "text-win" : "text-loss")} title={t("common.winRate")}>
                          {pct(p.w / p.g)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {feed && feed.matches.length > 0 && (
        <section data-testid="latest-feed">
          <h2 className="panel-title mb-2 px-1">{t("home.latest")}</h2>
          <MatchList rows={feed.matches.slice(0, 40)} showChampion />
        </section>
      )}
    </div>
  );
}
