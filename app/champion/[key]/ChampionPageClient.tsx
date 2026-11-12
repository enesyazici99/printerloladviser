"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { champSplash, useChampionFile } from "@/lib/data";
import { filterRows, NO_FILTERS, summarize, type FeedFilters } from "@/lib/builds";
import { pct, SERVER_LABEL } from "@/lib/format";
import { ROLES, type Role } from "@/lib/types";
import { ChampionIcon, RoleIcon, Spinner } from "@/components/ui/icons";
import { ChampionPicker } from "@/components/ui/ChampionPicker";
import { BuildPaths, SummaryBar } from "@/components/builds/SummaryBar";
import { MatchList } from "@/components/matches/MatchList";

function LaneMatchups({ lane, role }: { lane: [number, number, number][]; role: Role }) {
  const { t, data, roleName } = useI18n();
  // Rank by a win rate that is pulled towards 50% for small samples, so 3-0 does not top the list.
  const ranked = useMemo(
    () =>
      lane
        .filter(([, g]) => g >= 5) // fewer games say nothing about a matchup
        .map(([id, g, w]) => ({ id, g, w, adj: (w + 6) / (g + 12) }))
        .sort((a, b) => b.adj - a.adj),
    [lane]
  );
  if (ranked.length < 4) {
    return (
      <div className="panel px-3 py-3" data-testid="lane-matchups">
        <h3 className="panel-title mb-2">{t("champ.matchups")}</h3>
        <p className="text-sm text-fg-muted">{t("champ.matchups.none")}</p>
      </div>
    );
  }
  const n = Math.min(5, Math.floor(ranked.length / 2));
  const column = (title: string, list: typeof ranked, good: boolean) => (
    <div>
      <div className={clsx("mb-1.5 text-xs font-semibold", good ? "text-win" : "text-loss")}>{title}</div>
      <ul className="space-y-1">
        {list.map((x) => (
          <li key={x.id} className="flex items-center gap-2 text-sm">
            <ChampionIcon id={x.id} size={24} round />
            <span className="min-w-0 flex-1 truncate text-fg-secondary">{data?.champions[x.id]?.name}</span>
            <span className={clsx("tabular font-semibold", x.w / x.g >= 0.5 ? "text-win" : "text-loss")}>{pct(x.w / x.g)}</span>
            <span className="tabular w-14 text-right text-[11px] text-fg-muted">
              {x.g} {t("common.games")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="panel px-3 py-3" data-testid="lane-matchups">
      <h3 className="panel-title mb-2">
        {t("champ.matchups")} · {roleName(role)}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {column(t("champ.matchups.best"), ranked.slice(0, n), true)}
        {column(t("champ.matchups.worst"), ranked.slice(-n).reverse(), false)}
      </div>
    </div>
  );
}

export function ChampionPageClient({ championKey }: { championKey: string }) {
  const { t, data, roleName } = useI18n();
  const { data: file, error, isLoading } = useChampionFile(championKey);
  const [filters, setFilters] = useState<FeedFilters>(NO_FILTERS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (patch: Partial<FeedFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const champ = useMemo(() => (data ? Object.values(data.champions).find((c) => c.key === championKey) : undefined), [data, championKey]);
  const all = useMemo(() => file?.matches ?? [], [file]);
  const rows = useMemo(() => filterRows(all, filters), [all, filters]);
  const summary = useMemo(() => (data ? summarize(rows.map((m) => ({ m, w: 1 })), data.items) : null), [rows, data]);

  // Filter options come from the data, so empty choices are never offered.
  const servers = useMemo(() => [...new Set(all.map((m) => m.reg))].sort(), [all]);
  const opponents = useMemo(() => new Set(all.map((m) => m.opp).filter(Boolean)), [all]);
  const roleCounts = useMemo(() => {
    const c: Partial<Record<Role, number>> = {};
    for (const m of all) if (m.role) c[m.role] = (c[m.role] ?? 0) + 1;
    return c;
  }, [all]);
  const mainRole = useMemo(() => filters.role ?? ROLES.reduce<Role | null>((best, r) => ((roleCounts[r] ?? 0) > (best ? roleCounts[best] ?? 0 : 0) ? r : best), null), [filters.role, roleCounts]);
  const patches = useMemo(() => [...new Set(all.map((m) => m.v))], [all]);
  const dirty = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  if (error) return <div className="panel px-4 py-10 text-center text-sm text-loss">{t("common.error")}</div>;
  if (isLoading || !data || !file) return <Spinner label={t("common.loading")} />;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="panel relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-[center_20%] opacity-25" style={{ backgroundImage: `url(${champSplash(championKey)})` }} aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-surface-secondary via-surface-secondary/80 to-transparent" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-4 px-4 py-5">
          <ChampionIcon id={file.id} size={72} className="ring-1 ring-border-secondary" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-fg">
              {champ?.name ?? championKey} <span className="font-medium text-fg-secondary">{t("champ.proBuild")}</span>
            </h1>
            <p className="mt-0.5 text-sm text-fg-secondary">
              {champ?.title} · {t("common.patch")} {patches.slice(0, 2).join(", ") || "—"} · {all.length} {t("common.games")}
            </p>
          </div>
          <Link href={`/draft/?pick=${file.id}${mainRole ? `&r=${ROLES.indexOf(mainRole)}` : ""}`} className="btn btn-primary">
            {t("champ.openDraft")}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5" data-testid="filters">
        <div className="flex items-center gap-1" role="group" aria-label={t("champ.filters.role")}>
          <button type="button" className={clsx("btn !px-2 !py-1 !text-xs", !filters.role && "btn-active")} onClick={() => set({ role: null })}>
            {t("role.all")}
          </button>
          {ROLES.filter((r) => roleCounts[r]).map((r) => (
            <button
              key={r}
              type="button"
              className={clsx("btn !px-2 !py-1", filters.role === r && "btn-active")}
              onClick={() => set({ role: filters.role === r ? null : r })}
              aria-pressed={filters.role === r}
              aria-label={roleName(r)}
              title={`${roleName(r)} (${roleCounts[r]})`}
              data-role={r}
            >
              <RoleIcon role={r} size={16} />
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          {t("champ.filters.server")}
          <select className="input !w-auto !py-1 !text-xs" value={filters.server ?? ""} onChange={(e) => set({ server: e.target.value || null })} aria-label={t("champ.filters.server")}>
            <option value="">{t("common.all")}</option>
            {servers.map((s) => (
              <option key={s} value={s}>
                {SERVER_LABEL[s] ?? s.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1" role="group" aria-label={t("champ.filters.players")}>
          {(
            [
              ["all", t("common.all")],
              ["challenger", t("champ.filters.challengerOnly")],
              ["otp", t("champ.filters.otpOnly")],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className={clsx("btn !px-2 !py-1 !text-xs", filters.players === value && "btn-active")} onClick={() => set({ players: value })} aria-pressed={filters.players === value} data-players={value}>
              {label}
            </button>
          ))}
        </div>

        <button type="button" className={clsx("btn !px-2 !py-1 !text-xs", filters.opponent && "btn-active")} onClick={() => setPickerOpen(true)} data-testid="vs-filter">
          {t("common.vs")}
          {filters.opponent ? (
            <>
              <ChampionIcon id={filters.opponent} size={18} round />
              {data.champions[filters.opponent]?.name}
            </>
          ) : (
            <span className="text-fg-muted">{t("champ.filters.anyOpponent")}</span>
          )}
        </button>
        {filters.opponent && (
          <button type="button" className="-ml-3 px-1 text-xs text-fg-muted hover:text-fg" onClick={() => set({ opponent: null })} aria-label={t("common.clear")}>
            ✕
          </button>
        )}

        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-secondary">
          <input type="checkbox" className="accent-accent" checked={filters.winsOnly} onChange={(e) => set({ winsOnly: e.target.checked })} />
          {t("champ.filters.winsOnly")}
        </label>

        {dirty && (
          <button type="button" className="ml-auto text-xs font-medium text-accent hover:underline" onClick={() => setFilters(NO_FILTERS)} data-testid="reset-filters">
            {t("champ.filters.reset")}
          </button>
        )}
      </div>

      {summary && summary.games > 0 && (
        <>
          <SummaryBar s={summary} championId={file.id} />
          <BuildPaths s={summary} />
        </>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-2">
          <h2 className="panel-title px-1">
            {t("champ.feed")} · {rows.length} {t("common.games")}
          </h2>
          <MatchList rows={rows} championId={file.id} />
        </div>
        <aside className="space-y-3 lg:pt-6">{mainRole && <LaneMatchups lane={file.lane[mainRole] ?? []} role={mainRole} />}</aside>
      </div>

      <ChampionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          set({ opponent: id });
          setPickerOpen(false);
        }}
        only={opponents}
        title={t("champ.filters.vs")}
      />
    </div>
  );
}
