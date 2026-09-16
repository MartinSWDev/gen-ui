// Preset inputs, each aimed at a different display so the picks are easy to eyeball.

export type Sample = { id: string; label: string; intent: string; data: unknown }

export const SAMPLES: Sample[] = [
  {
    id: "revenue",
    label: "Monthly revenue",
    intent: "",
    data: [
      { month: "2026-01", revenue: 42100, orders: 311 },
      { month: "2026-02", revenue: 45830, orders: 334 },
      { month: "2026-03", revenue: 51290, orders: 362 },
      { month: "2026-04", revenue: 49870, orders: 350 },
      { month: "2026-05", revenue: 58340, orders: 401 },
      { month: "2026-06", revenue: 63120, orders: 428 },
      { month: "2026-07", revenue: 61450, orders: 419 },
      { month: "2026-08", revenue: 70980, orders: 466 },
    ],
  },
  {
    id: "users",
    label: "User list",
    intent: "",
    data: {
      data: [
        { id: 1041, name: "Ava Chen", email: "ava@northwind.io", role: "Admin", status: "active", last_seen: "2026-09-15T18:22:00Z" },
        { id: 1042, name: "Leo Okafor", email: "leo@northwind.io", role: "Editor", status: "active", last_seen: "2026-09-16T08:03:00Z" },
        { id: 1043, name: "Mia Santos", email: "mia@northwind.io", role: "Viewer", status: "invited", last_seen: null },
        { id: 1044, name: "Noah Berg", email: "noah@northwind.io", role: "Editor", status: "suspended", last_seen: "2026-08-02T11:40:00Z" },
        { id: 1045, name: "Isla Patel", email: "isla@northwind.io", role: "Viewer", status: "active", last_seen: "2026-09-14T21:17:00Z" },
        { id: 1046, name: "Kai Müller", email: "kai@northwind.io", role: "Admin", status: "active", last_seen: "2026-09-16T07:55:00Z" },
      ],
      total: 6,
      page: 1,
    },
  },
  {
    id: "kpis",
    label: "KPI snapshot",
    intent: "",
    data: { mrr: 128400, active_users: 9321, churn_rate: 0.021, nps: 47 },
  },
  {
    id: "traffic",
    label: "Traffic sources",
    intent: "What share of visits does each source bring?",
    data: [
      { source: "Organic search", visits: 18240 },
      { source: "Direct", visits: 9120 },
      { source: "Referral", visits: 4380 },
      { source: "Social", visits: 3150 },
      { source: "Email", visits: 1910 },
    ],
  },
  {
    id: "order",
    label: "Single order",
    intent: "",
    data: {
      id: "ord_8F2K19",
      status: "shipped",
      created_at: "2026-09-12T14:05:00Z",
      total: 214.5,
      currency: "USD",
      shipping_method: "Express",
      customer: { name: "Ava Chen", email: "ava@northwind.io", city: "Portland" },
      items: [
        { sku: "DSK-120", name: "Standing desk frame", qty: 1, price: 179.0 },
        { sku: "CBL-004", name: "Cable tray", qty: 1, price: 24.5 },
        { sku: "GRM-010", name: "Desk grommet", qty: 2, price: 5.5 },
      ],
    },
  },
  {
    id: "deploys",
    label: "Deploy log",
    intent: "",
    data: [
      { timestamp: "2026-09-16T09:02:11Z", level: "info", service: "api", message: "Deploy v2.14.0 started" },
      { timestamp: "2026-09-16T09:03:40Z", level: "info", service: "api", message: "Migrations applied (3)" },
      { timestamp: "2026-09-16T09:04:02Z", level: "warn", service: "worker", message: "Queue depth above 5k during rollout" },
      { timestamp: "2026-09-16T09:05:19Z", level: "error", service: "api", message: "Health check failed on pod api-7c9f" },
      { timestamp: "2026-09-16T09:06:47Z", level: "info", service: "api", message: "Pod replaced, health checks passing" },
      { timestamp: "2026-09-16T09:07:03Z", level: "info", service: "api", message: "Deploy v2.14.0 complete" },
    ],
  },
  {
    id: "products",
    label: "Product catalog",
    intent: "",
    data: [
      { name: "Aero Mesh Chair", category: "Seating", price: 389, in_stock: true, description: "Breathable mesh back with adjustable lumbar support and 4D armrests." },
      { name: "Oak Standing Desk", category: "Desks", price: 749, in_stock: true, description: "Solid oak top on a dual-motor frame with four height presets." },
      { name: "Halo Desk Lamp", category: "Lighting", price: 129, in_stock: false, description: "Asymmetric LED bar that lights the desk without glare on screens." },
      { name: "Felt Desk Mat", category: "Accessories", price: 49, in_stock: true, description: "Merino wool felt mat that dampens keyboard noise." },
      { name: "Monitor Arm Pro", category: "Accessories", price: 219, in_stock: true, description: "Gas-spring arm for screens up to 34 inches and 12 kg." },
      { name: "Cable Spine", category: "Accessories", price: 39, in_stock: false, description: "Vertebrae-style cable manager that follows the desk as it rises." },
    ],
  },
  {
    id: "config",
    label: "Config file",
    intent: "",
    data: {
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        strict: true,
        paths: { "@/*": ["./src/*"] },
        plugins: [{ name: "next" }],
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
      exclude: ["node_modules"],
    },
  },
]
