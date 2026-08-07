# Deliverable: a rewrite prompt for Interview Question Viewer

## Context

The current app (`index.html` + `js/*` + `css/style.css`, ~10,200 lines total) was built
iteratively by mechanically splitting a single-file prototype (`InterviewQuestionViewer_v24.html`)
into ES modules, then growing feature-by-feature on top of that split (see `README-AI.md`'s 22
numbered "gotchas"). The feature set is now considered locked — it's fully catalogued in
`feature.md` (40 features across CSV/file management, browsing/filtering, status tracking, editing,
bulk CSV ops, drag-and-drop, copy/export, undo/redo, and JSONBin cross-device sync).

The user wants a **prompt** (not a live rewrite in this session) that they can hand to a fresh agent
session to rewrite the tool from scratch, now that the shape of the problem is fully known. The goal
of the rewrite is to fix the accumulated architectural debt that iterative feature-adding produced,
while reproducing 100% of `feature.md`'s behavior — no more, no less.

The single biggest structural problem, found while researching `feature.md`: **`js/components/tree.js`
is 3,142 lines** — a god-module owning rendering, all question/group CRUD, drag-and-drop, bulk CSV
import/export, the move-form, five copy/export builders, and bulk-selection UI all at once. Most of
`README-AI.md`'s 22 gotchas exist because of two compounding root causes:
1. `render()` always does `root.textContent = ""` and rebuilds the entire tree from scratch (gotcha
   #14), which then requires hand-rolled "capture open accordions before mutating, replay them after"
   bookkeeping (`captureOpenState`/`restoreOpenState`), a `pendingFocusQid` scroll-target side
   channel, and constant re-derivation of "what's currently open" by querying the DOM.
2. Bootstrap 5's collapse/accordion is driven by its own capture-phase `data-bs-toggle` listeners on
   `document`, which cannot be scoped or intercepted from inside the app (gotcha #2) — this alone
   forced a workaround pattern (`bootstrap.Collapse.getOrCreateInstance(...).toggle()` from a plain
   listener) that has to be remembered on every new interactive element inside a header.

Answers already confirmed with the user for scoping the rewrite prompt:
- **Stack**: vanilla JS, ES modules loaded directly by the browser (no bundler/build pipeline) — but
  typed via JSDoc + a `tsconfig.json` with `checkJs: true`, so `tsc --noEmit` gives real type
  checking without adding a compile step to how the app is run.
- **Data migration**: not required — a fresh `localStorage` schema is fine, no need to read the old
  `iqv_*` keys.
- **JSONBin sync**: keep it, same user-facing behavior (mandatory first-run setup, auto-push,
  auto-pull-on-load, manual Pull, usage badge, gzip compression) — just implemented more cleanly.
- **Execution shape**: one continuous prompt for a single fresh agent session, not a phased/checkpointed
  plan — but the prompt itself should still tell that agent to sequence its own work sensibly
  (data layer → render engine → features → polish) since this is a large rewrite.

## The rewrite prompt

This is the full text to hand to a fresh session. It embeds `feature.md` by reference (the new
session must read it, not have it re-summarized) and encodes every architectural fix identified
above.

```
Rewrite the Interview Question Viewer app from scratch. This is a from-scratch rewrite, not a
refactor — you may delete and replace every file except feature.md, README-AI.md, and the CSV
files under docs/, which are reference material.

## Scope of truth

- `feature.md` (repo root) is the complete, locked feature checklist for this app. Read it in full
  before writing any code. Implement every feature it describes; do not add features it doesn't
  mention, and do not drop any.
- `README-AI.md` documents 22 gotchas discovered the hard way in the old implementation. Read it too
  — not to preserve its workarounds, but because most of those gotchas describe REAL product
  behavior/edge cases (e.g. "an empty Subject/Topic/SubTopic must survive a CSV export/import
  round-trip", "Sort order: Starred always floats to top, LessImportant always sinks to bottom",
  "deleting a group is blocked while it still has questions under it") that the new implementation
  must still get right, even though the specific code pattern that produced each gotcha should not
  be repeated.
- The old implementation lives in `js/`, `css/`, `index.html` at the repo root — read it as a
  reference for exact behavior/wording (alert text, CSV column names, edge cases) when feature.md
  is ambiguous, but do not copy its architecture.
- No backward compatibility with old localStorage data is required — design a clean, versioned
  storage schema from scratch. Do not write any migration code for the old `iqv_*` keys.

## Stack constraints

- Vanilla JavaScript, loaded as native ES modules directly by the browser (`<script type="module">`)
  — no bundler, no framework, no build/compile step required to run the app. `index.html` opened
  directly (or via a static file server) must just work.
- Add type safety via JSDoc annotations (`@typedef`, `@param`, `@returns`, etc.) plus a
  `tsconfig.json` with `"checkJs": true, "allowJs": true, "noEmit": true` so `npx tsc` gives real
  type checking as a dev-time lint step — this must never affect how the app is served/run in a
  browser.
- Define proper typed shapes up front for the core domain objects (a Question row, a Subject/Topic/
  SubTopic group, the persisted storage schema, filter state, etc.) in a dedicated types module, and
  use them consistently — this codebase's biggest source of bugs was implicit shape agreement
  enforced only by convention.
- Third-party libraries: PapaParse (CSV) and SortableJS (drag-and-drop) are fine to keep via CDN
  script tags, same as before. Font Awesome for icons is fine to keep. For Bootstrap: you may keep
  its CSS for visual styling (buttons, cards, layout primitives) and its plain *programmatic*
  JS APIs (e.g. `bootstrap.Dropdown`, `bootstrap.Alert` instantiated directly in your own code) but
  do NOT use its data-api collapse/accordion behavior (`data-bs-toggle="collapse"` etc.) for the
  question tree — see "Render engine" below for why. jQuery + Select2 must be dropped entirely;
  replace the Subject/Topic/SubTopic/Status multi-select filters with a small custom multi-select
  component (or evaluate a modern dependency-free alternative) — it only needs to support: multiple
  selection, a placeholder, clearing, and a searchable/filterable option list.

## Architectural fixes required (this is the actual point of the rewrite)

The old `js/components/tree.js` was 3,142 lines and owned rendering, all CRUD, drag-and-drop, bulk
CSV import/export, the move-form, copy/export building, and bulk-selection UI in one file. Do not
reproduce a module of that shape. Split strictly by concern, e.g.:
- A data/domain layer: the Question/Group model, grouping+sorting logic (Subject→Topic→SubTopic→
  Question, with the Starred-floats-top/LessImportant-sinks-bottom tiering), filtering logic, CSV
  parse/serialize (both the main file format and the separate small Bulk-Add/Update/Copy CSV
  format), order/reorder math. Pure functions, unit-testable, zero DOM.
- A persistence layer: typed, versioned localStorage read/write (files, progress, filters, active
  question, timer, toggles) — one clear module owning the schema, not string constants scattered
  across three files.
- A sync layer: JSONBin.io push/pull, same user-facing behavior as before (mandatory Master
  Key + Bin ID on first run, debounced auto-push on every persisted change, silent pull-if-different
  on load, manual Pull button with confirm, gzip compression via CompressionStream, a usage badge
  against the 100KB free-tier cap) — but cleanly separated from "what triggers a push" (don't
  monkey-patch `localStorage.setItem` from a giant comment-documented side file; give the
  persistence layer an explicit hook/event the sync layer subscribes to).
- A render engine that is NOT "nuke `#rootAccordion` and rebuild from scratch on every state change."
  Design it so that:
  - Which Subject/Topic/SubTopic/Question nodes are expanded/collapsed is first-class app state (a
    `Set` of open node keys, or similar) — never something you have to scrape back out of the DOM
    after a rebuild. This alone eliminates the old `captureOpenState`/`restoreOpenState`/
    `pendingFocusQid` scroll-side-channel machinery.
  - Updating one question's status flag re-renders that question's row (and whatever tier-sort
    reordering it causes within its SubTopic), not the entire tree. Use keyed reconciliation
    (e.g. diff children by a stable key and patch, rather than `textContent = ""` + rebuild) so
    scroll position, focus, and open/closed state are preserved for free instead of needing manual
    capture/restore and `flashHighlightItem`-style re-locate-and-scroll workarounds.
  - The accordion/collapse behavior (Subject/Topic/SubTopic expand-collapse, and the question's own
    answer-body collapse) is implemented as your own small component fully driven by your app state,
    not Bootstrap's data-api. This removes the capture-phase-listener trap that forced the old
    "toggle only this one inner element" workaround, and removes the class of bugs where a click
    handler's `stopPropagation()` silently fails to stop an unrelated toggle from also firing.
  - Question identity should be a stable, persisted ID (not regenerated on every file load/switch as
    `_id` was before) — the old code had to key several features (Active Question, drag state) off
    Subject+Topic+SubTopic+Question text specifically because IDs weren't stable across reloads.
    Fix this at the source: assign an ID once, at CSV import time, and persist it.
- CRUD operations (create/rename/delete/move Subject/Topic/SubTopic/Question, bulk selection +
  bulk delete, the "Change Subject/Topic/SubTopic" move form with its auto-create-cascading
  behavior, drag-and-drop reorder/move including drop-onto-a-collapsed-header) each in their own
  module(s), operating on the data layer, calling into the render engine's fine-grained update API
  — not each hand-writing "mutate state.rawData, rebuild state.grouped, call a global render()."
- Bulk CSV import/export (the "+ Bulk Add/Update/Copy (CSV)" trio, reused at root/Subject/Topic/
  SubTopic level) and the five copy/export text builders (plain, hierarchy, structure+answer,
  structure-only, hierarchy-only) belong in the data/domain layer as pure text-building functions,
  with thin UI wiring on top — not embedded in the render module.
- Undo/redo: keep the snapshot-based approach (it's simple, proven, and appropriately scoped for this
  app's data size) but implement it as a clean wrapper around the data layer's mutation functions,
  not something every mutator has to remember to wrap itself in.

## What must work identically to before (behavioral contract, not implementation)

Everything in feature.md, including these specifics that are easy to get subtly wrong:
- CSV schema: required columns `Subject, Topic, SubTopic, Question, Answer, Done, ReviewLater`;
  optional `Duplicate, LessImportant, Starred, Order, SubjectOrder, TopicOrder, SubTopicOrder`.
  Duplicate-flagged rows are excluded from exports. Empty Subject/Topic/SubTopic groups round-trip
  through export/import as marker rows (blank Question).
- Multi-file support: more than one CSV loaded at once, independent progress/filters/active-question
  per file, switchable via a dropdown.
- Temp/Test Mode: skip all persistence for the current session.
- Sort tiering within a SubTopic: Starred first, then normal, then LessImportant last; ties broken by
  persisted order.
- Deleting a Subject/Topic/SubTopic is blocked while it still contains any questions.
- Active Question is a single global pointer, survives reload, shown as a breadcrumb link.
- Global stats badges (Total/Filtered/Review/Done/Starred) with click-to-filter/click-to-clear
  behavior, where "Filtered" reflects only Subject/Topic/SubTopic filters (never Status).
- Flatten view toggle, drag-and-drop on/off toggle, edit-mode toggle — each independently persisted.
- Undo/redo covering every data mutation, 50-entry cap, in-memory only (cleared on reload).
- Export filename auto-versioning by date (`_<Mon><DD>_v<NNN>`, incrementing same-day).

## Process

1. Read feature.md and README-AI.md fully before writing code.
2. Design and write down (as a comment or short doc at the top of the types module) the storage
   schema and domain types first — get this reviewed against feature.md's requirements before
   building UI on top of it.
3. Build bottom-up: types → data/domain layer (with a few quick sanity checks you can run via
   `node --test` for the pure logic — grouping/sort order, CSV parse/serialize round-trips, bulk
   add/update dedup matching, order-recompute math) → persistence layer → render engine → CRUD/
   feature modules → sync layer → final wiring in an app entry module.
4. Once functional, actually run the app in a browser (use the project's `run` skill if available)
   and walk every feature in feature.md's checklist end-to-end, not just type-check it. Pay specific
   attention to: drag-and-drop (including dropping onto a collapsed header), bulk CSV add/update with
   duplicate rows, undo/redo across several mutation types in a row, and the JSONBin sync flow.
5. Do not leave partial/stubbed features. If something in feature.md turns out to be ambiguous or
   contradictory, stop and ask rather than guessing.
```

## Verification

This session's deliverable is the prompt itself, not code — there is nothing to run or test here.
The plan is complete once the prompt above is handed to the user. When the user (or a future agent)
executes that prompt in a fresh session, its own step 4 ("Process") is the verification: run the app
via the `run` skill and manually walk every item in `feature.md`.
