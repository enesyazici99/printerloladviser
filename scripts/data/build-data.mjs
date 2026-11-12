#!/usr/bin/env node
// Builds every JSON file the static site reads (public/data/**) from the
// official Riot Games API: Challenger + Grandmaster solo-queue ladders,
// match-v5 results and match timelines (item purchase order, skill order).
//
//   node scripts/data/build-data.mjs [--platforms=kr,euw1,...] [--max-matches=3000]
//        [--max-minutes=N] [--players=400] [--days=14] [--full]
//        [--bootstrap=<published site url>] [--out=<dir>]
//
// Runs are incremental: the previous output (local, or the published site given
// with --bootstrap) is loaded first and only unseen matches are requested.
// --max-minutes makes a long run stop cleanly: what was collected is aggregated
// and written, the rest is picked up by the next run.
import path from "node:path";
import { createRiotClient, loadRiotKey, PLATFORM_REGION } from "./riot.mjs";
import { buildStatic } from "./static.mjs";
import { getJson, pLimit, readJsonFile, sleep, writeJsonFile, log } from "./util.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const OUT = path.resolve(typeof args.out === "string" ? args.out : "public/data");
const CACHE = path.resolve(".cache/data");
const BOOTSTRAP = typeof args.bootstrap === "string" ? args.bootstrap.replace(/\/$/, "") : null;
const FULL = Boolean(args.full);
// Four routing hosts, each with its own rate limit: asia (kr, jp1), europe (euw1, eun1, tr1),
// americas (na1, br1, la1, la2), sea (vn2, tw2, oc1).
const DEFAULT_PLATFORMS = "kr,euw1,na1,eun1,tr1,br1,jp1,vn2,tw2,oc1,la1,la2";
const PLATFORMS = (typeof args.platforms === "string" ? args.platforms : DEFAULT_PLATFORMS).split(",");
const MAX_MATCHES = Number(args["max-matches"] ?? 3000); // new matches per run (2 requests each)
const MAX_MINUTES = Number(args["max-minutes"] ?? Infinity); // stop collecting after this long
const MAX_PLAYERS = Number(args.players ?? 400); // highest-ranked players scanned per platform
const IDS_PER_PLAYER = 100; // the most the match-id endpoint returns per request
const LOOKBACK_DAYS = Number(args.days ?? 14);
const MAX_AGE_DAYS = 120; // feed rows older than this are dropped
const MAX_PER_CHAMPION = 600;
const STATS_PATCHES = 3; // draft/meta statistics use the newest N patches
const MIN_PAIR_GAMES = 3; // pairs with fewer games carry no signal after shrinkage
const OTP_MIN_GAMES = 8;
const OTP_SHARE = 0.6;

const ROLES = ["top", "jungle", "mid", "adc", "support"];
const POSITION_INDEX = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };

for (const p of PLATFORMS) if (!PLATFORM_REGION[p]) throw new Error(`Unknown platform "${p}"`);

/** Previous output: local file first, then the published site. */
async function loadPrev(rel) {
  if (FULL) return null;
  const local = await readJsonFile(path.join(OUT, rel));
  if (local) return local;
  if (BOOTSTRAP) {
    try {
      return await getJson(`${BOOTSTRAP}/data/${rel}`, { retries: 1 });
    } catch {
      return null;
    }
  }
  return null;
}

const patchNum = (p) => {
  const [a, b] = p.split(".").map(Number);
  return a * 1000 + b;
};
const playerKey = (platform, p) => `${platform}:${p.riotIdGameName}#${p.riotIdTagline}`;

/** Item purchases/sales and skill order per participantId from a match timeline. */
function readTimeline(timeline) {
  const items = {}; // participantId -> [[itemId, second, type]]  type 1 = bought, 2 = sold
  const skills = {};
  for (const frame of timeline?.info?.frames ?? []) {
    for (const e of frame.events ?? []) {
      const pid = e.participantId;
      if (!pid) continue;
      const sec = Math.round(e.timestamp / 1000);
      if (e.type === "ITEM_PURCHASED") (items[pid] ??= []).push([e.itemId, sec, 1]);
      else if (e.type === "ITEM_SOLD") (items[pid] ??= []).push([e.itemId, sec, 2]);
      else if (e.type === "ITEM_UNDO") {
        // beforeId -> afterId 0 undoes a purchase; beforeId 0 -> afterId undoes a sale.
        const list = (items[pid] ??= []);
        const [id, type] = e.afterId === 0 ? [e.beforeId, 1] : [e.afterId, 2];
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i][0] === id && list[i][2] === type) {
            list.splice(i, 1);
            break;
          }
        }
      } else if (e.type === "SKILL_LEVEL_UP" && e.levelUpType === "NORMAL") {
        skills[pid] = (skills[pid] ?? "") + ("QWER"[e.skillSlot - 1] ?? "");
      }
    }
  }
  return { items, skills };
}

/** One participant of a match -> compact feed record. */
function feedRecord(match, p, opponent, tl, ladderEntry, platform, staticItems) {
  const info = match.info;
  const styles = p.perks?.styles ?? [];
  const primary = styles.find((s) => s.description === "primaryStyle") ?? styles[0];
  const secondary = styles.find((s) => s.description === "subStyle") ?? styles[1];
  const stat = p.perks?.statPerks ?? {};
  const purchases = tl.items[p.participantId] ?? [];
  const completed = [];
  for (const [id, , type] of purchases) {
    if (type === 1 && staticItems[id]?.completed && !completed.includes(id)) completed.push(id);
  }
  return {
    id: match.metadata.matchId,
    t: Math.round((info.gameEndTimestamp ?? info.gameCreation) / 1000),
    d: info.gameDuration,
    v: info.gameVersion.split(".").slice(0, 2).join("."),
    reg: platform,
    w: p.win ? 1 : 0,
    role: ROLES[POSITION_INDEX[p.teamPosition]] ?? null,
    opp: opponent?.championId ?? 0,
    k: p.kills,
    de: p.deaths,
    a: p.assists,
    cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
    g: p.goldEarned,
    kp: p.challenges?.killParticipation != null ? Math.round(p.challenges.killParticipation * 100) : null,
    p: {
      n: p.riotIdGameName,
      tag: p.riotIdTagline,
      tier: ladderEntry.tier, // "C" challenger, "GM" grandmaster
      lp: ladderEntry.lp,
      otp: 0, // filled in after all rows are known
    },
    r: [primary?.style, secondary?.style, ...(primary?.selections ?? []).map((s) => s.perk), ...(secondary?.selections ?? []).map((s) => s.perk)],
    sh: [stat.offense, stat.flex, stat.defense].filter((x) => x != null),
    sp: [p.summoner1Id, p.summoner2Id],
    fb: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6],
    ci: completed,
    rbi: p.roleBoundItem ?? 0,
    so: tl.skills[p.participantId] ?? "",
    ip: purchases.flat(),
  };
}

/** Team compositions ordered top..support; rolesOk = 0 when positions are not clean. */
function compositions(info) {
  let rolesOk = 1;
  const order = (teamId) => {
    const team = info.participants.filter((p) => p.teamId === teamId);
    const slots = new Array(5).fill(0);
    for (const p of team) {
      const idx = POSITION_INDEX[p.teamPosition];
      if (idx == null || slots[idx]) rolesOk = 0;
      else slots[idx] = p.championId;
    }
    return { slots, raw: team.map((p) => p.championId), win: team[0]?.win ? 1 : 0 };
  };
  const blue = order(100);
  const red = order(200);
  if (blue.raw.length !== 5 || red.raw.length !== 5) return null;
  return rolesOk ? [blue.slots, red.slots, blue.win, 1] : [blue.raw, red.raw, blue.win, 0];
}

async function main() {
  const started = Date.now();
  const riot = createRiotClient(loadRiotKey());
  const stat = await buildStatic(OUT, CACHE);
  const champs = Object.values(stat.champions).sort((a, b) => a.key.localeCompare(b.key));

  // ── previous state ──────────────────────────────────────────────────────
  // db.m:  matchId -> [ts, patch, blueWin, rolesOk, [5 blue champs], [5 red champs]]
  // db.pl: "platform:name#tag" -> { championId: games }   (for one-trick detection)
  const db = (await loadPrev("db/matches.json")) ?? { m: {}, pl: {} };
  db.pl ??= {};
  const feeds = new Map(); // championId -> feed rows
  await Promise.all(
    champs.map(async (c) => {
      const prev = await loadPrev(`champions/${c.key}.json`);
      feeds.set(c.id, prev?.matches ?? []);
    })
  );
  log(`state: ${Object.keys(db.m).length} matches known`);

  // ── 1. ladders ──────────────────────────────────────────────────────────
  const ladder = new Map(); // puuid -> { platform, tier, lp }
  for (const platform of PLATFORMS) {
    for (const [tier, short] of [["challenger", "C"], ["grandmaster", "GM"]]) {
      const league = await riot.league(platform, tier);
      for (const e of league?.entries ?? []) {
        if (e.puuid) ladder.set(e.puuid, { platform, tier: short, lp: e.leaguePoints, games: e.wins + e.losses });
      }
    }
  }
  log(`ladder: ${ladder.size} Challenger/Grandmaster players on ${PLATFORMS.join(", ")}`);

  const scannedPlayers = [];
  // ── 2 + 3. scan players for new matches and process them as they are found ──
  // Requests of both kinds share each routing host's rate limit, so scanning and
  // processing are interleaved instead of scanning everything first.
  const startTime = Math.round(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
  const deadline = started + MAX_MINUTES * 60_000;
  const outOfTime = () => Date.now() > deadline;
  db.seen ??= {}; // puuid -> ranked games played when the player was last scanned completely

  const dirty = new Set();
  const flush = async () => {
    await writeJsonFile(path.join(OUT, "db", "matches.json"), db);
    for (const id of dirty) {
      const c = stat.champions[id];
      if (!c) continue;
      // Keep memory and files bounded during long runs; final retention happens in step 4.
      const rows = feeds.get(id).sort((a, b) => b.t - a.t).slice(0, MAX_PER_CHAMPION);
      feeds.set(id, rows);
      await writeJsonFile(path.join(OUT, "champions", `${c.key}.json`), { id, key: c.key, matches: rows, lane: {} });
    }
    dirty.clear();
  };

  let queued = 0;
  let done = 0;
  let skipped = 0;
  let deferred = 0; // found but not processed because the time budget ran out
  let scanned = 0;
  let unchanged = 0;
  const reasons = {}; // why matches were skipped, reported at the end
  const queuedIds = new Set();

  async function processMatch(platform, matchId) {
    if (outOfTime()) {
      deferred++;
      return;
    }
    try {
      const match = await riot.match(platform, matchId);
      const info = match?.info;
      const comps = info ? compositions(info) : null;
      const valid = info && info.queueId === 420 && info.gameDuration >= 600 && !info.participants[0]?.gameEndedInEarlySurrender && comps;
      if (!valid) {
        skipped++;
        const why = !info ? "match not found" : info.queueId !== 420 ? "other queue" : !comps ? "incomplete teams" : "remake or too short";
        reasons[why] = (reasons[why] ?? 0) + 1;
        if (info) db.m[matchId] = null; // remember remakes so they are not requested again
      } else {
        const tracked = info.participants.filter((p) => ladder.has(p.puuid));
        const tl = tracked.length ? readTimeline(await riot.timeline(platform, matchId)) : { items: {}, skills: {} };
        const ts = Math.round((info.gameEndTimestamp ?? info.gameCreation) / 1000);
        const patch = info.gameVersion.split(".").slice(0, 2).join(".");
        db.m[matchId] = [ts, patch, comps[2], comps[3], comps[0], comps[1]];
        for (const p of info.participants) {
          const counts = (db.pl[playerKey(platform, p)] ??= {});
          counts[p.championId] = (counts[p.championId] ?? 0) + 1;
        }
        for (const p of tracked) {
          const opponent = info.participants.find((o) => o.teamId !== p.teamId && o.teamPosition === p.teamPosition && p.teamPosition);
          const rec = feedRecord(match, p, opponent, tl, ladder.get(p.puuid), platform, stat.items);
          const mine = p.teamId === 100 ? 0 : 1;
          rec.tm = comps[mine];
          rec.en = comps[1 - mine];
          rec.ro = comps[3];
          const list = feeds.get(p.championId);
          if (list && !list.some((m) => m.id === rec.id && m.p.n === rec.p.n)) {
            list.push(rec);
            dirty.add(p.championId);
          }
        }
      }
    } catch (err) {
      if (err.code === "RIOT_KEY") throw err; // key no longer accepted: stop, do not retry
      skipped++;
      const why = `error: ${String(err?.message ?? err).slice(0, 80)}`;
      reasons[why] = (reasons[why] ?? 0) + 1;
    }
    if (++done % 500 === 0) {
      log(`matches: ${done} processed, ${queued - done - deferred} waiting (${skipped} skipped, ${riot.requestCount} requests, ${Math.round((Date.now() - started) / 60000)} min)`);
      await flush();
    }
  }

  // Two workers per platform keep every routing host busy; the client spaces each host's requests.
  const tasks = [];
  let fatal = null;
  await Promise.all(
    PLATFORMS.map(async (platform) => {
      const limit = pLimit(2);
      let waiting = 0;
      let mine = 0; // matches queued for this platform
      // No single server may use up the whole budget before the others have been looked at.
      const platformCap = Math.ceil((MAX_MATCHES / PLATFORMS.length) * 2);
      const players = [...ladder.entries()]
        .filter(([, e]) => e.platform === platform)
        .sort((a, b) => b[1].lp - a[1].lp)
        .slice(0, MAX_PLAYERS);
      for (const [puuid, entry] of players) {
        if (queued >= MAX_MATCHES || mine >= platformCap || outOfTime() || fatal) break;
        // A player whose ranked game count has not moved since the last complete scan has nothing new.
        if (!FULL && db.seen[puuid] === entry.games) {
          unchanged++;
          continue;
        }
        let ids;
        try {
          ids = (await riot.matchIds(platform, puuid, { count: IDS_PER_PLAYER, startTime })) ?? [];
        } catch (err) {
          fatal ??= err;
          break;
        }
        scanned++;
        let complete = true;
        for (const id of ids) {
          if (id in db.m || queuedIds.has(id)) continue; // known (including remembered remakes) or already queued
          if (queued >= MAX_MATCHES || mine >= platformCap) {
            complete = false;
            break;
          }
          queuedIds.add(id);
          queued++;
          mine++;
          waiting++;
          tasks.push(
            limit(() => processMatch(platform, id).finally(() => waiting--)).catch((err) => {
              fatal ??= err; // e.g. the key was rejected: reported once, after everything has settled
            })
          );
        }
        if (complete) scannedPlayers.push([puuid, entry.games]);
        // Do not let the scan run far ahead of the processing.
        while (waiting > 150 && !outOfTime() && !fatal) await sleep(3000);
      }
    })
  );
  await Promise.all(tasks);
  // A key that expires in the middle of a long run should not throw away what was
  // already collected: keep it, say so, and let the next run fail at its first request.
  const keyLost = fatal?.code === "RIOT_KEY" && done - skipped > 0;
  if (fatal && !keyLost) throw fatal;
  // Remember scanned players only when everything they led to was processed;
  // otherwise the next run has to look at them again.
  if (deferred === 0 && !keyLost) for (const [puuid, games] of scannedPlayers) db.seen[puuid] = games;
  for (const puuid of Object.keys(db.seen)) if (!ladder.has(puuid)) delete db.seen[puuid];
  log(
    `players: ${scanned} scanned, ${unchanged} unchanged · matches: ${done - skipped} added, ${skipped} skipped, ${deferred} left for the next run`,
    skipped ? JSON.stringify(reasons) : ""
  );

  // ── 4. retention, one-trick flags ───────────────────────────────────────
  const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 86400;
  const otpChampion = (platform, name, tag) => {
    const counts = db.pl[`${platform}:${name}#${tag}`];
    if (!counts) return 0;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total < OTP_MIN_GAMES) return 0;
    const [id, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return n / total >= OTP_SHARE ? Number(id) : 0;
  };
  const referenced = new Set();
  for (const c of champs) {
    const rows = (feeds.get(c.id) ?? [])
      .filter((m) => m.t >= cutoff)
      .sort((a, b) => b.t - a.t)
      .slice(0, MAX_PER_CHAMPION);
    for (const m of rows) {
      m.p.otp = otpChampion(m.reg, m.p.n, m.p.tag) === c.id ? 1 : 0;
      referenced.add(m.id);
    }
    feeds.set(c.id, rows);
  }
  const patchesAll = [...new Set(Object.values(db.m).filter(Boolean).map((r) => r[1]))].sort((a, b) => patchNum(b) - patchNum(a));
  const statPatches = new Set(patchesAll.slice(0, STATS_PATCHES));
  for (const [id, row] of Object.entries(db.m)) {
    const old = row ? !statPatches.has(row[1]) : false;
    if (row === null ? false : old && !referenced.has(id)) delete db.m[id];
  }
  await writeJsonFile(path.join(OUT, "db", "matches.json"), db);

  // ── 5. statistics from the match database (newest patches only) ─────────
  const base = {}; // champion -> role index -> [games, wins]
  const matchup = new Map(); // "a.ra.b.rb" (a<b) -> [games, wins of a]
  const duo = new Map(); // "a.ra.b.rb" (a<b) -> [games, wins]
  let statMatches = 0;
  const bump = (map, a, ra, b, rb, winA) => {
    const swap = a > b;
    const key = swap ? `${b}.${rb}.${a}.${ra}` : `${a}.${ra}.${b}.${rb}`;
    let e = map.get(key);
    if (!e) map.set(key, (e = [0, 0]));
    e[0]++;
    if (swap ? !winA : winA) e[1]++;
  };
  for (const row of Object.values(db.m)) {
    if (!row) continue;
    const [, patch, blueWin, rolesOk, blue, red] = row;
    if (!rolesOk || !statPatches.has(patch)) continue;
    statMatches++;
    for (const [team, won] of [[blue, blueWin === 1], [red, blueWin === 0]]) {
      for (let r = 0; r < 5; r++) {
        const e = ((base[team[r]] ??= {})[r] ??= [0, 0]);
        e[0]++;
        if (won) e[1]++;
        // A duo wins or loses together, so "winA" is simply the team result for both orientations.
        for (let r2 = r + 1; r2 < 5; r2++) {
          const swap = team[r] > team[r2];
          const key = swap ? `${team[r2]}.${r2}.${team[r]}.${r}` : `${team[r]}.${r}.${team[r2]}.${r2}`;
          let d = duo.get(key);
          if (!d) duo.set(key, (d = [0, 0]));
          d[0]++;
          if (won) d[1]++;
        }
      }
    }
    for (let r = 0; r < 5; r++) for (let r2 = 0; r2 < 5; r2++) bump(matchup, blue[r], r, red[r2], r2, blueWin === 1);
  }
  // With a large sample, pairs seen only a handful of times carry no signal after
  // shrinkage; dropping them keeps draft.json at a few megabytes.
  const minPairGames = Math.max(MIN_PAIR_GAMES, Math.ceil(statMatches / 15000));
  const flat = (map) => {
    const out = [];
    for (const [key, [g, w]] of map) {
      if (g < minPairGames) continue;
      const [a, ra, b, rb] = key.split(".").map(Number);
      out.push(a, ra, b, rb, g, w);
    }
    return out;
  };
  const patches = [...statPatches].sort((a, b) => patchNum(b) - patchNum(a));
  const draft = { generatedAt: new Date().toISOString(), patches, matches: statMatches, base, matchups: flat(matchup), duos: flat(duo) };
  await writeJsonFile(path.join(OUT, "draft.json"), draft);
  log(`draft stats: ${statMatches} matches, ${draft.matchups.length / 6} matchup pairs, ${draft.duos.length / 6} duo pairs`);

  // ── 6. champion files, home feed, meta ──────────────────────────────────
  const players = new Set(); // distinct tracked players, reported in meta.json
  const feedAll = [];
  for (const c of champs) {
    const matches = feeds.get(c.id) ?? [];
    for (const m of matches) {
      players.add(`${m.reg}:${m.p.n}#${m.p.tag}`);
      feedAll.push({ c: c.id, m });
    }
    // Lane matchups for the champion page (same-role opponents).
    const lane = {};
    for (const [key, [g, w]] of matchup) {
      const [a, ra, b, rb] = key.split(".").map(Number);
      if (ra !== rb || g < MIN_PAIR_GAMES) continue;
      if (a === c.id) (lane[ROLES[ra]] ??= []).push([b, g, w]);
      else if (b === c.id) (lane[ROLES[ra]] ??= []).push([a, g, g - w]);
    }
    await writeJsonFile(path.join(OUT, "champions", `${c.key}.json`), { id: c.id, key: c.key, updated: new Date().toISOString(), matches, lane });
  }

  feedAll.sort((a, b) => b.m.t - a.m.t);
  const latest = feedAll.slice(0, 60).map(({ c, m }) => ({ c, ...m }));
  await writeJsonFile(path.join(OUT, "feed.json"), { matches: latest });

  const summary = {};
  for (const c of champs) {
    const matches = feeds.get(c.id) ?? [];
    summary[c.id] = {
      feed: matches.length,
      feedWins: matches.reduce((s, m) => s + m.w, 0),
      last: matches[0]?.t ?? 0,
      roles: base[c.id] ? Object.fromEntries(Object.entries(base[c.id]).map(([r, v]) => [ROLES[r], v])) : {},
    };
  }
  await writeJsonFile(path.join(OUT, "meta.json"), {
    generatedAt: new Date().toISOString(),
    ddragon: stat.version,
    platforms: PLATFORMS,
    patches,
    matches: statMatches,
    feedRows: feedAll.length,
    players: players.size,
    champions: summary,
  });

  log(`done in ${Math.round((Date.now() - started) / 1000)}s — ${riot.requestCount} Riot requests, ${feedAll.length} feed rows, ${statMatches} matches in stats`);
  if (keyLost) {
    const note = "The Riot API key was rejected during this run. What had been collected was saved; renew the key (npm run key:push) for the next refresh.";
    console.log(process.env.GITHUB_ACTIONS ? `::warning::${note}` : `WARNING: ${note}`);
  }
}

main().catch((err) => {
  console.error(err.code === "RIOT_KEY" ? err.message : err);
  process.exit(1);
});
