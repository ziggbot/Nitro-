# NITRO.IO 🏎️🔥

**▶ Play it now: https://ziggbot.github.io/Nitro-/**

A modern arena driving game — a tribute to **Nitro** (Psygnosis, 1990, Amiga) fused with the
grow-and-survive gameplay of **snake.io**.

Drift a neon car through a huge arena, collect fuel orbs that grow a blazing **nitro trail**
behind you, and cut off rivals so they explode against it. Boost to escape or attack — but
boosting **burns your trail down** and guzzles fuel, and when the tank runs dry, your run is
over. Just like 1990.

## How to play

| Input | Action |
| --- | --- |
| Mouse / touch | Car chases the pointer |
| Hold click / touch / SPACE | Boost (burns trail + fuel) |
| WASD / arrows | Classic steering |
| ESC | Abandon the run (banks rewards) |

**One rule:** never touch another car's trail, the walls, or an empty fuel gauge.

## Features

- **Nitro DNA** — arcade drift handling, a fuel clock that never stops, oil slicks that spin
  you out, cones, potholes, and a pit-stop garage with the classic upgrade list (speed,
  acceleration, traction, tank, armor) across 3 car classes: Sports Car, Race Car, Turbo Buggy.
- **snake.io DNA** — eat orbs to grow, boost-to-burn risk/reward, wreck feasts, 15 named AI
  rivals, a live round leaderboard and kill feed.
- **Long-arc progression** — driver XP levels, run trophies (★★★) that unlock 6 arenas across
  4 environments (City → Forest → Desert → Toxic Wasteland), **night arenas** lit only by your
  headlights at double rewards, 3 daily missions + a weekly challenge, and earned-only
  cosmetics: 7 paints and 5 trail styles unlocked by achievements and play streaks.
- **Zero binary assets** — all art is hand-authored SVG + procedural canvas textures on a
  single synthwave palette; all sound is synthesized live with WebAudio.

## Multiplayer

**Ghost challenges (live now):** finish a race and hit *Challenge a friend* — the whole run
is compressed into a share link (`#ghost=...`, no server needed). Your friend opens the
link and races your translucent ghost; beat the time, send back a new link.

**Toward live multiplayer:** car input flows through the `Driver` interface and `CarSim`
is deterministic and Phaser-free, so real-time play needs only a `NetworkDriver` feeding
remote inputs plus a small WebSocket room server (e.g. Node + `ws` on Fly/Railway) that
relays inputs and periodic state snapshots. The ghost wire format in `src/game/ghost.ts`
doubles as the starting point for state serialization.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (simulation, progression, missions, saves)
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the production build
node scripts/smoke.mjs  # headless-browser smoke test against the preview server
```

Built with [Phaser 3](https://phaser.io), TypeScript and Vite. Deployed to GitHub Pages by
`.github/workflows/deploy.yml` on pushes to `main` or the default branch (the `github-pages`
environment only accepts deployments from the repo's default branch).

## Architecture notes

- `src/game/CarSim.ts` is a pure, Phaser-free simulation (unit-tested) — car input flows
  through the `Driver` interface (`PlayerDriver`, `BotDriver`), so a future `NetworkDriver`
  for real multiplayer plugs in without a rewrite.
- `src/config/arenas.ts` levels carry `type: 'arena' | 'track'` and optional waypoints,
  reserved for the planned **Racing Tournament mode** (championship races with laps,
  qualification and Nitro's between-race pit stop) sharing the same garage and progression.
- Saves are versioned JSON in localStorage with a migration path (`src/meta/SaveGame.ts`).
