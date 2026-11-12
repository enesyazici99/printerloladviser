import type { Lang } from "./i18n";
import { translate } from "./i18n";

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const signed = (x: number, digits = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`;

export function kdaRatio(k: number, d: number, a: number): string {
  if (d === 0) return k + a > 0 ? "Perfect" : "0.00";
  return ((k + a) / d).toFixed(2);
}

export function duration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(unixSeconds: number, lang: Lang, now = Date.now()): string {
  const minutes = Math.max(1, Math.round((now / 1000 - unixSeconds) / 60));
  if (minutes < 60) return translate(lang, "common.ago.m", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return translate(lang, "common.ago.h", { n: hours });
  return translate(lang, "common.ago.d", { n: Math.round(hours / 24) });
}

export const SERVER_LABEL: Record<string, string> = { kr: "KR", euw1: "EUW", na1: "NA", eun1: "EUNE", tr1: "TR", br1: "BR", jp1: "JP" };
