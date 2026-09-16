import type { ComposeResponse } from "@/lib/compose"
import { runCompose } from "@/lib/compose-server"
import { errorResponse, readRequest } from "@/lib/typesafe"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const t0 = performance.now()
  const input = await readRequest(req)
  if (input instanceof Response) return input

  try {
    const { jevMs, ...result } = await runCompose(input.data, input.intent)
    const response: ComposeResponse = { ...result, timing: { jevMs, serverMs: performance.now() - t0 } }
    return Response.json(response)
  } catch (err) {
    return errorResponse(err)
  }
}
