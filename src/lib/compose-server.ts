// Builds Compose questions and asks Jev. Shared by /api/compose and /api/live.

import { choice, noul, type ChoiceQuestion, type NoulQuestion, type Questions } from "@typesafe-ai/sdk"

import {
  COMPONENTS,
  LAYOUTS,
  LIMITS,
  ORIGINAL_ORDER,
  REGIONS,
  collectNodes,
  componentsFor,
  labelKeyOf,
  windowOptions,
  type ComposeNode,
  type ComposeResponse,
  type ListDecision,
} from "@/lib/compose"
import type { ChoiceAnswer } from "@/lib/displays"
import { isPlainObject, truncate, type Row } from "@/lib/shape"
import { THEMES, TONES } from "@/lib/themes"
import { getClient } from "@/lib/typesafe"

type ListPlan = {
  path: string
  labelKey: string | null
  /** One yes/no question per item, so a question can name several ("Tokyo and London") */
  mentions: { label: string; question: NoulQuestion }[]
  sort?: ChoiceQuestion
  limit: ChoiceQuestion
}

// Beyond this, per-item questions cost more than they help.
const MAX_MENTION_ITEMS = 40

/** Focus, sort, and limit questions for each top-level list, so a question can narrow the page. */
function planLists(data: unknown, nodes: ComposeNode[]): ListPlan[] {
  if (!isPlainObject(data)) return []
  return nodes
    .filter((n) => n.topLevel && n.kind === "object_list")
    .map((node) => {
      const items = data[node.key] as Row[]
      const field = { path: node.path, example: node.example }
      const labelKey = labelKeyOf(items)
      const labels = labelKey ? [...new Set(items.map((item) => String(item[labelKey])))].slice(0, MAX_MENTION_ITEMS) : []
      const numeric = Object.keys(items[0] ?? {}).filter((k) => typeof items[0][k] === "number")

      return {
        path: node.path,
        labelKey,
        mentions:
          labels.length > 1
            ? labels.map((label) => ({
                label,
                question: noul({
                  question: "Does `user_intent` refer to this item by name?",
                  note: "Answer no for questions like hottest or cheapest that don't name an item.",
                  item: label,
                  list: node.path,
                }),
              }))
            : [],
        sort:
          numeric.length > 0
            ? choice(
                { question: "How should this list be ordered to answer `user_intent`?", field },
                {
                  ...Object.fromEntries(
                    numeric.flatMap((k) => [
                      [`${k}:desc`, `Highest ${k} first`],
                      [`${k}:asc`, `Lowest ${k} first`],
                    ]),
                  ),
                  [ORIGINAL_ORDER]: "Keep the original order",
                },
              )
            : undefined,
        limit: choice({ question: "How many items from this list does `user_intent` need?", field }, LIMITS),
      }
    })
}

// Question ids are never sent to the model, so short positional ids are fine.
function buildQuestions(nodes: ComposeNode[], lists: ListPlan[]): Questions {
  const questions: Questions = {
    layout: choice(
      "Which page layout best answers `user_intent` for this JSON document?",
      Object.fromEntries(Object.entries(LAYOUTS).map(([id, l]) => [id, l.description])),
    ),
    theme: choice(
      "Which colour theme suits this data and `user_intent`?",
      Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, t.description])),
    ),
  }
  nodes.forEach((node, i) => {
    const field = { path: node.path || "(root)", key: node.key, value_kind: node.kind, example: node.example }
    questions[`c${i}`] = choice(
      {
        question: "Which UI component should render this field of `document`?",
        focus: "Serve `user_intent`: pick hidden for fields that don't help answer it.",
        field,
      },
      Object.fromEntries(componentsFor(node.kind).map((id) => [id, COMPONENTS[id].description])),
    )
    if (node.topLevel) {
      questions[`r${i}`] = choice({ question: "Where on the page should this field go?", field }, REGIONS)
    }
    if (node.kind === "number") {
      questions[`t${i}`] = choice({ question: "How should a reader feel about this value?", field }, TONES)
    }
    if (node.kind === "number_list" && node.length && node.length > 3) {
      questions[`w${i}`] = choice(
        { question: "How much of this series does `user_intent` ask to see?", field },
        windowOptions(node.length),
      )
    }
  })
  lists.forEach((list, i) => {
    list.mentions.forEach((m, j) => (questions[`lm${i}_${j}`] = m.question))
    if (list.sort) questions[`ls${i}`] = list.sort
    questions[`ll${i}`] = list.limit
  })
  return questions
}

/** Throws TypeSafe SDK errors; callers turn them into responses. */
export async function runCompose(data: unknown, intent: string): Promise<Omit<ComposeResponse, "timing"> & { jevMs: number }> {
  const nodes = collectNodes(data)
  const listPlans = planLists(data, nodes)
  const questions = buildQuestions(nodes, listPlans)
  const state = {
    user_intent: intent.trim() || "Not given. Compose the clearest overview of this data.",
    // Enough items that focus and sort picks can see the values they choose between.
    document: truncate(data, 0, 4, 12),
  }

  const t0 = performance.now()
  const result = await getClient().systemOne({ state, questions })
  const jevMs = performance.now() - t0

  const answers = result.answers as unknown as Record<string, ChoiceAnswer>
  const lists: ListDecision[] = listPlans.map((plan, i) => ({
    path: plan.path,
    labelKey: plan.labelKey,
    mentions: Object.fromEntries(plan.mentions.map((m, j) => [m.label, (answers[`lm${i}_${j}`] as unknown as { noul: number }).noul])),
    sort: answers[`ls${i}`] ?? null,
    limit: answers[`ll${i}`],
  }))
  return {
    model: result.model,
    layout: answers.layout,
    theme: answers.theme,
    lists,
    nodes: nodes.map((node, i) => ({
      ...node,
      component: answers[`c${i}`],
      region: answers[`r${i}`],
      tone: answers[`t${i}`],
      window: answers[`w${i}`],
    })),
    questionCount: Object.keys(questions).length,
    usage: result.usage,
    jevMs,
  }
}
