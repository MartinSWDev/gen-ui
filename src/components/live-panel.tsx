"use client"

import * as React from "react"
import {
  Activity,
  Bitcoin,
  BookOpen,
  ChevronDown,
  CloudSun,
  Newspaper,
  Pause,
  Play,
  RefreshCw,
  Satellite,
  Shuffle,
  type LucideIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { averageConfidence } from "@/components/compose-output"
import { ComposedView } from "@/components/composed-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { LAYOUTS, type ComponentId, type LayoutId, type RegionId } from "@/lib/compose"
import { LIVE_SOURCES, LIVE_SOURCE_IDS, type LiveResponse, type LiveSourceId } from "@/lib/live-sources"
import { cn } from "@/lib/utils"

const SOURCE_ICONS: Record<LiveSourceId, LucideIcon> = {
  weather: CloudSun,
  earthquakes: Activity,
  crypto: Bitcoin,
  iss: Satellite,
  wikipedia: BookOpen,
  hackernews: Newspaper,
}

const INTERVALS = [15, 30, 60] as const
// An open tab shouldn't spend API credits forever.
const AUTO_PAUSE_MS = 10 * 60_000
const MAX_TICKS = 40

type SourceMode = "rotate" | LiveSourceId

type Tick = LiveResponse & { n: number; clientMs: number; receivedAt: number }

const ms = (v: number | undefined) => (v === undefined ? "—" : `${Math.round(v)} ms`)

function percentile(values: number[], p: number) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

function clock(msLeft: number) {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function LivePanel({ active }: { active: boolean }) {
  const [running, setRunning] = React.useState(false)
  const [startedAt, setStartedAt] = React.useState(0)
  const [intervalSec, setIntervalSec] = React.useState<(typeof INTERVALS)[number]>(30)
  const [sourceMode, setSourceMode] = React.useState<SourceMode>("rotate")
  const [ticks, setTicks] = React.useState<Tick[]>([])
  const [selected, setSelected] = React.useState<number | null>(null)
  const [inFlight, setInFlight] = React.useState<LiveSourceId | null>(null)
  const [nextAt, setNextAt] = React.useState<number | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(0)

  const tickCount = React.useRef(0)
  const sourceCounts = React.useRef<Partial<Record<LiveSourceId, number>>>({})
  // Settings the running loop reads without restarting.
  const settings = React.useRef({ intervalSec, sourceMode, active })
  React.useEffect(() => {
    settings.current = { intervalSec, sourceMode, active }
  }, [intervalSec, sourceMode, active])

  const runTick = React.useCallback(async (): Promise<"ok" | "error" | "fatal"> => {
    const n = ++tickCount.current
    const { sourceMode } = settings.current
    const source = sourceMode === "rotate" ? LIVE_SOURCE_IDS[(n - 1) % LIVE_SOURCE_IDS.length] : sourceMode
    // Per-source counter, so weather cycles through every city even when sources rotate.
    const sourceTick = (sourceCounts.current[source] = (sourceCounts.current[source] ?? -1) + 1)

    setInFlight(source)
    const t0 = performance.now()
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, tick: sourceTick }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`)
        return res.status === 500 ? "fatal" : "error"
      }
      const tick: Tick = { ...(body as LiveResponse), n, clientMs: performance.now() - t0, receivedAt: Date.now() }
      setTicks((prev) => [tick, ...prev].slice(0, MAX_TICKS))
      setError(null)
      return "ok"
    } catch (e) {
      setError((e as Error).message)
      return "error"
    } finally {
      setInFlight(null)
    }
  }, [])

  // The feed loop: tick, wait the interval, repeat. Waits (without spending credits)
  // while the browser tab is hidden or another app tab is open.
  React.useEffect(() => {
    if (!running) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const loop = async () => {
      if (cancelled) return
      if (Date.now() - startedAt > AUTO_PAUSE_MS) {
        setRunning(false)
        setNotice("Paused after 10 minutes to save API credits. Press Resume to keep going.")
        return
      }
      if (document.hidden || !settings.current.active) {
        setNextAt(null)
        timer = setTimeout(loop, 1000)
        return
      }
      const outcome = await runTick()
      if (cancelled) return
      if (outcome === "fatal") {
        setRunning(false)
        return
      }
      const delay = settings.current.intervalSec * 1000
      setNextAt(Date.now() + delay)
      timer = setTimeout(loop, delay)
    }

    timer = setTimeout(loop, 0)
    const clockTimer = setInterval(() => setNow(Date.now()), 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
      clearInterval(clockTimer)
    }
  }, [running, startedAt, runTick])

  function start() {
    setNotice(null)
    setSelected(null)
    setStartedAt(Date.now())
    setNow(Date.now())
    setRunning(true)
  }

  function pause() {
    setRunning(false)
    setNextAt(null)
  }

  const view = (selected !== null && ticks.find((t) => t.n === selected)) || ticks[0]
  const jevTimes = ticks.map((t) => t.compose.timing.jevMs)
  const countdown = running && nextAt && !inFlight ? Math.max(0, nextAt - now) : null

  const chartData = [...ticks]
    .slice(0, 20)
    .reverse()
    .map((t) => ({ tick: `#${t.n}`, fetch: Math.round(t.sourceMs), jev: Math.round(t.compose.timing.jevMs) }))
  const chartConfig = {
    fetch: { label: "Data fetch", color: "var(--chart-2)" },
    jev: { label: "Jev decision", color: "var(--chart-1)" },
  } satisfies ChartConfig

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ---------- controls ---------- */}
      <div className="flex flex-col gap-6 lg:sticky lg:top-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                {running && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
                <span className={cn("relative inline-flex size-2.5 rounded-full", running ? "bg-emerald-500" : "bg-muted-foreground/40")} />
              </span>
              Live feed
            </CardTitle>
            <CardDescription>
              {inFlight
                ? `Fetching ${LIVE_SOURCES[inFlight].label} and asking Jev…`
                : countdown !== null
                  ? `Next update in ${Math.ceil(countdown / 1000)}s`
                  : running
                    ? "Waiting for this tab to be visible"
                    : ticks.length > 0
                      ? "Paused"
                      : "Not started"}
            </CardDescription>
            <CardAction>
              {running && <span className="text-xs tabular-nums text-muted-foreground">auto-pause in {clock(AUTO_PAUSE_MS - (now - startedAt))}</span>}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Progress
              value={countdown !== null ? 100 - (countdown / (intervalSec * 1000)) * 100 : inFlight ? 100 : 0}
              className={cn("h-1", inFlight && "animate-pulse")}
            />

            <div className="flex gap-2">
              {running ? (
                <Button size="lg" variant="secondary" className="flex-1" onClick={pause}>
                  <Pause />
                  Pause
                </Button>
              ) : (
                <Button size="lg" className="flex-1" onClick={start}>
                  <Play />
                  {ticks.length > 0 ? "Resume" : "Start live feed"}
                </Button>
              )}
              <Button size="lg" variant="outline" disabled={!!inFlight} onClick={() => runTick()}>
                {inFlight ? <Spinner /> : <RefreshCw />}
                Update now
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Update every</span>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={String(intervalSec)}
                onValueChange={(v) => v && setIntervalSec(Number(v) as (typeof INTERVALS)[number])}
              >
                {INTERVALS.map((s) => (
                  <ToggleGroupItem key={s} value={String(s)} className="px-3">
                    {s}s
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Source</span>
              <SourceOption
                icon={Shuffle}
                label="Rotate through all"
                description="A different API every update, so the layout has to adapt"
                selected={sourceMode === "rotate"}
                onSelect={() => setSourceMode("rotate")}
              />
              {LIVE_SOURCE_IDS.map((id) => (
                <SourceOption
                  key={id}
                  icon={SOURCE_ICONS[id]}
                  label={LIVE_SOURCES[id].label}
                  description={LIVE_SOURCES[id].description}
                  provider={{ name: LIVE_SOURCES[id].provider, href: LIVE_SOURCES[id].homepage }}
                  selected={sourceMode === id}
                  onSelect={() => setSourceMode(id)}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Each update makes one Jev call. The feed pauses while this browser tab is hidden and stops after 10
              minutes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Speed</CardTitle>
            <CardDescription>Data fetch = the public API. Jev decision = composing the page, timed on the server.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-3">
              <Metric label="Jev p50" value={ms(percentile(jevTimes, 50))} />
              <Metric label="Jev p95" value={ms(percentile(jevTimes, 95))} />
              <Metric label="Fetch p50" value={ms(percentile(ticks.map((t) => t.sourceMs), 50))} />
              <Metric label="Updates" value={String(ticks.length)} />
            </div>
            {chartData.length > 0 ? (
              <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full">
                <BarChart data={chartData} margin={{ left: 0, right: 0, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={6} minTickGap={8} />
                  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v}ms`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="jev" stackId="t" fill="var(--color-jev)" isAnimationActive={false} />
                  <Bar dataKey="fetch" stackId="t" fill="var(--color-fetch)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">Timings appear after the first update.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------- output ---------- */}
      <div className="flex min-w-0 flex-col gap-6">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
        )}
        {notice && <div className="rounded-xl border bg-card px-4 py-3 text-sm">{notice}</div>}

        {!view ? (
          <Card className="min-h-[520px] justify-center">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{inFlight ? <Spinner /> : <Activity />}</EmptyMedia>
                <EmptyTitle>{inFlight ? `Fetching ${LIVE_SOURCES[inFlight].label}…` : "Watch Jev adapt in real time"}</EmptyTitle>
                <EmptyDescription>
                  Every update pulls fresh data from a public API and Jev composes a new page for it. With Rotate
                  through all, the data changes shape every time.
                </EmptyDescription>
              </EmptyHeader>
              {!running && (
                <EmptyContent>
                  <Button onClick={start}>
                    <Play />
                    Start live feed
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          </Card>
        ) : (
          <LiveView tick={view} isLatest={view === ticks[0]} onBackToLatest={() => setSelected(null)} />
        )}

        {ticks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Updates</CardTitle>
              <CardDescription>Newest first. Click a row to see the page Jev composed for it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Layout</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                    <TableHead className="text-right">Conf.</TableHead>
                    <TableHead className="text-right">Fetch</TableHead>
                    <TableHead className="text-right">Jev</TableHead>
                    <TableHead className="text-right">Round trip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {ticks.map((t) => {
                    const Icon = SOURCE_ICONS[t.source]
                    const parts = t.compose.nodes.filter((node) => node.component.choice !== "hidden").length
                    return (
                      <TableRow
                        key={t.n}
                        onClick={() => setSelected(t === ticks[0] ? null : t.n)}
                        data-state={t === view ? "selected" : undefined}
                        className="cursor-pointer"
                      >
                        <TableCell className="text-muted-foreground">{t.n}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Icon className="size-4 text-muted-foreground" />
                            {LIVE_SOURCES[t.source].label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {LAYOUTS[t.compose.layout.choice as LayoutId]?.label} · {parts} parts
                        </TableCell>
                        <TableCell className="text-right">{t.compose.questionCount}</TableCell>
                        <TableCell className="text-right">{averageConfidence(t.compose).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{ms(t.sourceMs)}</TableCell>
                        <TableCell className="text-right font-medium">{ms(t.compose.timing.jevMs)}</TableCell>
                        <TableCell className="text-right">{ms(t.clientMs)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function LiveView({ tick, isLatest, onBackToLatest }: { tick: Tick; isLatest: boolean; onBackToLatest: () => void }) {
  const Icon = SOURCE_ICONS[tick.source]
  const source = LIVE_SOURCES[tick.source]
  const { compose } = tick
  const picks = Object.fromEntries(compose.nodes.map((n) => [n.path, n.component.choice as ComponentId]))
  const regions = Object.fromEntries(compose.nodes.filter((n) => n.region).map((n) => [n.path, n.region!.choice as RegionId]))
  const parts = compose.nodes.filter((n) => n.component.choice !== "hidden").length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {source.label}
        </CardTitle>
        <CardDescription>
          {tick.intent} · via{" "}
          <a href={source.homepage} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {source.provider}
          </a>{" "}
          at {new Date(tick.receivedAt).toLocaleTimeString()}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {isLatest ? (
            <Badge variant="outline">Latest · #{tick.n}</Badge>
          ) : (
            <Button size="xs" variant="outline" onClick={onBackToLatest}>
              Back to latest
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-4">
          <Metric label="Data fetch" value={ms(tick.sourceMs)} />
          <Metric label={`Jev · ${compose.questionCount} questions`} value={ms(compose.timing.jevMs)} />
          <Metric label="Round trip" value={ms(tick.clientMs)} />
          <Metric label="Composed" value={`${LAYOUTS[compose.layout.choice as LayoutId]?.label} · ${parts} parts`} />
        </div>

        <div key={tick.n} className="animate-in duration-500 fade-in-0 slide-in-from-bottom-2">
          <ComposedView data={tick.data} layout={compose.layout.choice as LayoutId} picks={picks} regions={regions} />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group w-fit text-muted-foreground">
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
              Data sent to Jev
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="mt-2 h-72 rounded-lg border bg-muted/30">
              <pre className="p-4 font-mono text-xs leading-relaxed">{JSON.stringify(tick.data, null, 2)}</pre>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function SourceOption({
  icon: Icon,
  label,
  description,
  provider,
  selected,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  description: string
  provider?: { name: string; href: string }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:bg-muted",
        selected && "border-border bg-muted",
      )}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex flex-1 items-start gap-3 text-left">
        <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-foreground" : "text-muted-foreground")} />
        <span className="flex flex-col">
          <span className={cn("text-sm", selected && "font-medium")}>{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </span>
      </button>
      {provider && (
        <a href={provider.href} target="_blank" rel="noreferrer" className="shrink-0 pt-0.5 text-xs text-muted-foreground underline-offset-4 hover:underline">
          {provider.name}
        </a>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}
