"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { useMeta } from "@/lib/data";
import { HeaderSearch } from "./HeaderSearch";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const pathname = usePathname() ?? "/";
  const { data: meta } = useMeta();
  const [mobileSearch, setMobileSearch] = useState(false);
  const links = [
    { href: "/", label: t("nav.builds"), active: pathname === "/" || pathname.startsWith("/champion") },
    { href: "/draft/", label: t("nav.draft"), active: pathname.startsWith("/draft") },
    { href: "/meta/", label: t("nav.meta"), active: pathname.startsWith("/meta") },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-2 px-3 sm:gap-4 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[15px] font-bold tracking-tight text-fg">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-black text-white">PL</span>
          <span className="hidden lg:inline">printerloladviser</span>
        </Link>
        <nav aria-label="Main" className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.active ? "page" : undefined}
              className={clsx(
                "whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors sm:px-3 sm:text-sm",
                l.active ? "bg-accent-muted text-fg" : "text-fg-secondary hover:text-fg"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Champion search: inline from tablet width up, behind a button on phones. */}
        <HeaderSearch className="ml-auto hidden w-full max-w-[240px] md:block xl:max-w-[300px]" />
        <button
          type="button"
          onClick={() => setMobileSearch((o) => !o)}
          aria-label={t("home.search")}
          aria-expanded={mobileSearch}
          className={clsx("ml-auto rounded-md p-2 md:hidden", mobileSearch ? "bg-accent-muted text-fg" : "text-fg-secondary hover:text-fg")}
          data-testid="mobile-search-toggle"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path fillRule="evenodd" d="M9 3.500a5.500 5.500 0 100 11 5.500 5.500 0 000-11zM2 9a7 7 0 1112.450 4.390l3.580 3.580a.750.750 0 11-1.060 1.060l-3.580-3.580A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
        </button>

        {meta?.patches?.[0] && (
          <span className="hidden shrink-0 rounded border border-border px-2 py-1 text-xs text-fg-secondary lg:inline" data-testid="patch-badge">
            {t("common.patch")} {meta.patches[0]}
          </span>
        )}
        <div className="flex shrink-0 overflow-hidden rounded-md border border-border text-xs font-semibold" role="group" aria-label="Language">
          {(["tr", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={clsx("px-2 py-1 uppercase transition-colors", lang === l ? "bg-accent text-white" : "text-fg-muted hover:text-fg")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {mobileSearch && (
        <div className="border-t border-border px-3 py-2 md:hidden">
          <HeaderSearch autoFocus onDone={() => setMobileSearch(false)} />
        </div>
      )}
    </header>
  );
}
