#!/usr/bin/env node
// Copies RIOT_API_KEY from .env.local into the repository's GitHub Actions
// secret, so the scheduled data refresh uses the same key. The key is piped to
// the GitHub CLI and never printed.
//
//   npm run key:push
import { spawnSync } from "node:child_process";
import { loadRiotKey } from "./data/riot.mjs";

const key = loadRiotKey();
if (!/^RGAPI-[0-9a-f-]{36}$/i.test(key)) {
  console.error("RIOT_API_KEY in .env.local is missing or does not look like a Riot key (RGAPI-…).");
  process.exit(1);
}

// Check the key before storing it: a rejected key would only make the next refresh fail.
const res = await fetch("https://euw1.api.riotgames.com/lol/status/v4/platform-data", { headers: { "X-Riot-Token": key } });
if (res.status === 401 || res.status === 403) {
  console.error(`Riot rejected this key (HTTP ${res.status}). A new key can take a minute to become active — try again shortly.`);
  process.exit(1);
}

const out = spawnSync("gh", ["secret", "set", "RIOT_API_KEY"], { input: key, stdio: ["pipe", "inherit", "inherit"] });
if (out.status !== 0) process.exit(out.status ?? 1);
console.log("RIOT_API_KEY secret updated. Start a refresh now with: gh workflow run refresh-data.yml");
