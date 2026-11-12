import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { ChampionFile, DraftFile, MetaFile, StaticData } from "../../lib/types";

/** Loads the same JSON the page reads, so expectations are computed from the published data. */
export async function loadJson<T>(request: APIRequestContext, rel: string): Promise<T> {
  const res = await request.get(`data/${rel}`);
  expect(res.ok(), `data/${rel} should load`).toBeTruthy();
  return res.json();
}

export const loadStatic = (r: APIRequestContext, lang = "tr") => loadJson<StaticData>(r, `static/${lang}.json`);
export const loadMeta = (r: APIRequestContext) => loadJson<MetaFile>(r, "meta.json");
export const loadDraft = (r: APIRequestContext) => loadJson<DraftFile>(r, "draft.json");
export const loadChampion = (r: APIRequestContext, key: string) => loadJson<ChampionFile>(r, `champions/${key}.json`);

/** The champion with the most feed rows: a page that exercises every feature. */
export async function busiestChampion(request: APIRequestContext) {
  const [meta, stat] = await Promise.all([loadMeta(request), loadStatic(request)]);
  const [id] = Object.entries(meta.champions).sort((a, b) => b[1].feed - a[1].feed)[0];
  const champ = stat.champions[id];
  return { champ, file: await loadChampion(request, champ.key), stat, meta };
}

/** Fails the test on uncaught page errors or failed same-origin requests. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (res) => {
    // Only the site's own files count; third-party image hosts are outside our control.
    const sameOrigin = page.url().startsWith("http") && new URL(res.url()).origin === new URL(page.url()).origin;
    if (res.status() >= 400 && sameOrigin) errors.push(`${res.status()} ${res.url()}`);
  });
  return errors;
}

export const pctText = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
