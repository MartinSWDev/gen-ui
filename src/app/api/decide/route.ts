import { choice, type ChoiceQuestion, type Questions } from "@typesafe-ai/sdk"

import { DISPLAYS, NONE, type ChoiceAnswer, type DecideResponse, type Decision } from "@/lib/displays"
import { analyze, truncate, type Field, type Shape } from "@/lib/shape"
import { errorResponse, getClient, readRequest } from "@/lib/typesafe"

export const runtime = "nodejs"

function fieldQuestion(instructions: string, fields: Field[]): ChoiceQuestion | undefined {
  // A Choice accepts up to 255 options; one is reserved for NONE.
  const options = fields.slice(0, 254)
  if (options.length === 0) return undefined
  return choice(instructions, {
    ...Object.fromEntries(options.map((f) => [f.name, `${f.type}, e.g. ${f.examples.join(" | ") || "empty"}`])),
    [NONE]: "No field fits this role",
  })
}

function buildQuestions(shape: Shape): Questions {
  const { fields } = shape
  const questions: Record<string, ChoiceQuestion | undefined> = {
    display: choice(
      "Which display component best presents this data to the user?",
      Object.fromEntries(Object.entries(DISPLAYS).map(([id, d]) => [id, d.description])),
    ),
    // Speculative fan-out: every binding is asked up front in the same call,
    // and the renderer only reads the ones its component needs.
    primary_field: fieldQuestion(
      "Which field names or labels each record? For a chart, this is the category or x-axis field.",
      fields,
    ),
    value_field: fieldQuestion(
      "Which numeric field is the main measure to plot or highlight?",
      fields.filter((f) => f.type === "number"),
    ),
    time_field: fieldQuestion(
      "Which field holds the date or time each record happened, if any?",
      fields.filter((f) => f.type === "date" || f.type === "string"),
    ),
    status_field: fieldQuestion(
      "Which short categorical field (status, level, role, category) should be shown as a badge, if any?",
      fields.filter((f) => f.type === "string" || f.type === "boolean"),
    ),
  }
  return Object.fromEntries(Object.entries(questions).filter(([, q]) => q)) as Questions
}

function buildState(shape: Shape, intent: string) {
  return {
    user_intent: intent.trim() || "Not given. Pick the clearest default display.",
    data: {
      kind: shape.kind,
      unwrapped_from: shape.path,
      record_count: shape.records.length,
      fields: shape.fields,
      first_records: truncate(shape.records.slice(0, 3)),
    },
  }
}

export async function POST(req: Request) {
  const t0 = performance.now()
  const input = await readRequest(req)
  if (input instanceof Response) return input

  const shape = analyze(input.data)

  try {
    const t1 = performance.now()
    const result = await getClient().systemOne({ state: buildState(shape, input.intent), questions: buildQuestions(shape) })
    const jevMs = performance.now() - t1

    const response: DecideResponse = {
      model: result.model,
      decision: result.answers as unknown as Decision & Record<string, ChoiceAnswer>,
      usage: result.usage,
      timing: { jevMs, serverMs: performance.now() - t0 },
    }
    return Response.json(response)
  } catch (err) {
    return errorResponse(err)
  }
}
