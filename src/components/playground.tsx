"use client"

import * as React from "react"
import { Blocks, LayoutTemplate, Loader2, Play, Radio, Sparkles, Timer, type LucideIcon } from "lucide-react"

import { AskPanel } from "@/components/ask-panel"
import { ComposeOutput, averageConfidence, type ComposeOverrides, type ComposeResult } from "@/components/compose-output"
import { LivePanel } from "@/components/live-panel"
import { TemplatesOutput, type TemplateResult } from "@/components/templates-output"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { LAYOUTS, type ComposeResponse, type LayoutId } from "@/lib/compose"
import { DISPLAYS, type DecideResponse, type DisplayId } from "@/lib/displays"
import { SAMPLES } from "@/lib/samples"
import { analyze } from "@/lib/shape"
import { cn } from "@/lib/utils"

type Mode = "ask" | "templates" | "compose" | "live"
/** Tabs driven by the shared JSON input */
type InputMode = Exclude<Mode, "ask" | "live">

const ENDPOINTS: Record<InputMode, string> = { templates: "/api/decide", compose: "/api/compose" }

const MODES: Record<Mode, { label: string; icon: LucideIcon; summary: string; bestFor: string }> = {
  ask: {
    label: "Ask",
    icon: Sparkles,
    summary:
      "Ask a question about live weather or crypto data and Jev redesigns the page to answer it as you type: which fields to show and how, what to focus on, how to sort, and the colour theme. " +
      "Every answer is a single Jev call over the same data, and only the question changes.",
    bestFor: "Seeing decision speed you can feel. Click the suggestions or type your own question.",
  },
  templates: {
    label: "Page templates",
    icon: LayoutTemplate,
    summary:
      "Jev picks one of 9 whole-page displays (charts, table, stat cards, card grid, timeline…) and which fields feed it. " +
      "Always 5 questions per call, however big the JSON. Fast and predictable, but it can only draw what the templates support, so no images, buttons, or mixed content.",
    bestFor: "Tabular data, metrics, logs, and lists of records.",
  },
  compose: {
    label: "Compose",
    icon: Blocks,
    summary:
      "Jev picks a component for every field (heading, image, avatar, badge, button, table, rich text…), a page region for each top-level field, and the overall layout, all in one call. " +
      "The page is assembled from those picks. The question count grows with the JSON, so use this tab to see how latency scales as the decision gets bigger.",
    bestFor: "Content and entity JSON, such as blog posts, product pages, and profiles.",
  },
  live: {
    label: "Live",
    icon: Radio,
    summary:
      "Every 15, 30, or 60 seconds the server pulls fresh data from a free public API (weather, earthquakes, crypto prices, the ISS, Wikipedia edits, Hacker News) and Jev composes a new page for it. " +
      "Rotate through all sources and the data changes shape on every update, so the layout has to adapt. Timings separate the data fetch from Jev's decision.",
    bestFor: "Showing off speed and adaptability on real, changing data.",
  },
}

const BENCH_RUNS = 10

type Run = {
  n: number
  mode: InputMode
  inputLabel: string
  pick?: string
  confidence?: number
  questions?: number
  jevMs?: number
  clientMs: number
  tokens?: number
  error?: string
}

const stringify = (v: unknown) => JSON.stringify(v, null, 2)

function percentile(values: number[], p: number) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

const ms = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v)} ms`)

export function Playground() {
  const [mode, setMode] = React.useState<Mode>("ask")
  const [text, setText] = React.useState(() => stringify(SAMPLES[0].data))
  const [intent, setIntent] = React.useState(SAMPLES[0].intent)
  const [templateResult, setTemplateResult] = React.useState<TemplateResult | null>(null)
  const [templateOverride, setTemplateOverride] = React.useState<DisplayId | null>(null)
  const [composeResult, setComposeResult] = React.useState<ComposeResult | null>(null)
  const [composeOverrides, setComposeOverrides] = React.useState<ComposeOverrides>({ picks: {} })
  const [runs, setRuns] = React.useState<Run[]>([])
  const [errors, setErrors] = React.useState<Partial<Record<Mode, string>>>({})
  const [busy, setBusy] = React.useState<null | { done: number; total: number }>(null)
  const runCount = React.useRef(0)

  const parsed = React.useMemo(() => {
    try {
      return { ok: true as const, data: JSON.parse(text) as unknown }
    } catch (e) {
      return { ok: false as const, message: (e as Error).message }
    }
  }, [text])

  const inputLabel = SAMPLES.find((s) => stringify(s.data) === text)?.label ?? "Custom JSON"

  async function decideOnce(runMode: InputMode): Promise<boolean> {
    if (!parsed.ok) return false
    const n = ++runCount.current
    const t0 = performance.now()
    try {
      const res = await fetch(ENDPOINTS[runMode], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsed.data, intent }),
      })
      const body = await res.json()
      const clientMs = performance.now() - t0
      if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { clientMs })

      let run: Run
      if (runMode === "templates") {
        const r = body as DecideResponse
        setTemplateResult({ ...r, clientMs, shape: analyze(parsed.data), inputLabel })
        setTemplateOverride(null)
        run = {
          n,
          mode: runMode,
          inputLabel,
          pick: DISPLAYS[r.decision.display.choice as DisplayId]?.label ?? r.decision.display.choice,
          confidence: r.decision.display.confidence,
          questions: Object.keys(r.decision).length,
          jevMs: r.timing.jevMs,
          clientMs,
          tokens: r.usage.input_tokens + r.usage.output_tokens,
        }
      } else {
        const r = body as ComposeResponse
        setComposeResult({ ...r, clientMs, data: parsed.data, inputLabel })
        setComposeOverrides({ picks: {} })
        const shown = r.nodes.filter((node) => node.component.choice !== "hidden").length
        run = {
          n,
          mode: runMode,
          inputLabel,
          pick: `${LAYOUTS[r.layout.choice as LayoutId]?.label ?? r.layout.choice} · ${shown} parts`,
          confidence: averageConfidence(r),
          questions: r.questionCount,
          jevMs: r.timing.jevMs,
          clientMs,
          tokens: r.usage.input_tokens + r.usage.output_tokens,
        }
      }
      setErrors((prev) => ({ ...prev, [runMode]: undefined }))
      setRuns((prev) => [run, ...prev])
      return true
    } catch (e) {
      const err = e as Error & { clientMs?: number }
      setErrors((prev) => ({ ...prev, [runMode]: err.message }))
      setRuns((prev) => [
        { n, mode: runMode, inputLabel, clientMs: err.clientMs ?? performance.now() - t0, error: err.message },
        ...prev,
      ])
      return false
    }
  }

  async function run(times: number) {
    if (busy || !parsed.ok || mode === "live" || mode === "ask") return
    const runMode = mode
    setBusy({ done: 0, total: times })
    for (let i = 0; i < times; i++) {
      const ok = await decideOnce(runMode)
      setBusy({ done: i + 1, total: times })
      if (!ok) break
    }
    setBusy(null)
  }

  function loadSample(id: string) {
    const sample = SAMPLES.find((s) => s.id === id)!
    setText(stringify(sample.data))
    setIntent(sample.intent)
  }

  const modeRuns = runs.filter((r) => r.mode === mode && r.jevMs !== undefined)
  const jevTimes = modeRuns.map((r) => r.jevMs!)
  const clientTimes = modeRuns.map((r) => r.clientMs)
  const last = mode === "templates" ? templateResult : composeResult
  const lastQuestions = modeRuns[0]?.questions

  return (
    <Tabs
      value={mode}
      onValueChange={(v) => setMode(v as Mode)}
      className="mx-auto w-full max-w-[1400px] gap-6 px-4 py-6 md:px-8 md:py-8"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Jev UI picker</h1>
          <p className="text-sm text-muted-foreground">
            Jev from TypeSafe decides how to show data in one fast call, and the app renders its decisions with shadcn/ui.
          </p>
        </div>
        <Badge variant="outline" className="font-mono">{last?.model ?? "jev-latest"}</Badge>
      </header>

      <div className="flex flex-col gap-3">
        <TabsList>
          {(Object.keys(MODES) as Mode[]).map((id) => {
            const Icon = MODES[id].icon
            return (
              <TabsTrigger key={id} value={id} className="px-3">
                <Icon />
                {MODES[id].label}
              </TabsTrigger>
            )
          })}
        </TabsList>
        <div className="flex max-w-4xl flex-col gap-1 text-sm">
          <p className="text-pretty">{MODES[mode].summary}</p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Best for:</span> {MODES[mode].bestFor}
          </p>
        </div>
      </div>

      {/* Ask and Live stay mounted so their state survives tab switches; they only call Jev while visible. */}
      <TabsContent value="ask" forceMount className="data-[state=inactive]:hidden">
        <AskPanel active={mode === "ask"} />
      </TabsContent>

      <TabsContent value="live" forceMount className="data-[state=inactive]:hidden">
        <LivePanel active={mode === "live"} />
      </TabsContent>

      <div className={cn("grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]", (mode === "live" || mode === "ask") && "hidden")}>
        {/* ---------- input column, shared by both tabs ---------- */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>Shared by Page templates and Compose, so you can compare them on the same JSON.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5">
                {SAMPLES.map((s) => (
                  <Button
                    key={s.id}
                    size="xs"
                    variant={inputLabel === s.label ? "secondary" : "outline"}
                    onClick={() => loadSample(s.id)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="intent">Intent (optional)</Label>
                <Input
                  id="intent"
                  placeholder="e.g. Show how revenue is trending"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="json">JSON</Label>
                  <span className={cn("text-xs", parsed.ok ? "text-muted-foreground" : "text-destructive")}>
                    {parsed.ok ? `${(new Blob([text]).size / 1024).toFixed(1)} KB` : "Invalid JSON"}
                  </span>
                </div>
                <Textarea
                  id="json"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      run(1)
                    }
                  }}
                  aria-invalid={!parsed.ok}
                  className="field-sizing-fixed h-80 resize-y font-mono text-xs leading-relaxed"
                />
                {!parsed.ok && <p className="text-xs text-destructive">{parsed.message}</p>}
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" size="lg" disabled={!parsed.ok || !!busy} onClick={() => run(1)}>
                  {busy?.total === 1 ? <Loader2 className="animate-spin" /> : <Play />}
                  {mode === "templates" ? "Pick display" : "Compose page"}
                  <KbdGroup className="ml-1 opacity-70">
                    <Kbd className="bg-primary-foreground/15 text-primary-foreground">⌘</Kbd>
                    <Kbd className="bg-primary-foreground/15 text-primary-foreground">↵</Kbd>
                  </KbdGroup>
                </Button>
                <Button size="lg" variant="outline" disabled={!parsed.ok || !!busy} onClick={() => run(BENCH_RUNS)}>
                  {busy && busy.total > 1 ? <Loader2 className="animate-spin" /> : <Timer />}
                  {busy && busy.total > 1 ? `${busy.done}/${busy.total}` : `Bench ×${BENCH_RUNS}`}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Speed · {MODES[mode].label}</CardTitle>
              <CardDescription>
                Jev = the TypeSafe API call, timed on the server. Round trip = browser → Next.js → TypeSafe → browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Jev, last run" value={ms(last?.timing.jevMs)} large />
                <Metric label="Round trip, last run" value={ms(last?.clientMs)} large />
              </div>
              <div className="grid grid-cols-4 gap-3 border-t pt-4">
                <Metric label="Jev p50" value={ms(percentile(jevTimes, 50))} />
                <Metric label="Jev p95" value={ms(percentile(jevTimes, 95))} />
                <Metric label="Trip p50" value={ms(percentile(clientTimes, 50))} />
                <Metric label="Runs" value={String(modeRuns.length)} />
              </div>
              {last && (
                <p className="text-xs text-muted-foreground">
                  Last call asked {lastQuestions} questions and used {last.usage.input_tokens} input and{" "}
                  {last.usage.output_tokens} output tokens.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------- output column ---------- */}
        <div className="flex min-w-0 flex-col gap-6">
          {errors[mode] && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errors[mode]}
            </div>
          )}

          <TabsContent value="templates" className="flex flex-col gap-6">
            {templateResult ? (
              <TemplatesOutput result={templateResult} override={templateOverride} onOverride={setTemplateOverride} />
            ) : (
              <EmptyState icon={LayoutTemplate} action="Pick display">
                Jev will choose one of 9 shadcn displays. Try Monthly revenue, User list, or Deploy log.
              </EmptyState>
            )}
          </TabsContent>

          <TabsContent value="compose" className="flex flex-col gap-6">
            {composeResult ? (
              <ComposeOutput result={composeResult} overrides={composeOverrides} onOverrides={setComposeOverrides} />
            ) : (
              <EmptyState icon={Blocks} action="Compose page">
                Jev will pick a component for every field and assemble a page. Try Blog post or Product page.
              </EmptyState>
            )}
          </TabsContent>

          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Run history</CardTitle>
                <CardDescription>Page templates and Compose runs, newest first. Runs are sequential and never retried.</CardDescription>
                <CardAction>
                  <Button size="xs" variant="ghost" onClick={() => setRuns([])}>
                    Clear
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Tab</TableHead>
                      <TableHead>Input</TableHead>
                      <TableHead>Pick</TableHead>
                      <TableHead className="text-right">Questions</TableHead>
                      <TableHead className="text-right">Conf.</TableHead>
                      <TableHead className="text-right">Jev</TableHead>
                      <TableHead className="text-right">Round trip</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {runs.slice(0, 50).map((r) => (
                      <TableRow key={r.n} className={cn(r.mode !== mode && "text-muted-foreground")}>
                        <TableCell className="text-muted-foreground">{r.n}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{MODES[r.mode].label}</Badge>
                        </TableCell>
                        <TableCell>{r.inputLabel}</TableCell>
                        <TableCell>{r.error ? <span className="text-destructive">Error</span> : r.pick}</TableCell>
                        <TableCell className="text-right">{r.questions ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.confidence?.toFixed(2) ?? "—"}</TableCell>
                        <TableCell className="text-right font-medium">{ms(r.jevMs)}</TableCell>
                        <TableCell className="text-right">{ms(r.clientMs)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{r.tokens ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Tabs>
  )
}

function Metric({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", large ? "text-2xl tracking-tight" : "text-sm")}>{value}</span>
    </div>
  )
}

function EmptyState({ icon: Icon, action, children }: { icon: LucideIcon; action: string; children: React.ReactNode }) {
  return (
    <Card className="min-h-[420px] items-center justify-center text-center">
      <CardContent className="flex max-w-sm flex-col items-center gap-2">
        <Icon className="size-8 text-muted-foreground" />
        <p className="font-medium">No decision yet</p>
        <p className="text-sm text-muted-foreground">
          Press {action}. {children}
        </p>
      </CardContent>
    </Card>
  )
}
