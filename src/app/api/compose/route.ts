import { choice, type Questions } from "@typesafe-ai/sdk"

import type { ChoiceAnswer } from "@/lib/displays"
import {
  COMPONENTS,
  LAYOUTS,
  REGIONS,
  collectNodes,
  componentsFor,
  type ComposeNode,
  type ComposeResponse,
} from "@/lib/compose"
import { truncate } from "@/lib/shape"
import { errorResponse, getClient, readRequest } from "@/lib/typesafe"

export const runtime = "nodejs"

// Question ids are never sent to the model, so short positional ids are fine.
function buildQuestions(nodes: ComposeNode[]): Questions {
  const questions: Questions = {
    layout: choice(
      "Which page layout fits this whole JSON document?",
      Object.fromEntries(Object.entries(LAYOUTS).map(([id, l]) => [id, l.description])),
    ),
  }
  nodes.forEach((node, i) => {
    const field = { path: node.path || "(root)", key: node.key, value_kind: node.kind, example: node.example }
    questions[`c${i}`] = choice(
      { question: "Which UI component should render this field of `document`?", field },
      Object.fromEntries(componentsFor(node.kind).map((id) => [id, COMPONENTS[id].description])),
    )
    if (node.topLevel) {
      questions[`r${i}`] = choice({ question: "Where on the page should this field go?", field }, REGIONS)
    }
  })
  return questions
}

export async function POST(req: Request) {
  const t0 = performance.now()
  const input = await readRequest(req)
  if (input instanceof Response) return input

  const nodes = collectNodes(input.data)
  const questions = buildQuestions(nodes)
  const state = {
    user_intent: input.intent.trim() || "Not given. Compose the clearest page for this data.",
    document: truncate(input.data, 0, 4),
  }

  try {
    const t1 = performance.now()
    const result = await getClient().systemOne({ state, questions })
    const jevMs = performance.now() - t1

    const answers = result.answers as unknown as Record<string, ChoiceAnswer>
    const response: ComposeResponse = {
      model: result.model,
      layout: answers.layout,
      nodes: nodes.map((node, i) => ({ ...node, component: answers[`c${i}`], region: answers[`r${i}`] })),
      questionCount: Object.keys(questions).length,
      usage: result.usage,
      timing: { jevMs, serverMs: performance.now() - t0 },
    }
    return Response.json(response)
  } catch (err) {
    return errorResponse(err)
  }
}
