"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { MatchRow as Row } from "@/lib/types";
import { MatchListHeader, MatchRow } from "./MatchRow";

const PAGE = 20;

/** Feed table with "show more" paging. `championId` is used when rows don't carry their own. */
export function MatchList({ rows, championId, showChampion }: { rows: Row[]; championId?: number; showChampion?: boolean }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(PAGE);
  // A new filter result starts from the first page again.
  useEffect(() => setShown(PAGE), [rows]);

  if (rows.length === 0) {
    return (
      <div className="panel px-4 py-10 text-center text-sm text-fg-muted" data-testid="no-matches">
        {t("common.noData")}
      </div>
    );
  }
  return (
    <div className="panel overflow-hidden" data-testid="match-list">
      <MatchListHeader showChampion={showChampion} />
      {rows.slice(0, shown).map((m) => (
        <MatchRow key={`${m.id}:${m.p.n}:${m.c ?? championId}`} m={m} championId={m.c ?? championId ?? 0} showChampion={showChampion} />
      ))}
      {shown < rows.length && (
        <button type="button" className="w-full border-t border-border py-2.5 text-sm font-medium text-accent hover:bg-white/[0.03]" onClick={() => setShown((s) => s + PAGE)} data-testid="show-more">
          {t("common.more")} ({rows.length - shown})
        </button>
      )}
    </div>
  );
}
