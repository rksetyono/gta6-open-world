# Sunset Bay — Open-World Crime

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/rksetyono/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/rksetyono/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01)

An original 3D open-world crime game built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01).
Dana Reyes is back in **Sunset Bay**, a sun-soaked fictional coastal city — six story missions,
a living city to explore on foot and by car, and the Sunset Bay PD never far behind.

## Play

Serve `game/` with any static server and open it in desktop Chrome — no network
needed, everything is local:

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse drag | Look around |
| E | Enter / steal a car |
| F | Punch |
| 1 | Draw pistol · Click to shoot · R reload |
| N | Start the next mission |
| Shift | Run · Space handbrake |
| Esc | Pause · M mute |

## What's in the city

- **A city to explore** — a 6×6 block grid with named landmarks (Meridian Bank,
  Sunset Docks, Coral Plaza, Vega Motors, Sunset General, the Reyes Hideout),
  a beach, palms, lamps and drifting clouds, all built procedurally at boot.
- **Traffic and pedestrians** — cars cruise the streets and turn at intersections;
  residents stroll the sidewalks and flee from gunfire and sirens.
- **Cars to steal and drive** — any parked or traffic car can be taken (the police
  notice), with arcade driving physics, plus a one-of-a-kind Comet GT to steal
  in mission 4.
- **Wanted level and police** — 0–5 stars; police cars chase and ram, foot officers
  shoot and try to arrest you. Lay low out of sight and the heat fades.
- **Missions and a story** — six chapters: a first errand, a getaway drive, a
  shakedown of three shops, a car theft, a turf war at Coral Plaza, and the big
  score at Meridian Bank. Taxi fares and hidden cash stashes fill the free roam.
- **Combat** — pistol with auto-aim and tracers, fists, rival gang members who
  shoot back, and BUSTED / WASTED endings with a fine and a respawn.
- **HUD with minimap** — wanted stars, health, cash, clock, mission objective,
  live minimap, speedometer and crosshair.
- **Save** — progress autosaves to localStorage; continue from the title screen.
- **Sound** — engine hum, two-tone sirens, gunshots and a synthwave loop, all
  synthesised with WebAudio. No audio files.

## Tech

- Three.js (vendored minified build under `game/vendor/`) + ES modules, no build step.
- Fixed 1/60 s simulation, deterministic staged screenshot scenes (`?shot=chase|street|mission|combat`).
- Screenshots are real renders of the game, taken in headless Chrome by
  `gta6-01-shots.mjs` (kept outside this repository).

## Entry

Built by an agent session recorded for make.fun. `main.ts` (Node 22, stdlib only)
copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the
vendored `vendor/makefun-game.ts` library.

MIT licensed. All city names, characters, vehicles, story, art, sounds and music
are original — nothing from any existing commercial game.
