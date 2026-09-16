import {
  Braces,
  ChartColumn,
  ChartLine,
  ChartPie,
  Gauge,
  History,
  LayoutGrid,
  Rows3,
  Table,
  type LucideIcon,
} from "lucide-react"

import type { DisplayId } from "@/lib/displays"

export const ICONS: Record<DisplayId, LucideIcon> = {
  line_chart: ChartLine,
  bar_chart: ChartColumn,
  pie_chart: ChartPie,
  stat_cards: Gauge,
  data_table: Table,
  card_grid: LayoutGrid,
  detail_view: Rows3,
  timeline: History,
  raw_json: Braces,
}
