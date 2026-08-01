# mobile-responsive.css retirement plan (decision D3, approved 2026-08-01)

The goal: every rule in `src/styles/mobile-responsive.css` either becomes
component-owned (responsive classes / data-attributes in the markup) or earns
its place as a deliberate global. The file audit lives in
`AUDIT-REPORT-2026-08-01.md` (finding #18): after the dead-rule deletion
(PR #204), 28 overbroad rule groups remain live.

## Protocol per tranche

1. Branch `fix/mobile-css-tranche-N` off master.
2. Change ONE rule family at a time. Prefer, in order: (a) prove the rule
   redundant and delete it; (b) scope it to a data-attribute or aria hook the
   real target carries (`[data-earnings-grid]` in section Q is the model);
   (c) move the behaviour into the component's own responsive classes and
   delete the rule.
3. Verify at 375×812 in the browser on every page the rule actually matched
   (the audit lists them per section) — before/after screenshots in the PR.
4. Owner merges. One tranche at a time; a regression must be attributable to
   exactly one change.

## Tranches

| # | Scope | Status |
|---|---|---|
| 1 | Breadcrumb hiding: drop `main > div > nav:first-of-type` + `[class*="breadcrumb" i]` catch-alls — every real breadcrumb carries `aria-label="Breadcrumb"` | ✅ this PR |
| 2 | Section I rule 2 (`main .flex.items-center.gap-2/3 > button { min-height:44px }`, ~130 files): likely redundant with the global `pointer: coarse` 44px floor at the top of the file — prove on-device, then delete. The top single silent-breaker | next |
| 3 | Section #10 (`.border-b > .flex` tab rows, 48 files, unscoped): tag the real tab strips (`data-tab-strip`) and scope the rule; card/modal headers stop being turned into invisible scrollers | |
| 4 | Sections 17 + 18 (empty-state shrink + `text-3xl/2xl/xl` −10%, 130+ files): move sizes into the components' own `max-sm:` classes, page by page, starting with the public marketing pages where the shrink hurts most | |
| 5 | Stacking rules K, M, O, W2 (modal grids, banners): data-attribute scoping; resolve the M/O same-selector conflict as part of it | |
| 6 | Density 7/8/13 + section V `word-break`: per-page `max-sm:` spacing; kill the global `!important` rhythm override | |
| 7 | Globals review: `#root { overflow-x:hidden }` (masks every overflow bug — decide keep-vs-instrument), stale v1 colours in the focus ring / skip-link / scrollbar (`#9A7F79`, `#3F3633`, `#DDD0CC` → `ct-` tokens), print `nav, button { display:none }` over-reach on invoice pages | |

Sections already correctly scoped and staying: bottom tab bar (#1), modal
sheets, `[data-tour="calendar"]`, Q, X2, Z, AD, the `[role="switch"]`
carve-out, reduced-motion/forced-colors, iOS input-zoom floor.

## Invariants

- Never re-baseline a checker to make a tranche pass.
- The bottom-nav FAB rule (AD) uses positional `:nth-child(3)` — if the
  bottom nav is ever reordered, fix that rule in the same PR.
- Any tranche touching the 44px floors must be verified with touch emulation
  (Playwright iPhone 13), not a narrowed desktop window — the rules are
  `pointer: coarse`-gated and desktop resizing proves nothing.
