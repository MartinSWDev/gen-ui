"use client"

import * as React from "react"
import { ArrowDownWideNarrow, Bitcoin, ChartSpline, CloudSun, Crosshair, ListFilter, Palette, RefreshCw, Sparkles, type LucideIcon } from "lucide-react"

import { ComposedView } from "@/components/composed-view"
import { Sparkline, humanize } from "@/components/rendered-display"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ASK_DATASETS, type AskDatasetId } from "@/lib/ask-datasets"
import { LAYOUTS, resolveList, viewDecisions, windowRange, type ComposeResponse } from "@/lib/compose"
import { THEMES, themeStyle, type ThemeId } from "@/lib/themes"
import { cn } from "@/lib/utils"

const DATASET_ICONS: Record<AskDatasetId, LucideIcon> = { weather: CloudSun, crypto: Bitcoin }

// Long enough to skip mid-word keystrokes, short enough to feel live.
const DEBOUNCE_MS = 350

type Dataset = { data: unknown; loadedAt: number }

type Answer = ComposeResponse & { n: number; question: string; dataset: AskDatasetId; clientMs: number }

type Chip = { key: string; icon: LucideIcon; label: string }

const ms = (v: number) => `${Math.round(v)} ms`

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** A readable summary of what Jev decided, one chip per decision that shapes the page. */
function decisionChips(answer: Answer): Chip[] {
  const theme = THEMES[answer.theme.choice as ThemeId]
  const chips: Chip[] = [
    { key: "theme", icon: Palette, label: `${theme?.label ?? answer.theme.choice} theme` },
    { key: "layout", icon: Sparkles, label: `${LAYOUTS[answer.layout.choice as keyof typeof LAYOUTS]?.label ?? answer.layout.choice} layout` },
  ]
  for (const list of answer.lists) {
    const { focus, sort, limit } = resolveList(list)
    if (focus.length > 0) {
      chips.push({ key: `focus:${list.path}`, icon: Crosshair, label: `Focused on ${focus.join(" and ")}` })
    }
    if (sort) {
      const name = humanize(sort.key).toLowerCase().replace(/ \(.*\)$/, "")
      chips.push({ key: `sort:${list.path}`, icon: ArrowDownWideNarrow, label: `${sort.dir === "asc" ? "Lowest" : "Highest"} ${name} first` })
    }
    if (limit !== Infinity) {
      chips.push({ key: `limit:${list.path}`, icon: ListFilter, label: limit === 1 ? "Top result only" : `Top ${limit}` })
    }
  }
  for (const node of answer.nodes) {
    if (!node.window || !node.length) continue
    // Only mention windows on series that are actually drawn, directly or as a list's chart.
    const listPath = node.path.split("[]")[0]
    const drawnByList = node.path.includes("[]") && ["line_chart", "bar_chart"].includes(answer.nodes.find((n) => n.path === listPath)?.component.choice ?? "")
    if (node.component.choice === "hidden" && !drawnByList) continue
    const [start, end] = windowRange(node.length, node.window.choice)
    if (end - start < node.length) {
      const where = start === 0 ? "first" : "last"
      chips.push({ key: `window:${node.path}`, icon: ChartSpline, label: `${humanize(node.key).replace(/ \(.*\)$/, "")}: ${where} ${end - start} of ${node.length}` })
    }
  }
  const hidden = answer.nodes.filter((n) => n.component.choice === "hidden").length
  if (hidden > 0) chips.push({ key: "hidden", icon: ListFilter, label: `${hidden} of ${answer.nodes.length} fields hidden` })
  return chips
}

export function AskPanel({ active }: { active: boolean }) {
  const [datasetId, setDatasetId] = React.useState<AskDatasetId>("weather")
  const [datasets, setDatasets] = React.useState<Partial<Record<AskDatasetId, Dataset>>>({})
  const [question, setQuestion] = React.useState("")
  const [answer, setAnswer] = React.useState<Answer | null>(null)
  const [previous, setPrevious] = React.useState<Answer | null>(null)
  const [history, setHistory] = React.useState<Answer[]>([])
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const seq = React.useRef(0)
  const lastSent = React.useRef<string | null>(null)
  const answerRef = React.useRef<Answer | null>(null)

  const loadDataset = React.useCallback(async (id: AskDatasetId) => {
    try {
      const res = await fetch("/api/dataset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setDatasets((prev) => ({ ...prev, [id]: { data: body.data, loadedAt: Date.now() } }))
      lastSent.current = null
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  const decide = React.useCallback(async (q: string, id: AskDatasetId, data: unknown) => {
    const n = ++seq.current
    lastSent.current = `${id}:${q}`
    setPending(true)
    const t0 = performance.now()
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, intent: q }),
      })
      const body = await res.json()
      // A newer question was asked while this one was in flight; its answer wins.
      if (n !== seq.current) return
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const next: Answer = { ...(body as ComposeResponse), n, question: q, dataset: id, clientMs: performance.now() - t0 }
      setPrevious(answerRef.current?.dataset === id ? answerRef.current : null)
      answerRef.current = next
      setAnswer(next)
      setHistory((prev) => [next, ...prev].slice(0, 30))
      setError(null)
    } catch (e) {
      if (n === seq.current) setError((e as Error).message)
    } finally {
      if (n === seq.current) setPending(false)
    }
  }, [])

  const dataset = datasets[datasetId]

  // Load the dataset the first time its tab is shown.
  React.useEffect(() => {
    if (!active || dataset) return
    const timer = setTimeout(() => loadDataset(datasetId), 0)
    return () => clearTimeout(timer)
  }, [active, dataset, datasetId, loadDataset])

  // Re-decide shortly after typing pauses, and whenever the dataset changes.
  React.useEffect(() => {
    if (!active || !dataset) return
    const q = question.trim()
    if (lastSent.current === `${datasetId}:${q}`) return
    const timer = setTimeout(() => decide(q, datasetId, dataset.data), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [active, question, datasetId, dataset, decide])

  function ask(q: string) {
    setQuestion(q)
    if (dataset) decide(q.trim(), datasetId, dataset.data)
  }

  const shown = answer?.dataset === datasetId ? answer : null
  const theme = shown?.theme.choice as ThemeId | undefined
  const chips = shown ? decisionChips(shown) : []
  const previousChips = new Set(previous ? decisionChips(previous).map((c) => `${c.key}=${c.label}`) : [])
  const recent = history.filter((h) => h.dataset === datasetId)
  const jevTrend = recent.slice(0, 20).map((h) => h.timing.jevMs).reverse()
  const meta = ASK_DATASETS[datasetId]

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- question bar, tinted with Jev's theme ---------- */}
      <Card style={themeStyle(theme)} className="overflow-hidden py-0">
        <div className="flex flex-col gap-5 bg-gradient-to-br from-primary/25 via-primary/8 to-transparent p-5 transition-colors duration-700 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              value={datasetId}
              onValueChange={(v) => v && setDatasetId(v as AskDatasetId)}
              className="bg-background/80"
            >
              {(Object.keys(ASK_DATASETS) as AskDatasetId[]).map((id) => {
                const Icon = DATASET_ICONS[id]
                return (
                  <ToggleGroupItem key={id} value={id} className="gap-2 px-3">
                    <Icon />
                    {ASK_DATASETS[id].label}
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {dataset && (
                <span>
                  Live data from{" "}
                  <a href={meta.homepage} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    {meta.provider}
                  </a>{" "}
                  · {new Date(dataset.loadedAt).toLocaleTimeString()}
                </span>
              )}
              <Button size="xs" variant="outline" className="bg-background/80" onClick={() => loadDataset(datasetId)}>
                <RefreshCw />
                Refresh data
              </Button>
            </div>
          </div>

          <div className="relative">
            <Sparkles className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-primary" />
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask(question)}
              placeholder={`Ask anything about ${meta.label.toLowerCase()}…`}
              aria-label="Question"
              className="h-14 rounded-xl bg-background pr-28 pl-12 text-lg shadow-sm md:text-lg"
            />
            <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
              {pending || !dataset ? (
                <Spinner className="text-primary" />
              ) : shown ? (
                <Badge className="tabular-nums">{ms(shown.timing.jevMs)}</Badge>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Try:</span>
            {meta.prompts.map((p) => (
              <Button
                key={p}
                size="sm"
                variant="outline"
                onClick={() => ask(p)}
                className={cn("rounded-full bg-background/80", question === p && "border-primary text-primary")}
              >
                {p}
              </Button>
            ))}
          </div>

          {shown && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  Jev made {shown.questionCount} decisions in {ms(shown.timing.jevMs)}
                </span>
                {chips.map((chip) => {
                  const changed = previous !== null && !previousChips.has(`${chip.key}=${chip.label}`)
                  return (
                    <Badge
                      key={`${shown.n}:${chip.key}`}
                      variant="outline"
                      className={cn(
                        "gap-1 bg-background/80",
                        changed && "animate-in border-primary text-primary duration-500 fade-in-0 zoom-in-95",
                      )}
                    >
                      <chip.icon />
                      {chip.label}
                    </Badge>
                  )
                })}
              </div>
              {jevTrend.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Jev · median {ms(median(jevTrend))}</span>
                  <Sparkline values={jevTrend} />
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* ---------- the page Jev composed ---------- */}
      <Card className="min-h-[480px]">
        <CardContent className={cn("transition-opacity duration-300", pending && "opacity-60")}>
          {shown && dataset ? (
            <div key={shown.n} className="animate-in duration-500 fade-in-0 slide-in-from-bottom-2">
              <ComposedView data={dataset.data} {...viewDecisions(shown)} />
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Spinner className="size-6" />
              {dataset ? "Jev is composing the page…" : `Loading ${meta.label.toLowerCase()}…`}
            </div>
          )}
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Questions asked</CardTitle>
            <CardDescription>Every answer is one Jev call over the same data. Only the question changes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead>Theme</TableHead>
                  <TableHead>Layout</TableHead>
                  <TableHead className="text-right">Decisions</TableHead>
                  <TableHead className="text-right">Jev</TableHead>
                  <TableHead className="text-right">Round trip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {recent.map((h) => {
                  const t = THEMES[h.theme.choice as ThemeId]
                  return (
                    <TableRow key={h.n}>
                      <TableCell className="max-w-72 truncate">{h.question || <span className="text-muted-foreground">(no question)</span>}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span className="size-3 rounded-full" style={{ background: t?.primary }} />
                          {t?.label ?? h.theme.choice}
                        </span>
                      </TableCell>
                      <TableCell>{LAYOUTS[h.layout.choice as keyof typeof LAYOUTS]?.label}</TableCell>
                      <TableCell className="text-right">{h.questionCount}</TableCell>
                      <TableCell className="text-right font-medium">{ms(h.timing.jevMs)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{ms(h.clientMs)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
