"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { matchesQuery, normalize, sortedChampions } from "@/lib/champions";
import type { StaticChampion } from "@/lib/types";
import { ChampionIcon } from "@/components/ui/icons";

const MAX_RESULTS = 8;

/**
 * Champion search available on every page: type a name, press Enter (or pick a
 * result) and land on that champion's pro builds. "/" or Ctrl+K focuses it.
 */
export function HeaderSearch({ autoFocus, onDone, className }: { autoFocus?: boolean; onDone?: () => void; className?: string }) {
  const { t, lang, data } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!data || !q) return [];
    // Names that start with the query come first ("vi" -> Vi, Viego, Viktor before Anivia).
    const rank = (c: StaticChampion) => (normalize(c.name).startsWith(q) || normalize(c.key).startsWith(q) ? 0 : 1);
    return sortedChampions(data.champions, lang)
      .filter((c) => matchesQuery(c, query))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, MAX_RESULTS);
  }, [data, lang, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Keyboard shortcut and closing when clicking elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable);
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
        if (!inputRef.current || inputRef.current.offsetParent === null) return; // hidden instance (other breakpoint)
        e.preventDefault();
        inputRef.current.focus();
        inputRef.current.select();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  const go = (c: StaticChampion) => {
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    onDone?.();
    router.push(`/champion/${c.key}/`);
  };

  return (
    <div ref={boxRef} className={clsx("relative", className)} data-testid="header-search">
      <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden>
        <path fillRule="evenodd" d="M9 3.500a5.500 5.500 0 100 11 5.500 5.500 0 000-11zM2 9a7 7 0 1112.450 4.390l3.580 3.580a.750.750 0 11-1.060 1.060l-3.580-3.580A7 7 0 012 9z" clipRule="evenodd" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="header-search-results"
        aria-autocomplete="list"
        aria-label={t("home.search")}
        placeholder={t("home.search")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
            onDone?.();
          }
        }}
        className="input !py-1.5 !pl-8 !pr-8 [&::-webkit-search-cancel-button]:appearance-none"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 text-[10px] text-fg-muted lg:block">/</kbd>
      {open && query.trim() !== "" && (
        <ul id="header-search-results" role="listbox" className="panel absolute left-0 right-0 z-50 mt-1.5 max-h-[70vh] overflow-y-auto p-1 shadow-2xl">
          {results.length === 0 ? (
            <li className="px-3 py-3 text-center text-sm text-fg-muted">{t("home.noChampion")}</li>
          ) : (
            results.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // mousedown would blur the input before the click lands; act on it directly
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={clsx("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left", i === active ? "bg-accent-muted" : "hover:bg-surface-tertiary")}
                  data-champion={c.key}
                >
                  <ChampionIcon id={c.id} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg">{c.name}</span>
                    <span className="block truncate text-[11px] text-fg-muted">{c.title}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
