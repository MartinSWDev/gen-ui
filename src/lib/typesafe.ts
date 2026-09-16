// Server-side helpers shared by the Jev route handlers.

import { APIError, TypeSafeClient, TypeSafeError } from "@typesafe-ai/sdk"

// Module-level client so the HTTPS connection to TypeSafe stays warm between runs.
let client: TypeSafeClient | undefined

export function getClient() {
  // No retries: a retried request would hide the real latency of the failed attempt.
  client ??= new TypeSafeClient({ retry: { maxRetries: 0 }, timeout: 15_000 })
  return client
}

/** Returns an error response if the request can't be served, otherwise the parsed body. */
export async function readRequest(req: Request): Promise<Response | { data: unknown; intent: string }> {
  if (!process.env.TYPESAFE_API_KEY) {
    return Response.json(
      { error: "TYPESAFE_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 },
    )
  }
  const body = (await req.json().catch(() => null)) as { data?: unknown; intent?: string } | null
  if (!body || !("data" in body)) {
    return Response.json({ error: "Expected a JSON body of { data, intent }." }, { status: 400 })
  }
  return { data: body.data, intent: body.intent ?? "" }
}

export function errorResponse(err: unknown) {
  if (err instanceof APIError) {
    return Response.json({ error: `TypeSafe API ${err.status}: ${err.message}` }, { status: 502 })
  }
  const message = err instanceof TypeSafeError ? err.message : "Unexpected error calling TypeSafe"
  return Response.json({ error: message }, { status: 502 })
}
