// Compose mode: every field in the JSON becomes a node, and Jev picks a component
// for each node (plus a page region for top-level fields) in one call.

import type { ChoiceAnswer } from "@/lib/displays"
import { isPlainObject, type Row } from "@/lib/shape"
import type { ThemeId, ToneId } from "@/lib/themes"

export type NodeKind = "text" | "number" | "boolean" | "text_list" | "number_list" | "object" | "object_list"

export type ComposeNode = {
  /** Dotted path; array items share a template path, e.g. "body[].text" */
  path: string
  key: string
  depth: number
  kind: NodeKind
  example: string
  topLevel: boolean
  /** Number of values, for lists */
  length?: number
}

type ComponentSpec = { label: string; kinds: readonly NodeKind[]; description: string }

const ALL_KINDS = ["text", "number", "boolean", "text_list", "number_list", "object", "object_list"] as const

// Descriptions are sent to Jev as Choice criteria. Only the components that
// can render a node's kind are offered for that node.
export const COMPONENTS = {
  heading: { label: "Heading", kinds: ["text"], description: "The main title of the page or of its section" },
  subheading: { label: "Subheading", kinds: ["text"], description: "A secondary title or tagline shown under a heading" },
  paragraph: { label: "Paragraph", kinds: ["text"], description: "Readable prose: body text, a summary, or an excerpt" },
  meta: {
    label: "Meta text",
    kinds: ["text", "number", "boolean", "text_list", "number_list"],
    description: "Small supporting detail a reader may glance at, such as reading time or a count",
  },
  alert: {
    label: "Alert",
    kinds: ["text", "boolean", "text_list"],
    description: "An important warning the reader must not miss, such as a safety, outage, or severe weather notice",
  },
  badge: { label: "Badge", kinds: ["text", "boolean"], description: "A short status, category, or label worth highlighting" },
  date: { label: "Date", kinds: ["text"], description: "A date or timestamp" },
  image: {
    label: "Image",
    kinds: ["text", "object"],
    description: "A picture: an image URL, or an object holding an image URL with alt text or size",
  },
  avatar: { label: "Avatar", kinds: ["text"], description: "A small round profile picture URL for a person or organization" },
  link: { label: "Link", kinds: ["text"], description: "A URL the reader can follow that is not an image" },
  button: { label: "Button", kinds: ["text"], description: "The label text of a call-to-action button" },
  code: { label: "Code", kinds: ["text"], description: "An identifier, slug, or technical value shown in monospace" },
  stat: { label: "Stat", kinds: ["number"], description: "A headline metric shown large" },
  progress: { label: "Progress", kinds: ["number"], description: "A 0 to 100 percentage or score shown as a bar" },
  badge_list: { label: "Badge list", kinds: ["text_list"], description: "Tags or categories shown as badges" },
  bullet_list: { label: "Bullet list", kinds: ["text_list"], description: "Several points or features shown as bullets" },
  gallery: { label: "Gallery", kinds: ["text_list"], description: "Several image URLs shown as a gallery" },
  line_chart: {
    label: "Line chart",
    kinds: ["number_list", "object_list"],
    description: "Numbers that change over time or in sequence, shown as a line",
  },
  bar_chart: {
    label: "Bar chart",
    kinds: ["number_list", "object_list"],
    description: "Numbers compared across a handful of items, shown as bars",
  },
  section: { label: "Section", kinds: ["object"], description: "A group of related fields shown together, each rendered on its own" },
  card: { label: "Card", kinds: ["object"], description: "A self-contained group of fields shown inside a bordered card" },
  cta: {
    label: "Call to action",
    kinds: ["object"],
    description: "A highlighted panel with a heading, short text, and a button",
  },
  profile: { label: "Profile", kinds: ["object"], description: "A person or organization shown inline with avatar and name" },
  key_value: { label: "Key-value list", kinds: ["object"], description: "Details shown as a compact list of labels and values" },
  rich_text: {
    label: "Rich text",
    kinds: ["object_list"],
    description: "Ordered content blocks, such as headings and paragraphs, that form an article body",
  },
  table: { label: "Table", kinds: ["object_list"], description: "Records with several fields compared in rows and columns" },
  card_grid: { label: "Card grid", kinds: ["object_list"], description: "Items people browse, each shown as its own card" },
  list: { label: "List", kinds: ["object_list"], description: "Simple items shown one per row" },
  accordion: { label: "Accordion", kinds: ["object_list"], description: "Title and detail pairs, like FAQs, that expand on click" },
  hidden: {
    label: "Hidden",
    kinds: ALL_KINDS,
    description: "Not meant for the reader: SEO metadata, internal IDs, configuration, or data already shown elsewhere",
  },
} satisfies Record<string, ComponentSpec>

export type ComponentId = keyof typeof COMPONENTS

export function componentsFor(kind: NodeKind): ComponentId[] {
  return (Object.keys(COMPONENTS) as ComponentId[]).filter((id) =>
    (COMPONENTS[id].kinds as readonly NodeKind[]).includes(kind),
  )
}

export const LAYOUTS = {
  article: { label: "Article", description: "A single narrow reading column for posts, docs, and stories" },
  dashboard: { label: "Dashboard", description: "A wide grid of metrics, charts, and tables" },
  detail_page: {
    label: "Detail page",
    description: "One entity, such as a product or profile, with main content and a sidebar of details",
  },
} as const

export type LayoutId = keyof typeof LAYOUTS

export const REGIONS = {
  header: "Top of the page: title, byline, hero image",
  main: "The primary content the page exists for",
  sidebar: "Secondary details shown beside the main content",
  footer: "End of the page: calls to action and closing links",
} as const

export type RegionId = keyof typeof REGIONS

export type ComposedNode = ComposeNode & {
  component: ChoiceAnswer
  region?: ChoiceAnswer
  tone?: ChoiceAnswer
  /** For number series: how much of the series to show, e.g. first_3 */
  window?: ChoiceAnswer
}

/** How Jev narrowed a top-level list for the user's question. */
export type ListDecision = {
  path: string
  /** Item field whose values name each item, e.g. "city" */
  labelKey: string | null
  /** Probability that the question names each item, from one yes/no question per item */
  mentions: Record<string, number>
  sort: ChoiceAnswer | null
  limit: ChoiceAnswer
}

export type ComposeResponse = {
  model: string
  layout: ChoiceAnswer
  theme: ChoiceAnswer
  lists: ListDecision[]
  nodes: ComposedNode[]
  questionCount: number
  usage: { input_tokens: number; output_tokens: number }
  timing: { jevMs: number; serverMs: number }
}

const MAX_DEPTH = 4
export const MAX_NODES = 120

export function kindOf(value: unknown): NodeKind | undefined {
  if (typeof value === "string") return "text"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined
    if (value.every(isPlainObject)) return "object_list"
    if (value.every((v) => typeof v === "number")) return "number_list"
    if (value.every((v) => !isPlainObject(v) && !Array.isArray(v))) return "text_list"
    return undefined
  }
  if (isPlainObject(value) && Object.keys(value).length > 0) return "object"
  return undefined
}

function preview(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length} items] ${preview(value[0])}`
  if (isPlainObject(value)) return `{${Object.keys(value).join(", ")}}`
  const s = String(value)
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}

/** Walks the JSON and returns one node per renderable field, parents before children. */
export function collectNodes(root: unknown): ComposeNode[] {
  const nodes: ComposeNode[] = []

  const visit = (value: unknown, path: string, key: string, depth: number) => {
    const kind = kindOf(value)
    if (!kind || nodes.length >= MAX_NODES) return
    // The root object is the page itself, not a node.
    if (!(depth === 0 && kind === "object")) {
      nodes.push({
        path,
        key,
        depth,
        kind,
        example: preview(value),
        topLevel: depth === 1,
        ...(Array.isArray(value) && { length: value.length }),
      })
    }
    if (depth >= MAX_DEPTH) return

    const child = (k: string) => (path ? `${path}.${k}` : k)
    if (kind === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) visit(v, child(k), k, depth + 1)
    } else if (kind === "object_list") {
      // Items share one template, merged from the first few so optional fields are included.
      const template = Object.assign({}, ...(value as object[]).slice(0, 3).reverse())
      for (const [k, v] of Object.entries(template)) visit(v, `${path}[].${k}`, k, depth + 1)
    }
  }

  visit(root, "", "", 0)
  return nodes
}

export const ORIGINAL_ORDER = "original"
export const FOCUS_THRESHOLD = 0.5

export const LIMITS = {
  all: "Show every item",
  top_5: "Only the top 5 items",
  top_3: "Only the top 3 items",
  top_1: "Only the single best match",
} as const

/** The field that names each item in a list, used to offer focus options. */
export function labelKeyOf(items: Row[]): string | null {
  const keys = Object.keys(items[0] ?? {}).filter((k) => typeof items[0][k] === "string")
  return keys.find((k) => /name|title|city|coin|label|article|place/i.test(k)) ?? keys[0] ?? null
}

/** Turns a list's decisions into what the page does with them. */
export function resolveList(list: ListDecision) {
  const named = Object.entries(list.mentions)
    .filter(([, p]) => p >= FOCUS_THRESHOLD)
    .map(([label]) => label)
  const [sortKey, dir] = (list.sort?.choice ?? ORIGINAL_ORDER).split(":")
  const sorted = sortKey !== ORIGINAL_ORDER
  const limits: Record<keyof typeof LIMITS, number> = { all: Infinity, top_5: 5, top_3: 3, top_1: 1 }
  const limit = limits[list.limit.choice as keyof typeof LIMITS] ?? Infinity
  return {
    // Items the question names ("Tokyo and London") define the set. Questions like "coldest" name
    // nothing, so sort and limit pick the answer from real values in code.
    focus: named,
    sort: sorted ? { key: sortKey, dir: dir === "asc" ? ("asc" as const) : ("desc" as const) } : null,
    limit: named.length > 0 ? Infinity : limit,
  }
}

/** Applies Jev's focus, sort, and limit picks to the document before it renders. */
export function applyListDecisions(data: unknown, lists: ListDecision[]): unknown {
  if (!isPlainObject(data) || lists.length === 0) return data
  const out: Row = { ...data }
  for (const list of lists) {
    if (!Array.isArray(out[list.path])) continue
    let items = [...(out[list.path] as Row[])]
    const { focus, sort, limit } = resolveList(list)

    if (focus.length > 0 && list.labelKey) {
      const match = items.filter((item) => focus.includes(String(item[list.labelKey!])))
      if (match.length > 0) items = match
    }
    if (sort) {
      items.sort((a, b) => (Number(a[sort.key]) - Number(b[sort.key])) * (sort.dir === "asc" ? 1 : -1))
    }
    out[list.path] = items.slice(0, limit)
  }
  return out
}

/** Options for how much of a number series to show. */
export function windowOptions(length: number): Record<string, string> {
  const sizes = [1, 3, 6, 12].filter((n) => n < length)
  return {
    all: `All ${length} values`,
    ...Object.fromEntries(
      sizes.flatMap((n) => [
        [`first_${n}`, `The first ${n} values, such as the next ${n} hours of a forecast`],
        [`last_${n}`, `The last ${n} values, such as the most recent ${n} hours of a history`],
      ]),
    ),
  }
}

/** [start, end) indices for a window choice like "first_3". */
export function windowRange(length: number, choice: string | undefined): [number, number] {
  const match = choice?.match(/^(first|last)_(\d+)$/)
  if (!match) return [0, length]
  const n = Math.min(Number(match[2]), length)
  return match[1] === "first" ? [0, n] : [length - n, length]
}

/** Everything ComposedView needs from a response, keyed by field path. */
export function viewDecisions(r: ComposeResponse) {
  return {
    layout: r.layout.choice as LayoutId,
    theme: r.theme?.choice as ThemeId | undefined,
    lists: r.lists ?? [],
    picks: Object.fromEntries(r.nodes.map((n) => [n.path, n.component.choice as ComponentId])),
    regions: Object.fromEntries(r.nodes.filter((n) => n.region).map((n) => [n.path, n.region!.choice as RegionId])),
    tones: Object.fromEntries(r.nodes.filter((n) => n.tone).map((n) => [n.path, n.tone!.choice as ToneId])),
    windows: Object.fromEntries(r.nodes.filter((n) => n.window).map((n) => [n.path, n.window!.choice])),
    // Jev's best visible option for each field it hid, used if a page would otherwise be empty.
    alternatives: Object.fromEntries(
      r.nodes
        .filter((n) => n.component.choice === "hidden")
        .map((n) => {
          const [best] = Object.entries(n.component.probabilities)
            .filter(([id]) => id !== "hidden")
            .sort((a, b) => b[1] - a[1])
          return [n.path, (best?.[0] ?? "hidden") as ComponentId]
        }),
    ),
  }
}
