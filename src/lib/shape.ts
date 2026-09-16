// Turns arbitrary pasted JSON into a flat list of records plus a field summary.
// Runs on both the server (to build Jev's state + questions) and the client (to render).

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type FieldType = "number" | "string" | "date" | "boolean" | "object" | "array" | "null"

export type Field = {
  name: string
  type: FieldType
  examples: string[]
}

export type ShapeKind = "records" | "single_record" | "value_list" | "scalar"

export type Row = Record<string, unknown>

export type Shape = {
  kind: ShapeKind
  /** Property the records were unwrapped from, e.g. "data" in { data: [...] } */
  path: string | null
  records: Row[]
  fields: Field[]
}

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

export function isPlainObject(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function typeOf(v: unknown): FieldType {
  if (v === null || v === undefined) return "null"
  if (typeof v === "number") return "number"
  if (typeof v === "boolean") return "boolean"
  if (typeof v === "string") return DATE_RE.test(v) ? "date" : "string"
  if (Array.isArray(v)) return "array"
  return "object"
}

function preview(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length} items]`
  if (isPlainObject(v)) return `{${Object.keys(v).slice(0, 4).join(", ")}}`
  const s = String(v)
  return s.length > 40 ? `${s.slice(0, 40)}…` : s
}

function summarizeFields(records: Row[]): Field[] {
  const byName = new Map<string, { types: Map<FieldType, number>; examples: Set<string> }>()
  for (const record of records.slice(0, 100)) {
    for (const [name, value] of Object.entries(record)) {
      let entry = byName.get(name)
      if (!entry) byName.set(name, (entry = { types: new Map(), examples: new Set() }))
      const t = typeOf(value)
      if (t !== "null") entry.types.set(t, (entry.types.get(t) ?? 0) + 1)
      if (entry.examples.size < 3 && t !== "null") entry.examples.add(preview(value))
    }
  }
  return [...byName].map(([name, { types, examples }]) => ({
    name,
    type: [...types].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "null",
    examples: [...examples],
  }))
}

export function analyze(data: unknown): Shape {
  if (Array.isArray(data)) {
    if (data.length > 0 && data.every(isPlainObject)) {
      return { kind: "records", path: null, records: data, fields: summarizeFields(data) }
    }
    const records = data.map((value) => ({ value }))
    return { kind: "value_list", path: null, records, fields: summarizeFields(records) }
  }

  if (isPlainObject(data)) {
    // Unwrap API envelopes like { data: [...], total: 40 } but not entities
    // that merely contain a list, like an order with line items.
    const entries = Object.entries(data)
    const listKey = entries.find(([, v]) => Array.isArray(v) && v.length > 0 && v.every(isPlainObject))?.[0]
    const scalarCount = entries.filter(([, v]) => !Array.isArray(v) && !isPlainObject(v)).length
    if (listKey && scalarCount <= 2) {
      const records = data[listKey] as Row[]
      return { kind: "records", path: listKey, records, fields: summarizeFields(records) }
    }
    return { kind: "single_record", path: null, records: [data], fields: summarizeFields([data]) }
  }

  const records = [{ value: data }]
  return { kind: "scalar", path: null, records, fields: summarizeFields(records) }
}

/** Shrinks a value so the model sees its structure without paying for the whole payload. */
export function truncate(v: unknown, depth = 0, maxDepth = 2): JsonValue {
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 80)}…` : v
  if (Array.isArray(v)) {
    if (depth >= maxDepth) return `[${v.length} items]`
    const head = v.slice(0, 3).map((item) => truncate(item, depth + 1, maxDepth))
    return v.length > 3 ? [...head, `…${v.length - 3} more`] : head
  }
  if (isPlainObject(v)) {
    if (depth >= maxDepth) return `{${Object.keys(v).length} fields}`
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, truncate(val, depth + 1, maxDepth)]))
  }
  return v === undefined ? null : (v as JsonValue)
}
