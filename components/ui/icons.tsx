"use client";

import clsx from "clsx";
import { champIcon, itemIcon, runeIcon, spellIcon } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/types";

/** Small original glyphs for the five positions. */
export function RoleIcon({ role, size = 16, className }: { role: Role; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", className, "aria-hidden": true } as const;
  switch (role) {
    case "top":
      return (
        <svg {...common}>
          <path d="M3 3h18l-4 4H7v10l-4 4V3z" />
          <path d="M21 21H7l4-4h6V11l4-4v14z" opacity=".28" />
          <rect x="10" y="10" width="4" height="4" opacity=".28" />
        </svg>
      );
    case "adc":
      return (
        <svg {...common}>
          <path d="M21 21H3l4-4h10V7l4-4v18z" />
          <path d="M3 3h14l-4 4H7v6l-4 4V3z" opacity=".28" />
          <rect x="10" y="10" width="4" height="4" opacity=".28" />
        </svg>
      );
    case "mid":
      return (
        <svg {...common}>
          <path d="M17 3h4v4L7 21H3v-4L17 3z" />
          <path d="M3 3h10l-4 4H7v2l-4 4V3z" opacity=".28" />
          <path d="M21 21H11l4-4h2v-2l4-4v10z" opacity=".28" />
        </svg>
      );
    case "jungle":
      return (
        <svg {...common}>
          <path d="M12 22c-.8-4.2-2.8-7.4-6-9.6C6 9 5 5.6 3.5 2.5 8 5.6 11 10.2 12 15.5c1-5.3 4-9.9 8.500-13C19 5.600 18 9 18 12.400c-3.200 2.200-5.200 5.400-6 9.600z" />
        </svg>
      );
    case "support":
      return (
        <svg {...common}>
          <path d="M12 3l3.200 3.200-1.700 1.800 1.200 10L12 21.500 9.300 18l1.200-10-1.700-1.800L12 3z" />
          <path d="M2 7.500h6.500L7 12.500 2 10.200V7.500z" />
          <path d="M22 7.500h-6.500l1.500 5 5-2.300V7.500z" />
        </svg>
      );
  }
}

export function ChampionIcon({
  id,
  size = 32,
  className,
  title,
  round,
}: {
  id: number;
  size?: number;
  className?: string;
  title?: string;
  round?: boolean;
}) {
  const { data } = useI18n();
  const c = data?.champions[id];
  const style = { width: size, height: size };
  if (!data || !c) return <span style={style} className={clsx("inline-block shrink-0 rounded bg-surface-tertiary", className)} />;
  return (
    <span style={style} className={clsx("inline-block shrink-0 overflow-hidden bg-surface-tertiary", round ? "rounded-full" : "rounded", className)}>
      <img
        src={champIcon(data.version, c.key)}
        alt={c.name}
        title={title ?? c.name}
        width={size}
        height={size}
        loading="lazy"
        className="h-full w-full scale-[1.12] object-cover"
      />
    </span>
  );
}

export function ItemIcon({ id, size = 28, className, dim }: { id: number; size?: number; className?: string; dim?: boolean }) {
  const { data } = useI18n();
  const style = { width: size, height: size };
  const item = id ? data?.items[id] : null;
  if (!data || !id || !item) {
    return <span style={style} className={clsx("inline-block shrink-0 rounded border border-border bg-surface-tertiary/60", className)} />;
  }
  const title = `${item.name}${item.gold ? ` · ${item.gold}g` : ""}${item.plain ? `\n${item.plain}` : ""}`;
  return (
    <img
      src={itemIcon(data.version, id)}
      alt={item.name}
      title={title}
      width={size}
      height={size}
      loading="lazy"
      style={style}
      className={clsx("inline-block shrink-0 rounded border border-border bg-surface-tertiary", dim && "opacity-40 grayscale", className)}
    />
  );
}

export function SpellIcon({ id, size = 22, className }: { id: number; size?: number; className?: string }) {
  const { data } = useI18n();
  const s = data?.spells[id];
  const style = { width: size, height: size };
  if (!data || !s) return <span style={style} className={clsx("inline-block shrink-0 rounded bg-surface-tertiary", className)} />;
  return (
    <img src={spellIcon(data.version, s.img)} alt={s.name} title={s.name} width={size} height={size} loading="lazy" style={style} className={clsx("inline-block shrink-0 rounded", className)} />
  );
}

/** Finds a rune (or a rune tree, when the id is a style id) in the static data. */
export function useRuneLookup() {
  const { data } = useI18n();
  return (id: number): { name: string; icon: string; short?: string } | null => {
    if (!data) return null;
    for (const style of data.runes) {
      if (style.id === id) return { name: style.name, icon: style.icon };
      for (const slot of style.slots) for (const r of slot) if (r.id === id) return r;
    }
    return null;
  };
}

export function RuneIcon({ id, size = 24, className, dim }: { id: number; size?: number; className?: string; dim?: boolean }) {
  const lookup = useRuneLookup();
  const r = lookup(id);
  const style = { width: size, height: size };
  if (!r) return <span style={style} className={clsx("inline-block shrink-0 rounded-full bg-surface-tertiary", className)} />;
  return (
    <img
      src={runeIcon(r.icon)}
      alt={r.name}
      title={r.short ? `${r.name}\n${r.short}` : r.name}
      width={size}
      height={size}
      loading="lazy"
      style={style}
      className={clsx("inline-block shrink-0 rounded-full", dim && "opacity-25 grayscale", className)}
    />
  );
}

export function ShardIcon({ id, size = 18 }: { id: number; size?: number }) {
  const { data } = useI18n();
  const s = data?.shards[id];
  const style = { width: size, height: size };
  if (!s) return <span style={style} className="inline-block rounded-full bg-surface-tertiary" />;
  return <img src={s.icon} alt={s.name} title={s.name} width={size} height={size} loading="lazy" style={style} className="block rounded-full bg-surface" />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-fg-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-secondary border-t-accent" />
      {label}
    </div>
  );
}
