# printerloladviser

Pro builds and a draft assistant for League of Legends, built only from
Challenger / Grandmaster solo-queue games (one-trick players are flagged).

- **Pro builds** — per champion: win rate, roles, rune builds, boots, popular
  items, summoner spells, skill priority, starting items, core item order and a
  feed of individual games. Every game expands into the full rune page, the
  completed items, the item purchase history minute by minute, the skill order
  and both teams. Filters: role, server, Challenger-only, OTP-only, opponent,
  wins only.
- **Draft assistant** — enter both teams and bans (or sync them from the League
  client) and get ranked picks for your role with the reasons (base strength,
  each enemy matchup, each ally synergy, blind-pick risk), ban suggestions, a
  draft-only win chance, composition warnings, and a build for this exact game:
  the champion's pro games are weighted by lane opponent and enemy team
  similarity before they are summarised.
- **Meta** — pick rate, win rate and tier per role.

Turkish and English UI. The site is a static export; there is no server.

**Live:** https://ygappstudio.com/printerloladviser/

## How it works

```
Riot API ──> scripts/data/build-data.mjs ──> public/data/*.json ──> next build (static) ──> GitHub Pages
```

`scripts/data/build-data.mjs` reads the Challenger and Grandmaster ladders
(league-v4), their recent ranked games (match-v5) and the match timelines (item
purchases, skill order), and writes:

| file | content |
| --- | --- |
| `static/{tr,en}.json` | champions, items, runes, spells (Data Dragon / CommunityDragon) |
| `champions/<Key>.json` | feed rows of that champion + lane matchups |
| `draft.json` | games/wins per champion-role, matchup pairs, duo pairs (newest 3 patches) |
| `meta.json`, `feed.json` | summaries for the home and meta pages |
| `db/matches.json` | pipeline state (seen matches); not published |

Runs are incremental. The client spaces requests per routing host to stay under
the API's rate limit, waits as long as a `Retry-After` says, and stops when the
key is rejected.

Draft scoring (`lib/draft/engine.ts`) follows the open-source DraftGap idea:
ratings for champions, matchups and duos, with small samples shrunk towards
what the champions' own ratings predict.

## Development

```bash
npm install
# RIOT_API_KEY=... in .env.local (developer.riotgames.com)
npm run data -- --max-matches=600   # collect data into public/data
npm run dev                         # http://localhost:3000

npm test            # unit tests (vitest)
npm run build       # static export into out/
npm run test:e2e    # Playwright against the export
```

## Deployment

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`, and refreshes the data four times a day. The last good data
snapshot is kept as a single commit on the `data` branch, so a deploy never
depends on the Riot API being reachable.

The scheduled refresh needs a repository secret `RIOT_API_KEY`. A development
key expires after 24 hours; with an expired key the refresh step is skipped and
the site keeps the previous snapshot. A personal or production key removes that
limit.

## Live draft sync

Riot's public API does not expose champion select, so the board is filled either
by hand, or from the local client:

- **Browser (Chrome/Edge, beta)** — connect the folder
  `Riot Games/League of Legends/Logs/LeagueClient Logs`; the newest client log is
  read locally every two seconds and the champion-select session in it is applied.
- **Desktop app (`src-tauri/`)** — a Tauri shell that reads the client's local
  API and loads the published site.

printerloladviser isn't endorsed by Riot Games and doesn't reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
League of Legends.
