// Colour choices Jev makes for a composed page. Descriptions are Choice criteria,
// written as moods so Jev can match them to the data and the question.

import type { CSSProperties } from "react"

type Palette = { label: string; description: string; primary: string; onPrimary: string; charts: [string, string, string, string, string] }

export const THEMES = {
  ocean: {
    label: "Ocean",
    description: "Calm and informational: water, rain, cold, sky, trust",
    primary: "oklch(0.55 0.14 245)",
    onPrimary: "oklch(0.985 0 0)",
    charts: ["oklch(0.58 0.14 245)", "oklch(0.7 0.11 210)", "oklch(0.76 0.1 185)", "oklch(0.48 0.12 265)", "oklch(0.84 0.06 230)"],
  },
  sunset: {
    label: "Sunset",
    description: "Warm and energetic: heat, sunshine, summer, excitement",
    primary: "oklch(0.65 0.19 45)",
    onPrimary: "oklch(0.985 0 0)",
    charts: ["oklch(0.66 0.19 45)", "oklch(0.76 0.16 70)", "oklch(0.6 0.2 25)", "oklch(0.82 0.13 90)", "oklch(0.55 0.17 10)"],
  },
  forest: {
    label: "Forest",
    description: "Growth and health: gains, success, nature, everything is fine",
    primary: "oklch(0.56 0.13 155)",
    onPrimary: "oklch(0.985 0 0)",
    charts: ["oklch(0.58 0.14 155)", "oklch(0.72 0.13 135)", "oklch(0.66 0.1 180)", "oklch(0.48 0.1 160)", "oklch(0.82 0.1 125)"],
  },
  crimson: {
    label: "Crimson",
    description: "Danger and urgency: losses, crashes, disasters, severe warnings",
    primary: "oklch(0.56 0.21 25)",
    onPrimary: "oklch(0.985 0 0)",
    charts: ["oklch(0.57 0.21 25)", "oklch(0.68 0.17 40)", "oklch(0.47 0.17 15)", "oklch(0.75 0.13 60)", "oklch(0.62 0.15 355)"],
  },
  amber: {
    label: "Amber",
    description: "Caution: things worth watching, moderate risk, warnings that are not severe",
    primary: "oklch(0.74 0.16 75)",
    onPrimary: "oklch(0.25 0.05 60)",
    charts: ["oklch(0.74 0.16 75)", "oklch(0.66 0.17 55)", "oklch(0.82 0.13 95)", "oklch(0.58 0.14 45)", "oklch(0.86 0.09 85)"],
  },
  violet: {
    label: "Violet",
    description: "Night, space, and the unusual: darkness, astronomy, curiosity, novelty",
    primary: "oklch(0.54 0.17 290)",
    onPrimary: "oklch(0.985 0 0)",
    charts: ["oklch(0.56 0.17 290)", "oklch(0.68 0.14 320)", "oklch(0.62 0.12 260)", "oklch(0.45 0.13 300)", "oklch(0.8 0.09 305)"],
  },
  graphite: {
    label: "Graphite",
    description: "Neutral and matter-of-fact: plain data, technical details, no strong mood",
    primary: "oklch(0.3 0.01 260)",
    onPrimary: "oklch(0.985 0 0)",
    charts: ["oklch(0.35 0.01 260)", "oklch(0.55 0.02 250)", "oklch(0.7 0.02 250)", "oklch(0.45 0.03 230)", "oklch(0.82 0.01 250)"],
  },
} as const satisfies Record<string, Palette>

export type ThemeId = keyof typeof THEMES

/** CSS variables that re-colour shadcn components inside the wrapper they're applied to. */
export function themeStyle(id: ThemeId | undefined): CSSProperties | undefined {
  const theme = id && THEMES[id]
  if (!theme) return undefined
  return {
    "--primary": theme.primary,
    "--primary-foreground": theme.onPrimary,
    "--ring": theme.primary,
    ...Object.fromEntries(theme.charts.map((c, i) => [`--chart-${i + 1}`, c])),
  } as CSSProperties
}

export const TONES = {
  neutral: "Plain information with no good or bad reading",
  good: "Good news: healthy, safe, pleasant, or a gain",
  caution: "Worth watching: moderate risk or getting close to a limit",
  bad: "Bad news: danger, loss, extreme, or unpleasant",
  signed: "Positive values are good and negative values are bad, such as a price change or profit",
} as const

export type ToneId = keyof typeof TONES

/** Text colour for a number given the tone Jev picked for its field. */
export function toneClass(tone: ToneId | undefined, value?: number): string | undefined {
  const resolved = tone === "signed" ? (value === undefined || value === 0 ? "neutral" : value > 0 ? "good" : "bad") : tone
  return {
    good: "text-emerald-600 dark:text-emerald-400",
    caution: "text-amber-600 dark:text-amber-400",
    bad: "text-red-600 dark:text-red-400",
    neutral: undefined,
  }[resolved ?? "neutral"]
}
