"use client"

import * as React from "react"
import {
  Braces,
  ChartColumn,
  ChartLine,
  ChartPie,
  Gauge,
  History,
  LayoutGrid,
  Loader2,
  Play,
  Rows3,
  Table as TableIcon,
  Timer,
  type LucideIcon,
} from "lucide-react"

import { RenderedDisplay, resolveBindings } from "@/components/rendered-display"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { DISPLAYS, DISPLAY_IDS, NONE, type ChoiceAnswer, type DecideResponse, type DisplayId } from "@/lib/displays"
import { SAMPLES } from "@/lib/samples"
import { analyze, type Shape } from "@/lib/shape"
import { cn } from "@/lib/utils"

const ICONS: Record<DisplayId, LucideIcon> = {
  line_chart: ChartLine,
  bar_chart: ChartColumn,
  pie_chart: ChartPie,
  stat_cards: Gauge,
  data_table: TableIcon,
  card_grid: LayoutGrid,
  detail_view: Rows3,
  timeline: History,
  raw_json: Braces,
}

const BENCH_RUNS = 10

type Result = DecideResponse & { clientMs: number; shape: Shape; inputLabel: string }

type Run = {
  n: number
  inputLabel: string
  display?: DisplayId
  confidence?: number
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
const pct = (v: number) => `${Math.round(v * 100)}%`

export function Playground() {
  const [text, setText] = React.useState(() => stringify(SAMPLES[0].data))
  const [intent, setIntent] = React.useState(SAMPLES[0].intent)
  const [result, setResult] = React.useState<Result | null>(null)
  const [override, setOverride] = React.useState<DisplayId | null>(null)
  const [runs, setRuns] = React.useState<Run[]>([])
  const [error, setError] = React.useState<string | null>(null)
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

  async function decideOnce(): Promise<boolean> {
    if (!parsed.ok) return false
    const n = ++runCount.current
    const t0 = performance.now()
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsed.data, intent }),
      })
      const body = await res.json()
      const clientMs = performance.now() - t0
      if (!res.ok) throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { clientMs })

      const r = body as DecideResponse
      setResult({ ...r, clientMs, shape: analyze(parsed.data), inputLabel })
      setOverride(null)
      setError(null)
      setRuns((prev) => [
        {
          n,
          inputLabel,
          display: r.decision.display.choice as DisplayId,
          confidence: r.decision.display.confidence,
          jevMs: r.timing.jevMs,
          clientMs,
          tokens: r.usage.input_tokens + r.usage.output_tokens,
        },
        ...prev,
      ])
      return true
    } catch (e) {
      const err = e as Error & { clientMs?: number }
      setError(err.message)
      setRuns((prev) => [{ n, inputLabel, clientMs: err.clientMs ?? performance.now() - t0, error: err.message }, ...prev])
      return false
    }
  }

  async function run(times: number) {
    if (busy || !parsed.ok) return
    setBusy({ done: 0, total: times })
    for (let i = 0; i < times; i++) {
      const ok = await decideOnce()
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

  const okRuns = runs.filter((r) => r.jevMs !== undefined)
  const jevTimes = okRuns.map((r) => r.jevMs!)
  const clientTimes = okRuns.map((r) => r.clientMs)

  const jevPick = result?.decision.display.choice as DisplayId | undefined
  const shown = override ?? jevPick
  const bindings = result ? resolveBindings(result.decision, result.shape.fields) : null

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Jev UI picker</h1>
          <p className="text-sm text-muted-foreground">
            Paste JSON. Jev picks the shadcn display and field bindings in one call. The app renders it.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono">{result?.model ?? "jev-latest"}</Badge>
          <span>9 displays · 5 questions per call</span>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ---------- input column ---------- */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <CardTitle>Input</CardTitle>
              <CardDescription>Start from a sample or paste your own JSON.</CardDescription>
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
                  Pick display
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
              <CardTitle>Speed</CardTitle>
              <CardDescription>
                Jev = the TypeSafe API call, timed on the server. Round trip = browser → Next.js → TypeSafe → browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Jev, last run" value={ms(result?.timing.jevMs)} large />
                <Metric label="Round trip, last run" value={ms(result?.clientMs)} large />
              </div>
              <div className="grid grid-cols-4 gap-3 border-t pt-4">
                <Metric label="Jev p50" value={ms(percentile(jevTimes, 50))} />
                <Metric label="Jev p95" value={ms(percentile(jevTimes, 95))} />
                <Metric label="Trip p50" value={ms(percentile(clientTimes, 50))} />
                <Metric label="Runs" value={String(okRuns.length)} />
              </div>
              {result && (
                <p className="text-xs text-muted-foreground">
                  Last call used {result.usage.input_tokens} input and {result.usage.output_tokens} output tokens.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---------- output column ---------- */}
        <div className="flex min-w-0 flex-col gap-6">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!result ? (
            <Card className="min-h-[420px] items-center justify-center text-center">
              <CardContent className="flex max-w-sm flex-col items-center gap-2">
                <LayoutGrid className="size-8 text-muted-foreground" />
                <p className="font-medium">No decision yet</p>
                <p className="text-sm text-muted-foreground">
                  Pick a sample and press Pick display. Jev chooses one of {DISPLAY_IDS.length} shadcn displays, and
                  the chosen component renders here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Decision</CardTitle>
                  <CardDescription>
                    {result.inputLabel} · click any option to render it instead
                  </CardDescription>
                  <CardAction>
                    <Badge variant="secondary" className="tabular-nums">
                      confidence {result.decision.display.confidence.toFixed(2)}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
                  <ProbabilityList
                    answer={result.decision.display}
                    shown={shown!}
                    onSelect={(id) => setOverride(id === jevPick ? null : id)}
                  />
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-medium text-muted-foreground">Field bindings</p>
                    <Binding role="Label" answer={result.decision.primary_field} />
                    <Binding role="Value" answer={result.decision.value_field} />
                    <Binding role="Time" answer={result.decision.time_field} />
                    <Binding role="Badge" answer={result.decision.status_field} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {React.createElement(ICONS[shown!], { className: "size-4 text-muted-foreground" })}
                    {DISPLAYS[shown!].label}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">{DISPLAYS[shown!].component}</CardDescription>
                  <CardAction>
                    {override ? (
                      <Button size="xs" variant="outline" onClick={() => setOverride(null)}>
                        Back to Jev’s pick
                      </Button>
                    ) : (
                      <Badge variant="outline">Jev’s pick</Badge>
                    )}
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <RenderedDisplay display={shown!} shape={result.shape} bindings={bindings!} />
                </CardContent>
              </Card>
            </>
          )}

          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Run history</CardTitle>
                <CardDescription>Newest first. Runs are sequential and never retried.</CardDescription>
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
                      <TableHead>Input</TableHead>
                      <TableHead>Pick</TableHead>
                      <TableHead className="text-right">Conf.</TableHead>
                      <TableHead className="text-right">Jev</TableHead>
                      <TableHead className="text-right">Round trip</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="tabular-nums">
                    {runs.slice(0, 50).map((r) => (
                      <TableRow key={r.n}>
                        <TableCell className="text-muted-foreground">{r.n}</TableCell>
                        <TableCell>{r.inputLabel}</TableCell>
                        <TableCell>
                          {r.error ? (
                            <span className="text-destructive">Error</span>
                          ) : (
                            DISPLAYS[r.display!]?.label ?? r.display
                          )}
                        </TableCell>
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
    </div>
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

function ProbabilityList({
  answer,
  shown,
  onSelect,
}: {
  answer: ChoiceAnswer
  shown: DisplayId
  onSelect: (id: DisplayId) => void
}) {
  const rows = DISPLAY_IDS.map((id) => ({ id, p: answer.probabilities[id] ?? 0 })).sort((a, b) => b.p - a.p)
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map(({ id, p }) => {
        const Icon = ICONS[id]
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onSelect(id)}
              className={cn(
                "grid w-full grid-cols-[1rem_7rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                id === shown && "bg-muted",
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className={cn("truncate", id === answer.choice && "font-medium")}>{DISPLAYS[id].label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("block h-full rounded-full", id === answer.choice ? "bg-primary" : "bg-muted-foreground/40")}
                  style={{ width: `${Math.max(p * 100, p > 0 ? 1 : 0)}%` }}
                />
              </span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">{pct(p)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Binding({ role, answer }: { role: string; answer?: ChoiceAnswer }) {
  const none = !answer || answer.choice === NONE
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{role}</span>
      <span className="flex min-w-0 items-center gap-2">
        <code className={cn("truncate font-mono text-xs", none && "text-muted-foreground")}>
          {answer ? answer.choice : "not asked"}
        </code>
        {answer && <span className="text-xs tabular-nums text-muted-foreground">{pct(answer.probabilities[answer.choice] ?? 0)}</span>}
      </span>
    </div>
  )
}
