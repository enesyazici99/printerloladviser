"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { useMeta } from "@/lib/data";
import { matchesQuery, playedRoles, sortedChampions } from "@/lib/champions";
import { ROLES, type Role } from "@/lib/types";
import { ChampionIcon, RoleIcon } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (championId: number) => void;
  /** champions shown greyed out and not selectable */
  disabled?: Set<number>;
  /** role tab selected when the picker opens */
  initialRole?: Role | null;
  /** restrict the list (e.g. to opponents that exist in the data) */
  only?: Set<number> | null;
  title?: string;
}

/** Modal champion grid with search and role tabs. Enter picks the first result. */
export function ChampionPicker({ open, onClose, onPick, disabled, initialRole = null, only = null, title }: Props) {
  const { t, lang, data, roleName } = useI18n();
  const { data: meta } = useMeta();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | null>(initialRole);
  const inputRef = useRef<HTMLInputElement>(null);

  // Callers pass inline callbacks; keep the latest in a ref so the effect below
  // only runs when the picker opens (otherwise typing would reset the search).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRole(initialRole);
    const id = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, initialRole]);

  const list = useMemo(() => {
    if (!data) return [];
    return sortedChampions(data.champions, lang).filter(
      (c) => (!only || only.has(c.id)) && matchesQuery(c, query) && (!role || query.trim() !== "" || playedRoles(meta, c.id).includes(role))
    );
  }, [data, lang, only, query, role, meta]);

  if (!open) return null;
  const firstEnabled = list.find((c) => !disabled?.has(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-3 pt-[8vh]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title ?? t("draft.picker.title")} data-testid="champion-picker">
      <div className="panel flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && firstEnabled) onPick(firstEnabled.id);
            }}
            placeholder={t("home.search")}
            aria-label={t("home.search")}
            className="input"
          />
          <button type="button" className="btn" onClick={onClose} aria-label={t("common.close")}>
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
          <button type="button" className={clsx("btn !px-2 !py-1 !text-xs", !role && "btn-active")} onClick={() => setRole(null)}>
            {t("role.all")}
          </button>
          {ROLES.map((r) => (
            <button key={r} type="button" className={clsx("btn !px-2 !py-1 !text-xs", role === r && "btn-active")} onClick={() => setRole(r)} aria-label={roleName(r)} title={roleName(r)}>
              <RoleIcon role={r} size={14} />
              <span className="hidden sm:inline">{roleName(r)}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2 overflow-y-auto p-3 sm:grid-cols-8">
          {list.map((c) => {
            const off = disabled?.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={off}
                onClick={() => onPick(c.id)}
                className={clsx("group flex flex-col items-center gap-1 rounded-md p-1 text-center", off ? "cursor-not-allowed opacity-25" : "hover:bg-surface-tertiary")}
                data-champion={c.key}
              >
                <ChampionIcon id={c.id} size={48} className="h-12 w-12" />
                <span className="w-full truncate text-[11px] text-fg-secondary group-hover:text-fg">{c.name}</span>
              </button>
            );
          })}
          {list.length === 0 && <p className="col-span-full py-8 text-center text-sm text-fg-muted">{t("home.noChampion")}</p>}
        </div>
      </div>
    </div>
  );
}
