# HOTELIER web app — notes for Claude

## Shared UI primitives — use them, don't re-roll

Full detail: [`src/components/ui/README.md`](src/components/ui/README.md).

- **Stat / summary tiles → `@/components/ui/StatCard`.** Every "Total / Active /
  Low stock"-style card and every Dashboard KPI uses it. Pass `index` (the map
  index) for varied colour, or `tone="warn|danger|success|info"` for semantic
  colour. Never hand-build a `border bg-card p-5 shadow-sm` tile.
- **Action buttons → `@/components/ui/Button`.** The "New X" / "Add X" create
  button in any page/section header is `<Button>` (solid **black**,
  `variant="primary"` by default). The button beside it is
  `variant="secondary"`. Only pass layout classes (`shrink-0`, `w-full`) via
  `className`.
- **Long `<select>` lists → `@/components/ui/SearchableSelect`.**

When you add a new page with summary numbers or a create action, wire these in
from the start rather than copying another page's raw markup.

## App version

Bump with `npm run bump` for every shipped change. Each part runs 0-9, never 10:
1.2.9 -> 1.3.0, 1.9.9 -> 2.0.0. See RELEASING.md.
