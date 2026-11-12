"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { useDraftFile } from "@/lib/data";
import { buildIndex, type Risk } from "@/lib/draft/engine";
import { ROLES } from "@/lib/types";
import { boardFromQuery, boardToQuery, useDraft } from "@/stores/draft";
import { ChampionIcon, Spinner } from "@/components/ui/icons";
import { ChampionPicker } from "@/components/ui/ChampionPicker";
import { Board, type PickerTarget } from "@/components/draft/Board";
import { Suggestions } from "@/components/draft/Suggestions";
import { CompPanel, WinChance } from "@/components/draft/CompPanel";
import { BuildPanel } from "@/components/draft/BuildPanel";
import { LiveSync } from "@/components/draft/LiveSync";

const RISKS: Risk[] = ["safe", "normal", "bold"];

export function DraftPageClient() {
  const { t, data, error } = useI18n();
  const { data: file, error: draftError } = useDraftFile();
  const index = useMemo(() => (file ? buildIndex(file) : null), [file]);
  const { ally, enemy, bans, myRole, risk, pool, setPick, addBan, togglePool, setRisk, reset, applyBoard } = useDraft();
  const [target, setTarget] = useState<PickerTarget | null>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  // Restore preferences, then let a shared link (or ?pick= from a champion page) set the board.
  useEffect(() => {
    Promise.resolve(useDraft.persist.rehydrate()).then(() => {
      const board = boardFromQuery(window.location.search);
      if (board) applyBoard(board);
      setReady(true);
    });
  }, [applyBoard]);

  // Keep the address bar shareable.
  useEffect(() => {
    if (!ready) return;
    const query = boardToQuery({ ally, enemy, bans, myRole });
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [ready, ally, enemy, bans, myRole]);

  const taken = useMemo(() => new Set([...ally, ...enemy, ...bans].filter(Boolean)), [ally, enemy, bans]);

  const onPick = (champ: number) => {
    if (!target) return;
    if (target.kind === "pick") setPick(target.side, target.role, champ);
    else if (target.kind === "ban") addBan(champ);
    else togglePool(champ);
    if (target.kind !== "pool") setTarget(null);
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the link is in the address bar anyway
    }
  };

  if (error || draftError) return <div className="panel px-4 py-10 text-center text-sm text-loss">{t("common.error")}</div>;
  if (!data || !index || !ready) return <Spinner label={t("common.loading")} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-fg">{t("draft.title")}</h1>
          <p className="mt-0.5 text-sm text-fg-secondary">{t("draft.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveSync index={index} />
          <button type="button" className="btn" onClick={share} data-testid="share">
            {copied ? t("draft.shared") : t("draft.share")}
          </button>
          <button type="button" className="btn" onClick={reset} data-testid="reset">
            {t("draft.reset")}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-3">
          <WinChance index={index} />
          <Board onOpen={setTarget} />
          <CompPanel />

          <div className="panel flex flex-wrap items-start gap-x-8 gap-y-3 p-3" data-testid="settings">
            <div className="min-w-0 flex-1">
              <h3 className="panel-title mb-1.5">{t("draft.pool")}</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {pool.map((id) => (
                  <button key={id} type="button" onClick={() => togglePool(id)} title={`${data.champions[id]?.name} ✕`} aria-label={`${t("common.clear")} ${data.champions[id]?.name}`} data-pool={id}>
                    <ChampionIcon id={id} size={30} className="hover:opacity-60" />
                  </button>
                ))}
                <button type="button" onClick={() => setTarget({ kind: "pool" })} className="flex h-[30px] items-center rounded border border-dashed border-border-secondary px-2 text-xs text-fg-muted hover:text-fg" data-testid="add-pool">
                  + {t("draft.pool.add")}
                </button>
              </div>
              {pool.length === 0 && <p className="mt-1.5 text-[11px] text-fg-muted">{t("draft.pool.hint")}</p>}
            </div>
            <div>
              <h3 className="panel-title mb-1.5">{t("draft.risk")}</h3>
              <div className="flex gap-1" role="group" aria-label={t("draft.risk")}>
                {RISKS.map((r) => (
                  <button key={r} type="button" className={clsx("btn !px-2 !py-1 !text-xs", risk === r && "btn-active")} onClick={() => setRisk(r)} aria-pressed={risk === r} title={t("draft.risk.hint")} data-risk={r}>
                    {t(`draft.risk.${r}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-fg-muted">{t("meta.sample", { n: index.matches.toLocaleString("en-US"), p: index.patches.join(", ") })}</p>
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-[68px]">
          <Suggestions index={index} />
        </div>
      </div>

      <BuildPanel currentPatch={index.patches[0] ?? ""} />

      <ChampionPicker
        open={target !== null}
        onClose={() => setTarget(null)}
        onPick={onPick}
        disabled={target?.kind === "pool" ? new Set(pool) : taken}
        initialRole={target?.kind === "pick" ? ROLES[target.role] : null}
        title={target?.kind === "ban" ? t("draft.addBan") : target?.kind === "pool" ? t("draft.pool.add") : undefined}
      />
    </div>
  );
}
