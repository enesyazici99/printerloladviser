"use client";

import useSWR from "swr";
import type { ChampionFile, DraftFile, FeedFile, MetaFile, StaticData } from "./types";

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const dataUrl = (rel: string) => `${BASE_PATH}/data/${rel}`;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const swrOpts = { revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false } as const;

export function useStatic(lang: "tr" | "en") {
  return useSWR<StaticData>(dataUrl(`static/${lang}.json`), fetchJson, { ...swrOpts, keepPreviousData: true });
}

export function useMeta() {
  return useSWR<MetaFile>(dataUrl("meta.json"), fetchJson, swrOpts);
}

export function useChampionFile(key: string | null | undefined) {
  return useSWR<ChampionFile>(key ? dataUrl(`champions/${key}.json`) : null, fetchJson, swrOpts);
}

export function useDraftFile() {
  return useSWR<DraftFile>(dataUrl("draft.json"), fetchJson, swrOpts);
}

export function useFeed() {
  return useSWR<FeedFile>(dataUrl("feed.json"), fetchJson, swrOpts);
}

// ── Riot static assets (Data Dragon CDN) ────────────────────────────────────
const DD = "https://ddragon.leagueoflegends.com";

export const champIcon = (version: string, key: string) => `${DD}/cdn/${version}/img/champion/${key}.png`;
export const champSplash = (key: string) => `${DD}/cdn/img/champion/splash/${key}_0.jpg`;
export const itemIcon = (version: string, id: number) => `${DD}/cdn/${version}/img/item/${id}.png`;
export const spellIcon = (version: string, img: string) => `${DD}/cdn/${version}/img/spell/${img}`;
export const passiveIcon = (version: string, img: string) => `${DD}/cdn/${version}/img/passive/${img}`;
export const runeIcon = (path: string) => `${DD}/cdn/img/${path}`;
