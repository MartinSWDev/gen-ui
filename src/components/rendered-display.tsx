"use client"

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { NONE, type Decision, type DisplayId } from "@/lib/displays"
import { isPlainObject, type Field, type Row, type Shape } from "@/lib/shape"
import { cn } from "@/lib/utils"

type Bindings = {
  primary: string | undefined
  value: string | undefined
  time: string | undefined
  status: string | undefined
}

/** Jev's field picks, with deterministic fallbacks when a role came back empty. */
export function resolveBindings(decision: Decision, fields: Field[]): Bindings {
  const pick = (answer: Decision["value_field"]) =>
    answer && answer.choice !== NONE && fields.some((f) => f.name === answer.choice) ? answer.choice : undefined
  const firstOf = (...types: Field["type"][]) => fields.find((f) => types.includes(f.type))?.name
  return {
    primary: pick(decision.primary_field) ?? firstOf("string", "date") ?? fields[0]?.name,
    value: pick(decision.value_field) ?? firstOf("number"),
    time: pick(decision.time_field) ?? firstOf("date"),
    status: pick(decision.status_field),
  }
}

export function RenderedDisplay({ display, shape, bindings }: { display: DisplayId; shape: Shape; bindings: Bindings }) {
  switch (display) {
    case "line_chart":
    case "bar_chart":
      return <CartesianView kind={display} shape={shape} bindings={bindings} />
    case "pie_chart":
      return <DonutView shape={shape} bindings={bindings} />
    case "stat_cards":
      return <StatCards shape={shape} bindings={bindings} />
    case "data_table":
      return <DataTable rows={shape.records} fields={shape.fields} status={bindings.status} />
    case "card_grid":
      return <CardGrid shape={shape} bindings={bindings} />
    case "detail_view":
      return <DetailView record={shape.records[0] ?? {}} status={bindings.status} />
    case "timeline":
      return <TimelineView shape={shape} bindings={bindings} />
    case "raw_json":
      return <RawJson value={shape.path ? { [shape.path]: shape.records } : shape.kind === "records" ? shape.records : shape.records[0]} />
  }
}

// ---------- formatting ----------

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const full = new Intl.NumberFormat("en", { maximumFractionDigits: 3 })

// Compact for big numbers, but keep precision for rates like 0.021.
export const formatStat = (n: number) => (Math.abs(n) >= 10_000 ? compact.format(n) : full.format(n))

// Unit suffixes in field names, e.g. temperature_c → "Temperature (°C)"
const UNITS: Record<string, string> = {
  c: "°C", f: "°F", kmh: "km/h", mph: "mph", km: "km", cm: "cm", mm: "mm", kg: "kg", ms: "ms", percent: "%", usd: "USD",
}

export function humanize(key: string) {
  const unit = key.match(/_([a-z]+)$/)?.[1]
  const base = unit && UNITS[unit] ? key.slice(0, -unit.length - 1) : key
  const s = base.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim()
  const label = s.charAt(0).toUpperCase() + s.slice(1)
  return unit && UNITS[unit] ? `${label} (${UNITS[unit]})` : label
}

function toNumber(v: unknown) {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function formatDate(v: string) {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const hasTime = /T|\d{2}:\d{2}/.test(v)
  return d.toLocaleString("en", hasTime
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : /^\d{4}-\d{2}$/.test(v) ? { month: "short", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" })
}

export function badgeVariant(value: unknown): "default" | "secondary" | "destructive" | "outline" {
  const s = String(value).toLowerCase()
  if (/^(error|failed|failure|suspended|inactive|cancel+ed|critical|false|out)/.test(s)) return "destructive"
  if (/^(warn|pending|invited|draft|paused)/.test(s)) return "outline"
  if (/^(active|ok|success|shipped|paid|done|true|complete)/.test(s)) return "default"
  return "secondary"
}

const isIdField = (name: string) => /(^|_)id$/i.test(name)

export function Value({ value, isStatus }: { value: unknown; isStatus?: boolean }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>
  if (isStatus || typeof value === "boolean") {
    const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)
    return <Badge variant={badgeVariant(value)}>{text}</Badge>
  }
  if (typeof value === "number") return <span className="tabular-nums">{full.format(value)}</span>
  if (typeof value === "string") {
    return /^\d{4}-\d{2}(-\d{2})?(T|$)/.test(value) ? <span className="tabular-nums">{formatDate(value)}</span> : <>{value}</>
  }
  return <code className="font-mono text-xs text-muted-foreground">{JSON.stringify(value).slice(0, 60)}</code>
}

// ---------- charts ----------

function CartesianView({ kind, shape, bindings }: { kind: "line_chart" | "bar_chart"; shape: Shape; bindings: Bindings }) {
  const xKey = (kind === "line_chart" ? bindings.time : undefined) ?? bindings.primary
  const yKey = bindings.value
  if (!xKey || !yKey) return <Unsupported reason="Needs a label field and a numeric field." />

  const data = shape.records.slice(0, 60).map((r) => ({
    x: typeof r[xKey] === "string" && /^\d{4}-\d{2}/.test(r[xKey] as string) ? formatDate(r[xKey] as string) : String(r[xKey]),
    y: toNumber(r[yKey]),
  }))
  const config = { y: { label: humanize(yKey), color: "var(--chart-1)" } } satisfies ChartConfig
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
      <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => compact.format(v)} />
      <ChartTooltip cursor={kind === "bar_chart"} content={<ChartTooltipContent />} />
    </>
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-80 w-full">
      {kind === "line_chart" ? (
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          {axes}
          <Line dataKey="y" type="monotone" stroke="var(--color-y)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-y)" }} />
        </LineChart>
      ) : (
        <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          {axes}
          <Bar dataKey="y" fill="var(--color-y)" radius={6} />
        </BarChart>
      )}
    </ChartContainer>
  )
}

function DonutView({ shape, bindings }: { shape: Shape; bindings: Bindings }) {
  const { primary, value } = bindings
  if (!primary || !value) return <Unsupported reason="Needs a label field and a numeric field." />

  const slices = shape.records.slice(0, 8).map((r, i) => ({
    key: `s${i}`,
    value: toNumber(r[value]),
    fill: `var(--chart-${(i % 5) + 1})`,
  }))
  const config = Object.fromEntries(
    shape.records.slice(0, 8).map((r, i) => [`s${i}`, { label: String(r[primary]), color: `var(--chart-${(i % 5) + 1})` }]),
  ) satisfies ChartConfig

  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-80">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie data={slices} dataKey="value" nameKey="key" innerRadius={70} strokeWidth={4}>
          {slices.map((s) => (
            <Cell key={s.key} fill={s.fill} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" />} className="flex-wrap gap-2" />
      </PieChart>
    </ChartContainer>
  )
}

// ---------- cards & lists ----------

function StatCards({ shape, bindings }: { shape: Shape; bindings: Bindings }) {
  const stats: { label: string; value: unknown }[] =
    shape.kind === "records" && bindings.value
      ? shape.records.slice(0, 12).map((r) => ({ label: String(r[bindings.primary ?? ""] ?? ""), value: r[bindings.value!] }))
      : Object.entries(shape.records[0] ?? {})
          .filter(([, v]) => !isPlainObject(v) && !Array.isArray(v))
          .map(([k, v]) => ({ label: humanize(k), value: v }))

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((s, i) => (
        <Card key={i} size="sm">
          <CardHeader>
            <CardDescription>{s.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {typeof s.value === "number" ? formatStat(s.value) : <Value value={s.value} />}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

export function DataTable({ rows, fields, status }: { rows: Row[]; fields: Field[]; status?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {fields.map((f) => (
              <TableHead key={f.name} className={cn(f.type === "number" && "text-right")}>
                {humanize(f.name)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(0, 50).map((row, i) => (
            <TableRow key={i}>
              {fields.map((f) => (
                <TableCell key={f.name} className={cn(f.type === "number" && "text-right")}>
                  {isIdField(f.name) ? (
                    <span className="font-mono text-xs">{String(row[f.name] ?? "")}</span>
                  ) : (
                    <Value value={row[f.name]} isStatus={f.name === status} />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CardGrid({ shape, bindings }: { shape: Shape; bindings: Bindings }) {
  const description = [...shape.fields]
    .filter((f) => f.type === "string" && f.name !== bindings.primary && f.name !== bindings.status)
    .sort((a, b) => Math.max(...b.examples.map((e) => e.length)) - Math.max(...a.examples.map((e) => e.length)))[0]?.name
  const rest = shape.fields.filter((f) => ![bindings.primary, bindings.status, description].includes(f.name)).slice(0, 4)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {shape.records.slice(0, 24).map((r, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{String(r[bindings.primary ?? ""] ?? `Item ${i + 1}`)}</CardTitle>
              {bindings.status && <Value value={r[bindings.status]} isStatus />}
            </div>
            {description && <CardDescription>{String(r[description] ?? "")}</CardDescription>}
          </CardHeader>
          {rest.length > 0 && (
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {rest.map((f) => (
                  <div key={f.name} className="contents">
                    <dt className="text-muted-foreground">{humanize(f.name)}</dt>
                    <dd className="text-right">
                      <Value value={r[f.name]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}

function DetailView({ record, status, nested }: { record: Row; status?: string; nested?: boolean }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-6 text-sm", nested ? "gap-y-1.5" : "gap-y-3")}>
      {Object.entries(record).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="pt-0.5 text-muted-foreground">{humanize(key)}</dt>
          <dd className="min-w-0">
            {Array.isArray(value) && value.length > 0 && value.every(isPlainObject) ? (
              <DataTable
                rows={value}
                fields={Object.keys(value[0]).map((name) => ({ name, type: typeof value[0][name] === "number" ? "number" : "string", examples: [] }))}
              />
            ) : isPlainObject(value) ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <DetailView record={value} nested />
              </div>
            ) : (
              <Value value={value} isStatus={key === status} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TimelineView({ shape, bindings }: { shape: Shape; bindings: Bindings }) {
  const { time, primary, status } = bindings
  const message =
    primary && primary !== time
      ? primary
      : shape.fields.find((f) => f.type === "string" && f.name !== status)?.name
  const extras = shape.fields.filter((f) => ![time, message, status].includes(f.name)).slice(0, 3)
  const rows = time
    ? [...shape.records].sort((a, b) => String(a[time]).localeCompare(String(b[time])))
    : shape.records

  return (
    <ol className="relative ml-2 border-l">
      {rows.slice(0, 50).map((r, i) => (
        <li key={i} className="relative pb-5 pl-6 last:pb-0">
          <span
            className={cn(
              "absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-background bg-muted-foreground",
              status && badgeVariant(r[status]) === "destructive" && "bg-destructive",
              status && badgeVariant(r[status]) === "outline" && "bg-chart-3",
            )}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {time && <span className="tabular-nums">{formatDate(String(r[time]))}</span>}
            {status && <Value value={r[status]} isStatus />}
            {extras.map((f) => (
              <span key={f.name}>
                {humanize(f.name)}: <Value value={r[f.name]} />
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm">{message ? String(r[message] ?? "") : JSON.stringify(r)}</p>
        </li>
      ))}
    </ol>
  )
}

function RawJson({ value }: { value: unknown }) {
  return (
    <ScrollArea className="h-80 rounded-lg border bg-muted/30">
      <pre className="p-4 font-mono text-xs leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
    </ScrollArea>
  )
}

function Unsupported({ reason }: { reason: string }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{reason}</p>
}
