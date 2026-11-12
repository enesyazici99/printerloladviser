"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import { useMeta } from "@/lib/data";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const pathname = usePathname() ?? "/";
  const { data: meta } = useMeta();
  const links = [
    { href: "/", label: t("nav.builds"), active: pathname === "/" || pathname.startsWith("/champion") },
    { href: "/draft/", label: t("nav.draft"), active: pathname.startsWith("/draft") },
    { href: "/meta/", label: t("nav.meta"), active: pathname.startsWith("/meta") },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center gap-3 px-3 sm:gap-6 sm:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[15px] font-bold tracking-tight text-fg">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-black text-white">LA</span>
          <span className="hidden sm:inline">LoL Advisor</span>
        </Link>
        <nav aria-label="Main" className="flex min-w-0 flex-1 items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={l.active ? "page" : undefined}
              className={clsx(
                "whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                l.active ? "bg-accent-muted text-fg" : "text-fg-secondary hover:text-fg"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {meta?.patches?.[0] && (
          <span className="hidden rounded border border-border px-2 py-1 text-xs text-fg-secondary md:inline" data-testid="patch-badge">
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
    </header>
  );
}
