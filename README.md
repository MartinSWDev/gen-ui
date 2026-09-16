# Jev UI picker

Measures how fast [TypeSafe AI](https://typesafe.ai)'s Jev model picks a UI for arbitrary JSON.

Paste JSON (or pick a sample). One Jev call chooses a display from nine shadcn/ui options (line, bar, or donut chart, stat cards, data table, card grid, detail view, timeline, raw JSON) and binds fields to roles: label, value, time, and badge. The app renders the pick and records Jev latency, round-trip latency, p50/p95, and token usage per run.

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
