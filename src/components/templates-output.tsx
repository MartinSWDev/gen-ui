"use client"

import * as React from "react"

import { ICONS } from "@/components/display-icons"
import { RenderedDisplay, resolveBindings } from "@/components/rendered-display"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DISPLAYS, DISPLAY_IDS, NONE, type ChoiceAnswer, type DecideResponse, type DisplayId } from "@/lib/displays"
import type { Shape } from "@/lib/shape"
import { cn } from "@/lib/utils"

export type TemplateResult = DecideResponse & { clientMs: number; shape: Shape; inputLabel: string }

const pct = (v: number) => `${Math.round(v * 100)}%`

export function TemplatesOutput({
  result,
  override,
  onOverride,
}: {
  result: TemplateResult
  override: DisplayId | null
  onOverride: (id: DisplayId | null) => void
}) {
  const jevPick = result.decision.display.choice as DisplayId
  const shown = override ?? jevPick
  const bindings = resolveBindings(result.decision, result.shape.fields)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
          <CardDescription>{result.inputLabel} · click any option to render it instead</CardDescription>
          <CardAction>
            <Badge variant="secondary" className="tabular-nums">
              confidence {result.decision.display.confidence.toFixed(2)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
          <ProbabilityList
            answer={result.decision.display}
            shown={shown}
            onSelect={(id) => onOverride(id === jevPick ? null : id)}
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
            {React.createElement(ICONS[shown], { className: "size-4 text-muted-foreground" })}
            {DISPLAYS[shown].label}
          </CardTitle>
          <CardDescription className="font-mono text-xs">{DISPLAYS[shown].component}</CardDescription>
          <CardAction>
            {override ? (
              <Button size="xs" variant="outline" onClick={() => onOverride(null)}>
                Back to Jev’s pick
              </Button>
            ) : (
              <Badge variant="outline">Jev’s pick</Badge>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <RenderedDisplay display={shown} shape={result.shape} bindings={bindings} />
        </CardContent>
      </Card>
    </>
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
