import { ASK_DATASETS, type AskDatasetId } from "@/lib/ask-datasets"
import { cryptoMarket, worldWeather } from "@/lib/live-fetchers"

export const runtime = "nodejs"

const LOADERS: Record<AskDatasetId, () => Promise<unknown>> = { weather: worldWeather, crypto: cryptoMarket }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: string } | null
  const id = body?.id as AskDatasetId
  if (!id || !(id in ASK_DATASETS)) {
    return Response.json({ error: "Expected { id } with a known dataset." }, { status: 400 })
  }
  try {
    return Response.json({ id, data: await LOADERS[id]() })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return Response.json({ error: `Couldn't load ${ASK_DATASETS[id].label}: ${message}` }, { status: 502 })
  }
}
