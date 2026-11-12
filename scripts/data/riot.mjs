// Minimal Riot Games API client for the data pipeline.
//
// Access rules this client follows:
//  - The key comes from RIOT_API_KEY (environment or .env.local) and is never logged.
//  - Requests to one host are serialised and spaced so the app limit
//    (100 requests / 2 minutes per routing host) is never reached.
//  - A 429 is answered by waiting exactly as long as Riot's Retry-After says.
//  - 401/403 means the key is not accepted: the run stops, nothing is retried.
import fs from "node:fs";
import { sleep } from "./util.mjs";

export const PLATFORM_REGION = {
  kr: "asia",
  jp1: "asia",
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
  me1: "europe",
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  oc1: "sea",
  sg2: "sea",
  tw2: "sea",
  vn2: "sea",
};

const MIN_GAP_MS = 1300; // 120s / 1.3s ≈ 92 requests per 2 minutes per host

export class RiotKeyError extends Error {
  constructor(status) {
    super(
      `Riot API rejected the key (HTTP ${status}). Development keys expire after 24 hours — ` +
        `generate a new one at developer.riotgames.com and put it in .env.local as RIOT_API_KEY.`
    );
    this.code = "RIOT_KEY";
  }
}

export function loadRiotKey() {
  if (process.env.RIOT_API_KEY) return process.env.RIOT_API_KEY.trim();
  try {
    const line = fs
      .readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("RIOT_API_KEY="));
    return line ? line.slice("RIOT_API_KEY=".length).trim() : "";
  } catch {
    return "";
  }
}

export function createRiotClient(key) {
  if (!key) throw new RiotKeyError("missing");
  const chains = new Map(); // host -> promise of the previous request slot
  let stopped = null;
  let requests = 0;

  const slot = (host) => {
    const prev = chains.get(host) ?? Promise.resolve();
    const next = prev.then(() => sleep(MIN_GAP_MS));
    chains.set(host, next);
    return prev; // first caller goes immediately, later ones wait their turn
  };

  async function get(host, pathAndQuery) {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (stopped) throw stopped;
      await slot(host);
      if (stopped) throw stopped;
      let res;
      try {
        requests++;
        res = await fetch(`https://${host}.api.riotgames.com${pathAndQuery}`, {
          headers: { "X-Riot-Token": key },
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        await sleep(3000 * (attempt + 1)); // network hiccup
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        stopped = new RiotKeyError(res.status);
        throw stopped;
      }
      if (res.status === 404) return null;
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after") ?? 10);
        await sleep((wait + 1) * 1000);
        continue;
      }
      if (res.status >= 500) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Riot API HTTP ${res.status} for ${pathAndQuery.split("?")[0]}`);
      return res.json();
    }
    throw new Error(`Riot API: gave up on ${pathAndQuery.split("?")[0]} after repeated rate-limit/server responses`);
  }

  return {
    get requestCount() {
      return requests;
    },
    /** Challenger / Grandmaster solo-queue ladder for a platform. */
    league: (platform, tier) => get(platform, `/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`),
    /** Recent ranked solo match ids of a player. */
    matchIds: (platform, puuid, { count = 20, startTime } = {}) =>
      get(
        PLATFORM_REGION[platform],
        `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&type=ranked&start=0&count=${count}` +
          (startTime ? `&startTime=${startTime}` : "")
      ),
    match: (platform, matchId) => get(PLATFORM_REGION[platform], `/lol/match/v5/matches/${matchId}`),
    timeline: (platform, matchId) => get(PLATFORM_REGION[platform], `/lol/match/v5/matches/${matchId}/timeline`),
  };
}
