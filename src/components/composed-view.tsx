"use client"

import * as React from "react"
import { TriangleAlert } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { DataTable, Value, badgeVariant, formatDate, formatStat, humanize } from "@/components/rendered-display"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { kindOf, type ComponentId, type LayoutId, type NodeKind, type RegionId } from "@/lib/compose"
import { analyze, isPlainObject, type Row } from "@/lib/shape"
import { cn } from "@/lib/utils"

type Tone = "default" | "cta" | "compact"

type Ctx = {
  picks: Record<string, ComponentId>
  tone: Tone
  /** Top-level fields render larger headings */
  topLevel: boolean
}

const URL_RE = /^https?:\/\/\S+$/i
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)|picsum\.photos|images\.unsplash|\/image/i

const safeUrl = (v: unknown) => (typeof v === "string" && URL_RE.test(v) ? v : undefined)

/** Used when Jev wasn't asked about a path (node cap) or picked something the value can't be. */
function fallback(kind: NodeKind, value: unknown): ComponentId {
  if (kind === "text") return safeUrl(value) ? (IMAGE_RE.test(String(value)) ? "image" : "link") : "paragraph"
  return ({ number: "meta", boolean: "badge", text_list: "badge_list", number_list: "line_chart", object: "section", object_list: "table" } as const)[kind]
}

const join = (base: string, key: string) => (base ? `${base}.${key}` : key)

export function ComposedView({
  data,
  layout,
  picks,
  regions,
}: {
  data: unknown
  layout: LayoutId
  picks: Record<string, ComponentId>
  regions: Record<string, RegionId>
}) {
  const ctx: Ctx = { picks, tone: "default", topLevel: true }

  if (!isPlainObject(data)) {
    return <div className="flex flex-col gap-6">{renderNode(data, "", "", ctx)}</div>
  }

  const byRegion: Record<RegionId, React.ReactNode[]> = { header: [], main: [], sidebar: [], footer: [] }
  for (const [key, value] of Object.entries(data)) {
    const node = renderNode(value, key, key, ctx, data)
    if (!node) continue
    const wide = kindOf(value) === "object_list" || kindOf(value) === "number_list"
    byRegion[regions[key] ?? "main"].push(
      <div key={key} className={cn(layout === "dashboard" && wide && "md:col-span-2")}>
        {node}
      </div>,
    )
  }

  const header = byRegion.header.length > 0 && <header className="flex flex-col gap-4">{byRegion.header}</header>
  const footer = byRegion.footer.length > 0 && <footer className="flex flex-col gap-4 border-t pt-6">{byRegion.footer}</footer>
  const sidebar = byRegion.sidebar.length > 0 && (
    <aside className="flex flex-col gap-4 rounded-xl bg-muted/50 p-4">{byRegion.sidebar}</aside>
  )

  if (layout === "article") {
    return (
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        {header}
        <div className="flex flex-col gap-6">{byRegion.main}</div>
        {sidebar}
        {footer}
      </article>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {header}
      <div className={cn("grid gap-6", sidebar && "lg:grid-cols-[minmax(0,1fr)_280px]")}>
        <div className={cn("grid content-start gap-6", layout === "dashboard" && "md:grid-cols-2")}>{byRegion.main}</div>
        {sidebar}
      </div>
      {footer}
    </div>
  )
}

function renderNode(value: unknown, path: string, key: string, ctx: Ctx, siblings?: Row): React.ReactNode {
  const kind = kindOf(value)
  if (!kind) return null
  const picked = ctx.picks[path]
  const component = picked ?? fallback(kind, value)
  if (component === "hidden") return null

  switch (kind) {
    case "text":
      return <TextNode value={value as string} fieldKey={key} component={component} ctx={ctx} siblings={siblings} />
    case "number":
      return <NumberNode value={value as number} fieldKey={key} component={component} ctx={ctx} />
    case "boolean":
      if (component === "alert") return value ? <AlertNode title={humanize(key)} /> : null
      return component === "meta" ? (
        <Meta label={humanize(key)} ctx={ctx}>{value ? "Yes" : "No"}</Meta>
      ) : (
        <Badge variant={value ? "default" : "destructive"} className="w-fit">
          {value ? humanize(key) : `Not ${humanize(key).toLowerCase()}`}
        </Badge>
      )
    case "text_list":
      return <TextListNode values={value as unknown[]} fieldKey={key} component={component} ctx={ctx} />
    case "number_list": {
      const values = value as number[]
      if (component === "meta") return <Meta label={humanize(key)} ctx={ctx}>{values.map(formatStat).join(", ")}</Meta>
      return (
        <SeriesChart
          title={humanize(key)}
          kind={component === "bar_chart" ? "bar" : "line"}
          points={values.map((y, i) => ({ x: seriesLabel(siblings, values.length, i), y }))}
        />
      )
    }
    case "object":
      return <ObjectNode value={value as Row} path={path} fieldKey={key} component={component} ctx={ctx} />
    case "object_list":
      return <ObjectListNode items={value as Row[]} path={path} component={component} ctx={ctx} />
  }
}

function Children({ value, path, ctx, exclude }: { value: Row; path: string; ctx: Ctx; exclude?: string[] }) {
  return Object.entries(value)
    .filter(([k]) => !exclude?.includes(k))
    .map(([k, v]) => <React.Fragment key={k}>{renderNode(v, join(path, k), k, ctx, value)}</React.Fragment>)
}

// ---------- leaves ----------

function Meta({ label, ctx, children }: { label: string; ctx: Ctx; children: React.ReactNode }) {
  return (
    <p className={cn("text-sm", ctx.tone === "cta" ? "text-primary-foreground/70" : "text-muted-foreground")}>
      <span>{label}: </span>
      {children}
    </p>
  )
}

function TextNode({
  value,
  fieldKey,
  component,
  ctx,
  siblings,
}: {
  value: string
  fieldKey: string
  component: ComponentId
  ctx: Ctx
  siblings?: Row
}) {
  const url = safeUrl(value)
  const muted = ctx.tone === "cta" ? "text-primary-foreground/80" : "text-muted-foreground"

  switch (component) {
    case "heading":
      if (ctx.tone === "compact") return <p className="font-medium">{value}</p>
      return ctx.topLevel ? (
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{value}</h1>
      ) : (
        <h3 className="text-lg font-semibold tracking-tight">{value}</h3>
      )
    case "subheading":
      return <p className={cn(ctx.topLevel ? "text-xl" : "text-base", ctx.tone === "compact" && "text-sm", muted)}>{value}</p>
    case "meta":
      return <Meta label={humanize(fieldKey)} ctx={ctx}>{value}</Meta>
    case "alert":
      return <AlertNode title={value} />
    case "badge":
      return <Badge variant={ctx.tone === "cta" ? "secondary" : badgeVariant(value)} className="w-fit">{value}</Badge>
    case "date":
      return <p className={cn("text-sm tabular-nums", muted)}>{formatDate(value)}</p>
    case "code":
      return <code className="w-fit rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{value}</code>
    case "image":
      if (!url) break
      return (
        <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote URLs from pasted JSON */}
          <img src={url} alt={altFrom(siblings) ?? humanize(fieldKey)} className="size-full object-cover" />
        </AspectRatio>
      )
    case "avatar":
      if (!url) break
      return (
        <Avatar size="lg">
          <AvatarImage src={url} alt="" />
          <AvatarFallback>{initials(siblings)}</AvatarFallback>
        </Avatar>
      )
    case "link":
      if (!url) break
      return (
        <a href={url} target="_blank" rel="noreferrer" className="w-fit text-sm break-all text-primary underline underline-offset-4">
          {url.replace(/^https?:\/\//, "")}
        </a>
      )
    case "button": {
      const href = buttonHref(siblings)
      return (
        <Button asChild variant={ctx.tone === "cta" ? "secondary" : "default"} className="w-fit">
          <a href={href} target="_blank" rel="noreferrer">{value}</a>
        </Button>
      )
    }
  }
  // paragraph, or a pick the value can't support (e.g. "image" for plain text)
  return <p className={cn("leading-7 text-pretty", ctx.tone === "compact" && "text-sm leading-6", ctx.tone === "cta" && "text-primary-foreground/80")}>{value}</p>
}

function NumberNode({ value, fieldKey, component, ctx }: { value: number; fieldKey: string; component: ComponentId; ctx: Ctx }) {
  if (component === "stat") {
    return (
      <Card size="sm" className="min-w-40">
        <CardHeader>
          <CardDescription>{humanize(fieldKey)}</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums">{formatStat(value)}</CardTitle>
        </CardHeader>
      </Card>
    )
  }
  if (component === "progress") {
    const pctValue = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value))
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{humanize(fieldKey)}</span>
          <span className="tabular-nums">{Math.round(pctValue)}%</span>
        </div>
        <Progress value={pctValue} />
      </div>
    )
  }
  return <Meta label={humanize(fieldKey)} ctx={ctx}><span className="tabular-nums">{formatStat(value)}</span></Meta>
}

function TextListNode({ values, fieldKey, component, ctx }: { values: unknown[]; fieldKey: string; component: ComponentId; ctx: Ctx }) {
  if (component === "bullet_list") {
    return (
      <ul className={cn("ml-5 list-disc space-y-1", ctx.tone === "compact" && "text-sm")}>
        {values.map((v, i) => <li key={i}>{String(v)}</li>)}
      </ul>
    )
  }
  if (component === "gallery") {
    const urls = values.map(safeUrl).filter(Boolean) as string[]
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url) => (
          <AspectRatio key={url} ratio={4 / 3} className="overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote URLs from pasted JSON */}
            <img src={url} alt="" className="size-full object-cover" />
          </AspectRatio>
        ))}
      </div>
    )
  }
  if (component === "meta") {
    return <Meta label={humanize(fieldKey)} ctx={ctx}>{values.map(String).join(", ")}</Meta>
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v, i) => <Badge key={i} variant="secondary">{String(v)}</Badge>)}
    </div>
  )
}

// ---------- containers ----------

function ObjectNode({ value, path, fieldKey, component, ctx }: { value: Row; path: string; fieldKey: string; component: ComponentId; ctx: Ctx }) {
  const inner: Ctx = { ...ctx, topLevel: false }

  switch (component) {
    case "image": {
      const url = Object.values(value).map(safeUrl).find(Boolean)
      if (!url) break
      const { width, height } = value
      const ratio = typeof width === "number" && typeof height === "number" && height > 0 ? width / height : 16 / 9
      return (
        <AspectRatio ratio={ratio} className="overflow-hidden rounded-xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote URLs from pasted JSON */}
          <img src={url} alt={altFrom(value) ?? humanize(fieldKey)} className="size-full object-cover" />
        </AspectRatio>
      )
    }
    case "card":
      return (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Children value={value} path={path} ctx={inner} />
          </CardContent>
        </Card>
      )
    case "cta":
      return (
        <Card className="bg-primary text-primary-foreground ring-0">
          <CardContent className="flex flex-col items-start gap-3 py-2">
            <Children value={value} path={path} ctx={{ ...inner, tone: "cta" }} />
          </CardContent>
        </Card>
      )
    case "profile": {
      const isPicture = ([k, v]: [string, unknown]) =>
        typeof v === "string" && ["avatar", "image"].includes(ctx.picks[join(path, k)] ?? "")
      const picture = Object.entries(value).find(isPicture)
      return (
        <div className="flex items-center gap-3">
          {picture && renderNode(picture[1], join(path, picture[0]), picture[0], { ...inner, picks: { ...ctx.picks, [join(path, picture[0])]: "avatar" } }, value)}
          <div className="flex min-w-0 flex-col gap-0.5">
            <Children value={value} path={path} ctx={{ ...inner, tone: "compact" }} exclude={picture ? [picture[0]] : []} />
          </div>
        </div>
      )
    }
    case "key_value":
      return (
        <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-6 gap-y-2 text-sm">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{humanize(k)}</dt>
              <dd className="min-w-0 break-words"><Value value={v} /></dd>
            </div>
          ))}
        </dl>
      )
  }

  // section
  const hasHeading = Object.keys(value).some((k) => ["heading", "subheading"].includes(ctx.picks[join(path, k)] ?? ""))
  return (
    <section className="flex flex-col gap-3">
      {!hasHeading && <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{humanize(fieldKey)}</p>}
      <Children value={value} path={path} ctx={inner} />
    </section>
  )
}

function ObjectListNode({ items, path, component, ctx }: { items: Row[]; path: string; component: ComponentId; ctx: Ctx }) {
  const itemPath = `${path}[]`
  const compact: Ctx = { ...ctx, topLevel: false, tone: "compact" }

  switch (component) {
    case "rich_text":
      return <div className="flex flex-col gap-4">{items.map((block, i) => <RichBlock key={i} block={block} />)}</div>
    case "line_chart":
    case "bar_chart": {
      const keys = Object.keys(items[0] ?? {})
      const role = (k: string) => ctx.picks[join(itemPath, k)]
      const yKey = keys.find((k) => typeof items[0][k] === "number" && role(k) !== "hidden")
      const xKey =
        keys.find((k) => ["heading", "subheading", "date", "code", "badge"].includes(role(k) ?? "") && typeof items[0][k] === "string") ??
        keys.find((k) => typeof items[0][k] === "string")
      if (!yKey) break
      const points = items.map((item, i) => ({
        x: xKey ? formatAxisLabel(String(item[xKey])) : String(i + 1),
        y: Number(item[yKey]) || 0,
      }))
      return <SeriesChart title={humanize(yKey)} kind={component === "bar_chart" ? "bar" : "line"} points={points} />
    }
    case "card_grid":
      return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, i) => (
            <Card key={i} size="sm">
              <CardContent className="flex flex-col gap-2">
                <Children value={item} path={itemPath} ctx={compact} />
              </CardContent>
            </Card>
          ))}
        </div>
      )
    case "list":
      return (
        <div className="divide-y rounded-xl border">
          {items.map((item, i) => (
            <div key={i} className="flex flex-col gap-1 px-4 py-3">
              <Children value={item} path={itemPath} ctx={compact} />
            </div>
          ))}
        </div>
      )
    case "accordion": {
      const keys = Object.keys(items[0] ?? {})
      const titleKey =
        keys.find((k) => ["heading", "subheading"].includes(ctx.picks[join(itemPath, k)] ?? "")) ??
        keys.find((k) => /question|title|name|label/i.test(k)) ??
        keys.find((k) => typeof items[0][k] === "string")
      return (
        <Accordion type="single" collapsible className="rounded-xl border px-4">
          {items.map((item, i) => (
            <AccordionItem key={i} value={String(i)}>
              <AccordionTrigger>{String(item[titleKey ?? ""] ?? `Item ${i + 1}`)}</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                <Children value={item} path={itemPath} ctx={compact} exclude={titleKey ? [titleKey] : []} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )
    }
  }

  // table
  const { fields } = analyze(items)
  const status = fields.find((f) => ctx.picks[join(itemPath, f.name)] === "badge")?.name
  return <DataTable rows={items} fields={fields.filter((f) => ctx.picks[join(itemPath, f.name)] !== "hidden")} status={status} />
}

/** Article body blocks are rendered by their own `type` field, e.g. { type: "heading", text }. */
function RichBlock({ block }: { block: Row }) {
  const type = String(block.type ?? block.kind ?? block.block_type ?? "paragraph").toLowerCase()
  const text = block.text ?? block.content ?? block.value ?? block.body
  const url = safeUrl(block.url ?? block.src)

  if (/head|^h[1-6]$|title/.test(type)) return <h2 className="mt-2 text-xl font-semibold tracking-tight">{String(text)}</h2>
  if (/quote/.test(type)) return <blockquote className="border-l-2 pl-4 italic text-muted-foreground">{String(text)}</blockquote>
  if (/code/.test(type)) return <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">{String(text)}</pre>
  if (/image|img|figure/.test(type) && url) {
    return (
      <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary remote URLs from pasted JSON */}
        <img src={url} alt={altFrom(block) ?? ""} className="size-full object-cover" />
      </AspectRatio>
    )
  }
  if (Array.isArray(block.items)) {
    return <ul className="ml-5 list-disc space-y-1">{block.items.map((item, i) => <li key={i}>{String(item)}</li>)}</ul>
  }
  return <p className="leading-7 text-pretty">{typeof text === "string" ? text : JSON.stringify(block)}</p>
}

function AlertNode({ title }: { title: string }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle className="line-clamp-none">{title}</AlertTitle>
    </Alert>
  )
}

function SeriesChart({ title, kind, points }: { title: string; kind: "line" | "bar"; points: { x: string; y: number }[] }) {
  const config = { y: { label: title, color: "var(--chart-1)" } } satisfies ChartConfig
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        {kind === "line" ? (
          <LineChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => formatStat(v)} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="y" type="monotone" stroke="var(--color-y)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        ) : (
          <BarChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => formatStat(v)} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="y" fill="var(--color-y)" radius={4} isAnimationActive={false} />
          </BarChart>
        )}
      </ChartContainer>
    </div>
  )
}

/** Short axis labels: times become "14:00", dates become "Sep 16", long text is clipped. */
function formatAxisLabel(v: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? v : v.slice(11, 16)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v)
  return v.length > 14 ? `${v.slice(0, 13)}…` : v
}

/** A number series' x labels come from a sibling list of the same length, such as hourly `time`. */
function seriesLabel(siblings: Row | undefined, length: number, i: number) {
  const labels = siblings && Object.values(siblings).find((v) => Array.isArray(v) && v.length === length && v.every((x) => typeof x === "string"))
  return labels ? formatAxisLabel(String((labels as string[])[i])) : String(i + 1)
}

// ---------- sibling lookups ----------

function altFrom(obj?: Row) {
  const alt = obj && Object.entries(obj).find(([k, v]) => /alt|caption/i.test(k) && typeof v === "string")
  return alt ? String(alt[1]) : undefined
}

function initials(obj?: Row) {
  const name = obj && Object.entries(obj).find(([k, v]) => /name|title/i.test(k) && typeof v === "string")?.[1]
  return typeof name === "string" ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() : "?"
}

function buttonHref(obj?: Row) {
  if (!obj) return "#"
  const urls = Object.entries(obj).filter(([, v]) => safeUrl(v))
  return String((urls.find(([k]) => /url|href|link/i.test(k)) ?? urls[0])?.[1] ?? "#")
}
