"use client"

import { ComposedView } from "@/components/composed-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  COMPONENTS,
  LAYOUTS,
  componentsFor,
  viewDecisions,
  type ComponentId,
  type ComposeResponse,
  type LayoutId,
} from "@/lib/compose"
import { THEMES } from "@/lib/themes"
import { cn } from "@/lib/utils"

export type ComposeResult = ComposeResponse & { clientMs: number; data: unknown; inputLabel: string }

export type ComposeOverrides = { layout?: LayoutId; picks: Record<string, ComponentId> }

const pct = (v: number) => `${Math.round(v * 100)}%`

export function averageConfidence(result: ComposeResponse) {
  if (result.nodes.length === 0) return result.layout.confidence
  return result.nodes.reduce((sum, n) => sum + n.component.confidence, 0) / result.nodes.length
}

export function ComposeOutput({
  result,
  overrides,
  onOverrides,
}: {
  result: ComposeResult
  overrides: ComposeOverrides
  onOverrides: (next: ComposeOverrides) => void
}) {
  const decisions = viewDecisions(result)
  const layout = overrides.layout ?? decisions.layout
  const picks = { ...decisions.picks, ...overrides.picks }
  const visible = result.nodes.filter((n) => picks[n.path] !== "hidden").length
  const edited = overrides.layout !== undefined || Object.keys(overrides.picks).length > 0

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Composed page</CardTitle>
          <CardDescription>
            {visible} components from {result.nodes.length} fields · {LAYOUTS[layout].label} layout
            {decisions.theme && ` · ${THEMES[decisions.theme].label} theme`}
          </CardDescription>
          <CardAction>
            {edited ? (
              <Button size="xs" variant="outline" onClick={() => onOverrides({ picks: {} })}>
                Back to Jev’s picks
              </Button>
            ) : (
              <Badge variant="outline">Jev’s picks</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <ComposedView data={result.data} {...decisions} layout={layout} picks={picks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
          <CardDescription>
            {result.inputLabel} · {result.questionCount} questions answered in one call · change any pick to re-render
          </CardDescription>
          <CardAction>
            <Badge variant="secondary" className="tabular-nums">
              avg confidence {averageConfidence(result).toFixed(2)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Layout</span>
            <Select value={layout} onValueChange={(v) => onOverrides({ ...overrides, layout: v as LayoutId })}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LAYOUTS) as LayoutId[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {LAYOUTS[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs tabular-nums text-muted-foreground">
              Jev: {LAYOUTS[result.layout.choice as LayoutId]?.label} {pct(result.layout.probabilities[result.layout.choice] ?? 0)}
            </span>
          </div>

          <ScrollArea className="h-96 rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Prob.</TableHead>
                  <TableHead>Region</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.nodes.map((node) => {
                  const pick = picks[node.path]
                  return (
                    <TableRow key={node.path} className={cn(pick === "hidden" && "text-muted-foreground")}>
                      <TableCell className="max-w-64">
                        <code
                          className="block truncate font-mono text-xs"
                          style={{ paddingLeft: `${Math.max(0, node.depth - 1) * 12}px` }}
                          title={node.example}
                        >
                          {node.path || "(root)"}
                        </code>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{node.kind.replace("_", " ")}</TableCell>
                      <TableCell>
                        <Select
                          value={pick}
                          onValueChange={(v) => {
                            const next = { ...overrides.picks }
                            if (v === node.component.choice) delete next[node.path]
                            else next[node.path] = v as ComponentId
                            onOverrides({ ...overrides, picks: next })
                          }}
                        >
                          <SelectTrigger size="sm" className={cn("w-36", overrides.picks[node.path] && "border-primary")}>
                            {/* Explicit label so the trigger doesn't repeat the item's probability */}
                            <SelectValue>{COMPONENTS[pick].label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {componentsFor(node.kind).map((id) => (
                              <SelectItem key={id} value={id}>
                                {COMPONENTS[id].label}
                                <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">
                                  {pct(node.component.probabilities[id] ?? 0)}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {pct(node.component.probabilities[node.component.choice] ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {node.region ? `${node.region.choice} ${pct(node.region.probabilities[node.region.choice] ?? 0)}` : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  )
}
