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

`scripts/data/build-data.mjs` reads the Challenger and Grandmaster ladders of
twelve servers (league-v4), their recent ranked games (match-v5) and the match
timelines (item purchases, skill order), and writes:

| file | content |
| --- | --- |
| `static/{tr,en}.json` | champions, items, runes, spells (Data Dragon / CommunityDragon) |
| `champions/<Key>.json` | feed rows of that champion + lane matchups |
| `draft.json` | games/wins per champion-role, matchup pairs, duo pairs (newest 3 patches) |
| `meta.json`, `feed.json` | summaries for the home and meta pages |
| `db/matches.json` | pipeline state (seen matches); not published |

Runs are incremental: known matches are never requested again and players
whose ranked game count has not changed are skipped. The client spaces requests
per routing host to stay under the API's rate limit (100 requests per two
minutes on each of `asia`, `europe`, `americas`, `sea`), waits as long as a
`Retry-After` says, and stops when the key is rejected. At that limit one key
collects about 75 matches a minute.

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

Two workflows keep the site current:

- **`refresh-data.yml`** — every six hours (and on demand) it restores the last
  data snapshot, collects new matches for up to 4.5 hours, saves the snapshot
  and starts a deploy. Only one refresh runs at a time.
- **`deploy.yml`** — on every push to `main` and after each refresh: restores
  the snapshot, runs lint, type check and unit tests, builds, publishes to
  GitHub Pages.

The snapshot is a single file attached to the `data-snapshot` release
(`scripts/ci/snapshot.sh`), so a deploy never depends on the Riot API being
reachable and the git history does not grow with data.

```bash
gh workflow run refresh-data.yml                      # collect now (defaults: 40000 matches, 270 minutes)
gh workflow run refresh-data.yml -f max_minutes=30    # a short run
```

The refresh needs the repository secret `RIOT_API_KEY`. A development key
expires after 24 hours; from then on the refresh workflow fails and the site
keeps the last snapshot. After putting a new key into `.env.local`:

```bash
npm run key:push    # checks the key and stores it as the Actions secret
```

A personal or production key from Riot removes the daily renewal. Do not run
`npm run data` locally while a refresh workflow is running: both would share
the same rate limit.

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
