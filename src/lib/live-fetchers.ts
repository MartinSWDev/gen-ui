// Server-side fetchers for the Live tab. Each trims its API's response to the fields a
// reader would care about, so Jev decides on meaningful data rather than protocol noise.

import type { LiveSourceId } from "@/lib/live-sources"

type Fetched = { data: unknown; intent: string }

const USER_AGENT = "gen-ui-demo/1.0 (https://github.com/MartinSWDev/gen-ui)"

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(6_000),
  })
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`)
  return res.json() as Promise<T>
}

const CITIES = [
  { name: "London", country: "United Kingdom", lat: 51.51, lon: -0.13 },
  { name: "Tokyo", country: "Japan", lat: 35.68, lon: 139.69 },
  { name: "New York", country: "United States", lat: 40.71, lon: -74.01 },
  { name: "Reykjavík", country: "Iceland", lat: 64.15, lon: -21.94 },
  { name: "Nairobi", country: "Kenya", lat: -1.29, lon: 36.82 },
  { name: "Sydney", country: "Australia", lat: -33.87, lon: 151.21 },
  { name: "São Paulo", country: "Brazil", lat: -23.55, lon: -46.63 },
  { name: "Mumbai", country: "India", lat: 19.08, lon: 72.88 },
]

// WMO weather interpretation codes, as documented by Open-Meteo.
const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle", 56: "Freezing drizzle", 57: "Dense freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light rain showers", 81: "Rain showers",
  82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm",
  96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}

type OpenMeteo = {
  current: Record<string, number | string>
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[] }
}

async function weather(tick: number): Promise<Fetched> {
  const city = CITIES[tick % CITIES.length]
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day" +
    "&hourly=temperature_2m,precipitation_probability&forecast_hours=12&timezone=auto"
  const { current, hourly } = await getJson<OpenMeteo>(url)
  const code = Number(current.weather_code)
  const severe = code >= 95 || code === 82 || code === 75 || code === 67
  return {
    intent: `Weather right now and for the next 12 hours in ${city.name}`,
    data: {
      city: city.name,
      country: city.country,
      observed_at: current.time,
      conditions: WEATHER_CODES[code] ?? `Weather code ${code}`,
      ...(severe && { warning: `${WEATHER_CODES[code]} in ${city.name}. Take care if you are heading out.` }),
      is_daytime: current.is_day === 1,
      temperature_c: current.temperature_2m,
      feels_like_c: current.apparent_temperature,
      humidity_percent: current.relative_humidity_2m,
      precipitation_mm: current.precipitation,
      wind_kmh: current.wind_speed_10m,
      hourly_forecast: {
        time: hourly.time,
        temperature_c: hourly.temperature_2m,
        chance_of_rain_percent: hourly.precipitation_probability,
      },
    },
  }
}

type UsgsFeed = {
  metadata: { title: string; count: number; generated: number }
  features: { properties: { mag: number | null; place: string | null; time: number; tsunami: number; alert: string | null; url: string; type: string } }[]
}

async function earthquakes(): Promise<Fetched> {
  let feed = await getJson<UsgsFeed>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson")
  if (feed.features.length < 3) {
    feed = await getJson<UsgsFeed>("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")
  }
  const quakes = feed.features
    .map((f) => f.properties)
    .sort((a, b) => b.time - a.time)
    .slice(0, 8)
  const strongest = quakes.reduce((max, q) => Math.max(max, q.mag ?? 0), 0)
  return {
    intent: "Show what earthquakes just happened and flag anything serious",
    data: {
      feed: feed.metadata.title,
      updated_at: new Date(feed.metadata.generated).toISOString(),
      total_count: feed.metadata.count,
      strongest_magnitude: strongest,
      tsunami_warning: quakes.some((q) => q.tsunami === 1),
      earthquakes: quakes.map((q) => ({
        magnitude: q.mag,
        place: q.place,
        time: new Date(q.time).toISOString(),
        alert_level: q.alert ?? "none",
        details_url: q.url,
      })),
    },
  }
}

type KrakenTicker = { error: string[]; result: Record<string, { c: [string, string]; o: string; h: [string, string]; l: [string, string]; v: [string, string] }> }

const COINS: Record<string, string> = { XXBTZUSD: "Bitcoin", XETHZUSD: "Ethereum", SOLUSD: "Solana", XDGUSD: "Dogecoin" }

async function crypto(): Promise<Fetched> {
  const { result } = await getJson<KrakenTicker>("https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,SOLUSD,XDGUSD")
  const coins = Object.entries(result).map(([pair, t]) => {
    const price = Number(t.c[0])
    const open = Number(t.o)
    return {
      coin: COINS[pair] ?? pair,
      price_usd: price,
      change_today_percent: Math.round(((price - open) / open) * 10_000) / 100,
      high_24h_usd: Number(t.h[1]),
      low_24h_usd: Number(t.l[1]),
    }
  })
  return {
    intent: "Live crypto prices and how they are moving today",
    data: { exchange: "Kraken", quoted_at: new Date().toISOString(), coins },
  }
}

type IssNow = { latitude: number; longitude: number; altitude: number; velocity: number; visibility: string; timestamp: number }

async function iss(): Promise<Fetched> {
  const now = await getJson<IssNow>("https://api.wheretheiss.at/v1/satellites/25544")
  return {
    intent: "Where the International Space Station is right now",
    data: {
      spacecraft: "International Space Station",
      position_at: new Date(now.timestamp * 1000).toISOString(),
      latitude: Math.round(now.latitude * 1000) / 1000,
      longitude: Math.round(now.longitude * 1000) / 1000,
      altitude_km: Math.round(now.altitude),
      speed_kmh: Math.round(now.velocity),
      in_sunlight: now.visibility === "daylight",
      crew_status: "Crewed",
    },
  }
}

type RecentChanges = { query: { recentchanges: { type: string; title: string; user: string; timestamp: string; comment: string; oldlen: number; newlen: number }[] } }

async function wikipedia(): Promise<Fetched> {
  const { query } = await getJson<RecentChanges>(
    "https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|user|timestamp|comment|sizes" +
      "&rclimit=8&rctype=edit|new&rcshow=!bot&rcnamespace=0&format=json",
  )
  return {
    intent: "What people are editing on Wikipedia right now",
    data: {
      wiki: "English Wikipedia",
      edits: query.recentchanges.map((c) => ({
        article: c.title,
        editor: c.user,
        edited_at: c.timestamp,
        summary: c.comment || "(no summary)",
        bytes_changed: c.newlen - c.oldlen,
        new_article: c.type === "new",
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(c.title.replaceAll(" ", "_"))}`,
      })),
    },
  }
}

type HnSearch = { hits: { title: string; url: string | null; author: string; points: number; num_comments: number; created_at: string; story_id: number }[] }

async function hackernews(): Promise<Fetched> {
  const { hits } = await getJson<HnSearch>("https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=8")
  return {
    intent: "The newest Hacker News submissions",
    data: {
      site: "Hacker News",
      stories: hits.map((h) => ({
        title: h.title,
        author: h.author,
        points: h.points,
        comments: h.num_comments,
        submitted_at: h.created_at,
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.story_id}`,
      })),
    },
  }
}

const FETCHERS: Record<LiveSourceId, (tick: number) => Promise<Fetched>> = {
  weather,
  earthquakes,
  crypto,
  iss,
  wikipedia,
  hackernews,
}

export function fetchLiveSource(source: LiveSourceId, tick: number) {
  return FETCHERS[source](tick)
}
