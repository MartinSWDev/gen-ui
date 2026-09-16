// Free, keyless public feeds used by the Live tab. Metadata only, safe for the client;
// the fetchers live in live-fetchers.ts.

import type { ComposeResponse } from "@/lib/compose"

export const LIVE_SOURCES = {
  weather: {
    label: "Weather",
    provider: "Open-Meteo",
    homepage: "https://open-meteo.com",
    description: "Current conditions and the next 12 hours, rotating through world cities",
  },
  earthquakes: {
    label: "Earthquakes",
    provider: "USGS",
    homepage: "https://earthquake.usgs.gov/earthquakes/feed/",
    description: "The most recent earthquakes worldwide, updated every minute",
  },
  crypto: {
    label: "Crypto prices",
    provider: "Kraken",
    homepage: "https://docs.kraken.com/api/",
    description: "Live prices and 24-hour ranges for major coins",
  },
  iss: {
    label: "ISS position",
    provider: "Where the ISS at?",
    homepage: "https://wheretheiss.at",
    description: "Where the International Space Station is right now",
  },
  wikipedia: {
    label: "Wikipedia edits",
    provider: "Wikimedia",
    homepage: "https://www.mediawiki.org/wiki/API:RecentChanges",
    description: "The latest human edits to English Wikipedia",
  },
  hackernews: {
    label: "Hacker News",
    provider: "HN Algolia",
    homepage: "https://hn.algolia.com/api",
    description: "The newest stories submitted to Hacker News",
  },
} as const

export type LiveSourceId = keyof typeof LIVE_SOURCES

export const LIVE_SOURCE_IDS = Object.keys(LIVE_SOURCES) as LiveSourceId[]

export type LiveResponse = {
  source: LiveSourceId
  fetchedAt: string
  sourceMs: number
  intent: string
  data: unknown
  compose: ComposeResponse
}
