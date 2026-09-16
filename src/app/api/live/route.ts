import { runCompose } from "@/lib/compose-server"
import { fetchLiveSource } from "@/lib/live-fetchers"
import { LIVE_SOURCES, type LiveResponse, type LiveSourceId } from "@/lib/live-sources"
import { errorResponse } from "@/lib/typesafe"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const t0 = performance.now()
  if (!process.env.TYPESAFE_API_KEY) {
    return Response.json({ error: "TYPESAFE_API_KEY is not set. Add it to .env.local and restart the dev server." }, { status: 500 })
  }

  const body = (await req.json().catch(() => null)) as { source?: string; tick?: number } | null
  const source = body?.source as LiveSourceId
  if (!source || !(source in LIVE_SOURCES)) {
    return Response.json({ error: "Expected { source, tick } with a known source." }, { status: 400 })
  }

  let fetched
  const tFetch = performance.now()
  try {
    fetched = await fetchLiveSource(source, Math.max(0, Math.floor(body?.tick ?? 0)))
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return Response.json({ error: `Couldn't fetch ${LIVE_SOURCES[source].label}: ${message}` }, { status: 502 })
  }
  const sourceMs = performance.now() - tFetch

  try {
    const { jevMs, ...result } = await runCompose(fetched.data, fetched.intent)
    const response: LiveResponse = {
      source,
      fetchedAt: new Date().toISOString(),
      sourceMs,
      intent: fetched.intent,
      data: fetched.data,
      compose: { ...result, timing: { jevMs, serverMs: performance.now() - t0 } },
    }
    return Response.json(response)
  } catch (err) {
    return errorResponse(err)
  }
}
