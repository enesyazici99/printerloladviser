"use client";

import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { ROLES } from "@/lib/types";
import { MAX_BANS, useDraft, type Side } from "@/stores/draft";
import { ChampionIcon, RoleIcon } from "@/components/ui/icons";

export type PickerTarget = { kind: "pick"; side: Side; role: number } | { kind: "ban" } | { kind: "pool" };

function Slot({ side, role, onOpen }: { side: Side; role: number; onOpen: (t: PickerTarget) => void }) {
  const { t, data, roleName } = useI18n();
  const champ = useDraft((s) => s[side][role]);
  const myRole = useDraft((s) => s.myRole);
  const clearPick = useDraft((s) => s.clearPick);
  const setMyRole = useDraft((s) => s.setMyRole);
  const mine = side === "ally" && role === myRole;
  const name = champ ? data?.champions[champ]?.name : null;
  return (
    <div
      className={clsx("flex items-center gap-1 rounded-md border px-1.5 py-1.5 sm:gap-2 sm:px-2", mine ? "border-accent bg-accent-muted" : "border-border bg-surface-tertiary/50", side === "enemy" && "flex-row-reverse text-right")}
      data-testid={`slot-${side}-${ROLES[role]}`}
      data-champion={champ || ""}
    >
      {side === "ally" ? (
        <button
          type="button"
          onClick={() => setMyRole(role)}
          aria-pressed={mine}
          aria-label={`${t("draft.myRole")}: ${roleName(ROLES[role])}`}
          title={`${t("draft.myRole")}: ${roleName(ROLES[role])}`}
          className={clsx("rounded p-1 transition-colors", mine ? "text-accent" : "text-fg-muted hover:text-fg")}
          data-testid={`my-role-${ROLES[role]}`}
        >
          <RoleIcon role={ROLES[role]} size={18} />
        </button>
      ) : (
        <span className="p-1 text-fg-muted" title={roleName(ROLES[role])}>
          <RoleIcon role={ROLES[role]} size={18} />
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpen({ kind: "pick", side, role })}
        className={clsx("flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:opacity-90", side === "enemy" && "flex-row-reverse text-right")}
        aria-label={`${side === "ally" ? t("draft.ally") : t("draft.enemy")} ${roleName(ROLES[role])}: ${name ?? t("draft.empty")}`}
      >
        {champ ? <ChampionIcon id={champ} size={40} /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-dashed border-border-secondary text-lg text-fg-muted">+</span>}
        <span className="min-w-0 flex-1">
          <span className={clsx("line-clamp-2 break-words text-[13px] font-semibold leading-tight sm:text-sm", champ ? "text-fg" : "text-fg-muted")}>{name ?? t("draft.pick")}</span>
          <span className="block text-[11px] text-fg-muted">
            {roleName(ROLES[role])}
            {mine && ` · ${t("draft.myRole")}`}
          </span>
        </span>
      </button>
      {champ > 0 && (
        <button type="button" onClick={() => clearPick(side, role)} className="px-0.5 text-xs text-fg-muted hover:text-loss sm:px-1 sm:text-sm" aria-label={`${t("common.clear")} ${name}`}>
          ✕
        </button>
      )}
    </div>
  );
}

export function Board({ onOpen }: { onOpen: (t: PickerTarget) => void }) {
  const { t } = useI18n();
  const bans = useDraft((s) => s.bans);
  const removeBan = useDraft((s) => s.removeBan);
  return (
    <div className="panel p-3" data-testid="draft-board">
      <div className="grid grid-cols-2 gap-3">
        {(["ally", "enemy"] as const).map((side) => (
          <div key={side} className="space-y-1.5">
            <h2 className={clsx("panel-title", side === "ally" ? "text-win" : "text-right text-loss")}>{t(side === "ally" ? "draft.ally" : "draft.enemy")}</h2>
            {ROLES.map((_, role) => (
              <Slot key={role} side={side} role={role} onOpen={onOpen} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3" data-testid="bans">
        <span className="panel-title mr-1">{t("draft.bans")}</span>
        {bans.map((id) => (
          <button key={id} type="button" onClick={() => removeBan(id)} className="group relative" aria-label={`${t("common.clear")} ban`} data-ban={id}>
            <ChampionIcon id={id} size={30} className="opacity-60 grayscale group-hover:opacity-100" />
            <span className="pointer-events-none absolute left-0 top-1/2 h-0.5 w-full -rotate-45 bg-loss" aria-hidden />
          </button>
        ))}
        {bans.length < MAX_BANS && (
          <button type="button" onClick={() => onOpen({ kind: "ban" })} className="flex h-[30px] items-center rounded border border-dashed border-border-secondary px-2 text-xs text-fg-muted hover:text-fg" data-testid="add-ban">
            + {t("draft.addBan")}
          </button>
        )}
      </div>
    </div>
  );
}
