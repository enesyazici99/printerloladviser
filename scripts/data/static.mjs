// Static game data (champions, items, runes, spells) from Riot Data Dragon and
// CommunityDragon, trimmed to what the site renders.
import path from "node:path";
import { getJson, pLimit, readJsonFile, writeJsonFile, log } from "./util.mjs";

const DD = "https://ddragon.leagueoflegends.com";
const CD = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default";

export const LOCALES = { en: "en_US", tr: "tr_TR" };

const stripHtml = (s) =>
  (s ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** CommunityDragon asset path -> public URL. */
const cdAsset = (p) => `${CD}${p.replace("/lol-game-data/assets", "").toLowerCase()}`;

async function championExtras(champIds, cacheDir) {
  const limit = pLimit(8);
  const out = {};
  await Promise.all(
    champIds.map((id) =>
      limit(async () => {
        const cacheFile = path.join(cacheDir, `${id}.json`);
        let c = await readJsonFile(cacheFile);
        if (!c) {
          try {
            const raw = await getJson(`${CD}/v1/champions/${id}.json`);
            c = {
              dmg: raw?.tacticalInfo?.damageType ?? null,
              style: raw?.playstyleInfo ?? null,
              roles: raw?.roles ?? [],
            };
            await writeJsonFile(cacheFile, c);
          } catch {
            c = { dmg: null, style: null, roles: [] };
          }
        }
        out[id] = c;
      })
    )
  );
  return out;
}

function damageType(extra, ddChamp) {
  const t = extra?.dmg;
  if (t === "kPhysical") return "ad";
  if (t === "kMagic") return "ap";
  if (t === "kMixed") return "mixed";
  // Fallback from Data Dragon's coarse ratings.
  return ddChamp.info.magic > ddChamp.info.attack ? "ap" : "ad";
}

export async function buildStatic(outDir, cacheDir) {
  const versions = await getJson(`${DD}/api/versions.json`);
  const version = versions[0];
  log(`static: Data Dragon ${version}`);

  const perks = (await getJson(`${CD}/v1/perks.json`)) ?? [];
  const shardIcons = {};
  for (const p of perks) if (p.id >= 5000 && p.id < 5100) shardIcons[p.id] = { name: p.name, icon: cdAsset(p.iconPath) };

  let champIndex = null; // language independent info, built from the first locale
  let itemFlags = null;

  for (const [lang, locale] of Object.entries(LOCALES)) {
    const base = `${DD}/cdn/${version}/data/${locale}`;
    const [champFull, items, runes, spells] = await Promise.all([
      getJson(`${base}/championFull.json`),
      getJson(`${base}/item.json`),
      getJson(`${base}/runesReforged.json`),
      getJson(`${base}/summoner.json`),
    ]);

    if (!champIndex) {
      const ids = Object.values(champFull.data).map((c) => Number(c.key));
      const extras = await championExtras(ids, path.join(cacheDir, "cdragon", version));
      champIndex = {};
      for (const c of Object.values(champFull.data)) {
        const id = Number(c.key);
        const ex = extras[id];
        champIndex[id] = {
          dmg: damageType(ex, c),
          style: ex?.style
            ? {
                damage: ex.style.damage ?? 0,
                durability: ex.style.durability ?? 0,
                cc: ex.style.crowdControl ?? 0,
                mobility: ex.style.mobility ?? 0,
                utility: ex.style.utility ?? 0,
              }
            : null,
          ranged: c.stats.attackrange >= 325,
        };
      }
    }

    const champions = {};
    for (const c of Object.values(champFull.data)) {
      const id = Number(c.key);
      champions[id] = {
        id,
        key: c.id,
        name: c.name,
        title: c.title,
        tags: c.tags,
        ...champIndex[id],
        spells: c.spells.map((s) => ({ name: s.name, img: s.image.full })),
        passive: { name: c.passive.name, img: c.passive.image.full },
      };
    }

    if (!itemFlags) {
      itemFlags = {};
      for (const [id, it] of Object.entries(items.data)) {
        const tags = it.tags ?? [];
        const boots = tags.includes("Boots");
        const trinket = tags.includes("Trinket") || tags.includes("Vision") && it.gold.total === 0;
        const consumable = tags.includes("Consumable");
        const terminal = !it.into || it.into.length === 0;
        itemFlags[id] = {
          boots,
          trinket,
          consumable,
          // "completed" = an item you finish building: no upgrades left and not a cheap component.
          // Tier-2 boots count as completed even though they can later be upgraded for free.
          completed: !consumable && !trinket && ((terminal && it.gold.total >= 1500) || (boots && it.gold.total >= 700)),
        };
      }
      // Tier-3 boots are upgrades of exactly one tier-2 boot (some lack the "Boots" tag):
      // flag them as boots and remember the base so statistics can group both tiers.
      for (const [id, it] of Object.entries(items.data)) {
        const from = it.from ?? [];
        if (from.length === 1 && itemFlags[from[0]]?.boots && items.data[from[0]].gold.total >= 700) {
          itemFlags[id] = { ...itemFlags[id], boots: true, completed: true, base: Number(from[0]) };
        }
      }
    }

    const itemsOut = {};
    for (const [id, it] of Object.entries(items.data)) {
      if (it.maps && it.maps["11"] === false && !it.gold?.purchasable) continue;
      const f = itemFlags[id] ?? {};
      itemsOut[id] = {
        name: it.name,
        plain: it.plaintext || stripHtml(it.description).slice(0, 160),
        gold: it.gold.total,
        tags: it.tags ?? [],
        ...(f.boots ? { boots: 1 } : {}),
        ...(f.trinket ? { trinket: 1 } : {}),
        ...(f.consumable ? { consumable: 1 } : {}),
        ...(f.completed ? { completed: 1 } : {}),
        ...(f.base ? { base: f.base } : {}),
      };
    }

    const runesOut = runes.map((style) => ({
      id: style.id,
      key: style.key,
      name: style.name,
      icon: style.icon,
      slots: style.slots.map((slot) =>
        slot.runes.map((r) => ({ id: r.id, name: r.name, icon: r.icon, short: stripHtml(r.shortDesc).slice(0, 220) }))
      ),
    }));

    const spellsOut = {};
    for (const s of Object.values(spells.data)) {
      spellsOut[Number(s.key)] = { key: s.id, name: s.name, img: s.image.full };
    }

    await writeJsonFile(path.join(outDir, "static", `${lang}.json`), {
      version,
      champions,
      items: itemsOut,
      runes: runesOut,
      shards: shardIcons,
      spells: spellsOut,
    });
  }

  const en = await readJsonFile(path.join(outDir, "static", "en.json"));
  return { version, champions: en.champions, items: en.items };
}
