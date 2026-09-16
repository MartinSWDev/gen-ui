// Builds Compose questions and asks Jev. Shared by /api/compose and /api/live.

import { choice, type Questions } from "@typesafe-ai/sdk"

import {
  COMPONENTS,
  LAYOUTS,
  REGIONS,
  collectNodes,
  componentsFor,
  type ComposeNode,
  type ComposeResponse,
} from "@/lib/compose"
import type { ChoiceAnswer } from "@/lib/displays"
import { truncate } from "@/lib/shape"
import { getClient } from "@/lib/typesafe"

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

/** Throws TypeSafe SDK errors; callers turn them into responses. */
export async function runCompose(data: unknown, intent: string): Promise<Omit<ComposeResponse, "timing"> & { jevMs: number }> {
  const nodes = collectNodes(data)
  const questions = buildQuestions(nodes)
  const state = {
    user_intent: intent.trim() || "Not given. Compose the clearest page for this data.",
    document: truncate(data, 0, 4),
  }

  const t0 = performance.now()
  const result = await getClient().systemOne({ state, questions })
  const jevMs = performance.now() - t0

  const answers = result.answers as unknown as Record<string, ChoiceAnswer>
  return {
    model: result.model,
    layout: answers.layout,
    nodes: nodes.map((node, i) => ({ ...node, component: answers[`c${i}`], region: answers[`r${i}`] })),
    questionCount: Object.keys(questions).length,
    usage: result.usage,
    jevMs,
  }
}
