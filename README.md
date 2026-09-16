# Jev UI picker

Measures how fast [TypeSafe AI](https://typesafe.ai)'s Jev model picks a UI for arbitrary JSON.

Three tabs, each timing Jev latency, round-trip latency, and p50/p95:

- **Page templates:** paste JSON, and one Jev call picks a display from nine shadcn/ui options (charts, stat cards, table, card grid, detail view, timeline, raw JSON) and binds fields to roles: label, value, time, and badge.
- **Compose:** one Jev call picks a component for every field (heading, image, avatar, badge, button, chart, alert, rich text…), a page region for each top-level field, and a layout. The page is assembled from those picks.
- **Live:** every 15, 30, or 60 seconds, the server fetches fresh data from a keyless public API (Open-Meteo weather, USGS earthquakes, Kraken prices, ISS position, Wikipedia edits, Hacker News), and Jev composes a page for it. The feed pauses while the browser tab is hidden and stops after 10 minutes.

## Setup

```bash
npm install
cp .env.example .env.local   # then set TYPESAFE_API_KEY
npm run dev
```

Get a key at https://console.typesafe.ai/settings/keys.

## How it works

- `src/lib/shape.ts` reads the JSON: it unwraps records and summarizes each field's type and examples.
- `src/app/api/decide/route.ts` sends Jev that summary plus up to 3 truncated records as state, and asks five Choice questions in one call. The TypeSafe call is timed on the server, with retries off.
- `src/lib/displays.ts` holds the display menu. Its descriptions are the Choice criteria Jev reads.
- `src/components/rendered-display.tsx` renders each display with shadcn/ui components.
