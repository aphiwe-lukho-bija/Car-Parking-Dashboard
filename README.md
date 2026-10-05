# Apex Park — Real-Time Smart Parking Operations

A production-shaped parking facility management platform: a **React + Three.js**
operator dashboard driven by a **Express + MySQL** backend, with vehicles that
physically drive onto the lot, park, and drive away again in real time.

Every number on screen comes from the database. Nothing is mocked in the UI.

![stack](https://img.shields.io/badge/React_19-Vite-informational) ![stack](https://img.shields.io/badge/Three.js-R3F-black) ![stack](https://img.shields.io/badge/MySQL-4479A1) ![stack](https://img.shields.io/badge/Express-4-000)

---

## What it does

| Capability | Detail |
| --- | --- |
| **Live 3D lot** | 46 procedurally modelled bays across four zones (cars, SUVs, motorbikes, trucks) |
| **Real vehicle movement** | Vehicles spawn off-site, drive through the gate, turn into a service lane and reverse into a bay — then reverse the route on exit |
| **Real-time sync** | WebSocket push of arrivals, departures and rolling stats with exponential-backoff reconnect |
| **Correct billing** | Per-**calendar-day** fee caps, started-hour charging and grace periods, shared between the API, the UI and a CLI |
| **Live tariff editing** | Rates are editable from the dashboard and applied to the next settlement |
| **Operations analytics** | 24h occupancy trend, 14-day revenue, peak-hour heatmap, stay-length distribution, vehicle mix |
| **Traffic simulator** | Steers real transactions towards a target occupancy so the demo never runs dry |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite)                                   │
│                                                              │
│   ParkingLot.tsx ── R3F Canvas, lights, orbit + idle drift   │
│   CarFleet.tsx    ── drives every vehicle along its bay path │
│   LotScene.tsx    ── tarmac, bay markings, gate, lamp posts  │
│                                                              │
│   useLotStore  ── Zustand: spaces, stats, activity, receipts │
│   useParkingFeed ─ WebSocket reducer + backoff reconnect     │
└───────────────┬───────────────────────────┬──────────────────┘
                │ REST /api                 │ WebSocket /ws
┌───────────────▼───────────────────────────▼──────────────────┐
│  Express API (port 4000)                                     │
│                                                              │
│   routes/api.ts ─ health, lot, spaces, stats, analytics,     │
│                   pricing, sessions                          │
│   realtime/hub.ts ─ frame serialisation, heartbeat           │
│   services/    ─ parkingService · pricingService ·           │
│                 analyticsService · snapshotService ·         │
│                 simulationService                            │
└────────────────────────────┬─────────────────────────────────┘
                             │ mysql2 pool (transactional)
┌────────────────────────────▼─────────────────────────────────┐
│  MySQL / MariaDB — apex_parking                              │
│  facility · users · vehicles · parking_spaces ·              │
│  pricing_rules · parking_sessions · payments ·               │
│  occupancy_snapshots                                           │
└──────────────────────────────────────────────────────────────┘
```

### The shared contract

`shared/` is imported by the browser, the API **and** the CLI, which is what
keeps the three honest:

- `types.ts` — every DTO and the WebSocket frame union
- `lotLayout.ts` — the single source of truth for bay geometry. The seeder
  writes these rows and the 3D scene renders them, so a bay cannot exist in the
  database without a matching mesh, or vice versa.
- `pricing.ts` — the fee engine, with a **per-calendar-day** cap
- `pricingRules.ts` — ZAR rate cards
- `references.ts` — payment reference generation
- `format.ts` — currency, duration and plate formatting

> A bug this caught: the seeder numbered payment references from an array index
> while the API numbered from the session id, so a simulated checkout could
> collide with seeded history on `uq_payments_reference`. Both now call
> `paymentReference()`, and `payments.session_id` carries a `UNIQUE` constraint
> so the database — not just application code — enforces one settlement per
> session.

## Getting started

Requires **Node 20+** and a local MySQL 8 or MariaDB 10.4 instance.

```bash
npm install
cp .env.example .env      # optional; every value has a default
npm run db:reset          # create the schema and seed a month of history
npm run dev               # API on :4000, dashboard on :3000
```

Open <http://localhost:3000>. Leave it running — the traffic simulator will
keep cars arriving and leaving.

### Available scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | API and client together |
| `npm run dev:server` / `dev:client` | Run either half on its own |
| `npm run db:migrate` / `db:seed` / `db:reset` | Schema and demo data |
| `npm run cli` | Fee calculator over several scenarios |
| `npm run verify` | **typecheck → lint → test → build** (what CI runs) |

## Billing rules

Charged per **started hour**, with a hard ceiling on each calendar day:

1. A **grace period** per vehicle class is free.
2. After that, each started hour is charged at the class rate.
3. Within any single day the total is capped at the daily maximum.
4. A stay crossing midnight produces one line per day, each capped separately.

```
Car   · R15/hr · R100/day · 10 min grace
SUV   · R22/hr · R150/day · 10 min grace
Truck · R35/hr · R260/day · 15 min grace
Bike  · R8/hr  · R45/day  · 5 min grace
```

```bash
npm run cli
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness plus database reachability |
| `GET` | `/api/lot` | Everything the dashboard needs in one round trip |
| `GET` | `/api/spaces` | Bay grid with live sessions |
| `GET` | `/api/stats` | Occupancy and revenue counters |
| `GET` | `/api/analytics` | Occupancy, revenue, peaks, durations, mix |
| `GET` | `/api/pricing` | Rate cards |
| `PATCH` | `/api/pricing/:id` | Update a rate card |
| `POST` | `/api/sessions` | Check a vehicle in |
| `DELETE` | `/api/sessions/:spaceNumber` | Settle and release a bay |
| `GET` | `/api/sessions?limit=` | Recent history |

WebSocket frames on `/ws`: `snapshot`, `session.opened`, `session.closed`,
`tick`, `error`.

## Testing

```bash
npm run test:ci
```

44 tests covering the fee engine (including the midnight and daily-cap
boundaries), bay geometry and vehicle paths, path sampling, reference
generation, and the WebSocket reducers that keep the dashboard in step with the
API — including that a departure frees its bay and itemises the same figure the
server charged.

## Notes on the front end

- **Code splitting** — Three.js is ~1 MB and is not needed to paint the
  dashboard, so the lot is lazy-loaded behind a spinner. The initial shell is
  ~10 kB gzipped.
- **No chart library** — the occupancy area chart, revenue bars, peak-hour
  heatmap and stay-length bars are hand-drawn SVG/CSS.
- **No 3D model assets** — every vehicle is assembled from primitives and tinted
  from a stable hash of its number plate, so a car keeps its paint between
  visits and the whole fleet costs a few kilobytes of geometry.
- **Labelling** — bay numbers are drawn to a 2D canvas and uploaded as
  textures, so the lot needs no web font and works offline.
- **60 fps** — vehicles are placed by mutating object transforms inside
  `useFrame`. React only re-renders when a car joins or leaves the scene.

## Licence

MIT