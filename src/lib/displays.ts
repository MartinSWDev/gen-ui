// The menu Jev picks from. Descriptions are sent to the model as Choice criteria,
// so they are written to separate the options from each other.

export const DISPLAYS = {
  line_chart: {
    label: "Line chart",
    component: "ChartContainer · LineChart",
    description: "A numeric measure across an ordered time or sequence field (dates, months, days). Shows a trend.",
  },
  bar_chart: {
    label: "Bar chart",
    component: "ChartContainer · BarChart",
    description: "A numeric measure compared across named categories, roughly 3 to 20 records. No time ordering.",
  },
  pie_chart: {
    label: "Donut chart",
    component: "ChartContainer · PieChart",
    description: "Shares of a whole: 2 to 6 categories whose numeric values add up to a meaningful total.",
  },
  stat_cards: {
    label: "Stat cards",
    component: "Card grid",
    description: "A handful of headline metrics or KPIs, usually a single object whose values are numbers.",
  },
  data_table: {
    label: "Data table",
    component: "Table · Badge",
    description: "Many records with several mixed fields that people scan, sort, or compare row by row.",
  },
  card_grid: {
    label: "Card grid",
    component: "Card · Badge",
    description: "A collection of entities people browse, such as products, people, or projects, each with a name and descriptive text.",
  },
  detail_view: {
    label: "Detail view",
    component: "Card · description list",
    description: "One record with many fields, possibly nested, shown as labeled key-value pairs.",
  },
  timeline: {
    label: "Timeline",
    component: "Timeline list · Badge",
    description: "Events or log entries, each with a timestamp and a message, read in time order.",
  },
  raw_json: {
    label: "Raw JSON",
    component: "ScrollArea · pre",
    description: "Deeply nested or irregular data, such as config files, that none of the other displays fit.",
  },
} as const

export type DisplayId = keyof typeof DISPLAYS

export const DISPLAY_IDS = Object.keys(DISPLAYS) as DisplayId[]

export const NONE = "(none)"

export type ChoiceAnswer = {
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

export type Decision = {
  display: ChoiceAnswer
  primary_field?: ChoiceAnswer
  value_field?: ChoiceAnswer
  time_field?: ChoiceAnswer
  status_field?: ChoiceAnswer
}

export type DecideResponse = {
  model: string
  decision: Decision
  usage: { input_tokens: number; output_tokens: number }
  timing: { jevMs: number; serverMs: number }
}
