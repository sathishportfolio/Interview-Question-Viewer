# Interview Question Viewer — Feature Guide

A browser-based, single-page tool for organizing, studying, and tracking interview questions in a
**Subject → Topic → SubTopic → Question** hierarchy. No backend required — everything runs
client-side and persists to `localStorage`, with optional cross-device sync.

This document is written for early consumers of the initial release build: what each feature does,
why it exists, and how to use it.

## Contents

**Data & Files**
- [CSV Upload](#csv-upload)
- [Load Sample Data](#load-sample-data)
- [Multiple CSV Files & File Switcher](#multiple-csv-files--file-switcher)
- [Temp / Test Mode](#temp--test-mode)
- [Export Progress (Download CSV)](#export-progress-download-csv)
- [Copy Progress CSV to Clipboard](#copy-progress-csv-to-clipboard)
- [Cross-Device Sync](#cross-device-sync)
- [Reset All Data](#reset-all-data)

**Browsing & Finding Questions**
- [Nested Accordion Tree](#nested-accordion-tree)
- [Flatten View](#flatten-view)
- [Filters (Subject / Topic / SubTopic / Status)](#filters-subject--topic--subtopic--status)
- [Global Stats Badges](#global-stats-badges)
- [Jump to Question (Search)](#jump-to-question-search)
- [Header Breadcrumb](#header-breadcrumb)
- [Active Question (Pin/Flag)](#active-question-pinflag)
- [Close All Accordions](#close-all-accordions)

**Tracking Progress**
- [Status Flags (Done, Review Later, Duplicate, Less Important, Starred)](#status-flags-done-review-later-duplicate-less-important-starred)
- [Study Timer](#study-timer)

**Editing Content**
- [Edit Mode](#edit-mode)
- [Edit / Add Answer](#edit--add-answer)
- [Quick Add Topic / SubTopic](#quick-add-topic--subtopic)
- [Bulk Add (CSV)](#bulk-add-csv)
- [Bulk Update (CSV)](#bulk-update-csv)
- [Bulk Copy (CSV)](#bulk-copy-csv)
- [Duplicate Detection Hints](#duplicate-detection-hints)
- [Rename Subject / Topic / SubTopic](#rename-subject--topic--subtopic)
- [Delete Subject / Topic / SubTopic / Question](#delete-subject--topic--subtopic--question)
- [Bulk Selection & Bulk Delete](#bulk-selection--bulk-delete)
- [Move Question(s) to a Different Subject/Topic/SubTopic](#move-questions-to-a-different-subjecttopicsubtopic)
- [Drag & Drop Reordering](#drag--drop-reordering)
- [Move Up / Down / Top / Bottom](#move-up--down--top--bottom)
- [Empty Group Placeholders](#empty-group-placeholders)

**Copying Content Out**
- [Copy Single Question](#copy-single-question)
- [Per-Level Copy Menus](#per-level-copy-menus)
- [Copy Visible Questions (Global)](#copy-visible-questions-global)

**Workflow & Safety**
- [Undo / Redo](#undo--redo)
- [Floating Toggle Group](#floating-toggle-group)
- [Responsive / Mobile Layout](#responsive--mobile-layout)

---

## CSV Upload

Upload a `.csv` file (via the **CSV** button in the top toolbar) containing your question bank.
Required columns: `Subject, Topic, SubTopic, Question, Answer, Done, ReviewLater`. Optional columns
(`Duplicate, LessImportant, Starred, Order, SubjectOrder, TopicOrder, SubTopicOrder`) are picked up
if present. The `Answer` column supports HTML for rich formatting (bold, lists, code, etc.).
Uploading a file with a name that's already loaded is blocked with a warning — rename the file,
switch to the existing one, or reset all data first.

![CSV Upload Screenshot](path/to/image.png)

## Load Sample Data

The **Load Sample** button loads a ready-made question set so you can explore the app without
preparing your own CSV first. It prefers a `csvString` defined in a sibling `data.js` file if
present, otherwise falls back to a small built-in sample (Java/SQL questions).

![Load Sample Screenshot](path/to/image.png)

## Multiple CSV Files & File Switcher

The app can hold more than one uploaded CSV at a time, each with its own independent progress,
filters, and active question. A dropdown in the toolbar lists every loaded file and lets you switch
between them instantly — useful for keeping separate question banks (e.g. per company or per
subject area) side by side.

![File Switcher Screenshot](path/to/image.png)

## Temp / Test Mode

A toggle switch next to the CSV upload button. When ON, anything loaded or edited in that session is
**not** saved to `localStorage` — ideal for previewing a CSV or trying out the app without committing
to persistent storage. When OFF (the normal mode), all progress is saved automatically as you work.

![Temp Mode Screenshot](path/to/image.png)

## Export Progress (Download CSV)

The **Export** button downloads the current file's full progress (all status flags, answers, and
ordering) as a CSV. The filename is auto-versioned by date (e.g. `myfile_Aug07_v001.csv`,
incrementing to `_v002` on the next same-day export) so repeated exports never overwrite each other
by accident. Rows marked **Duplicate** are excluded from the export.

![Export Screenshot](path/to/image.png)

## Copy Progress CSV to Clipboard

An icon button next to Export that copies the same CSV content straight to the clipboard instead of
downloading a file — convenient for pasting directly into a `data.js` seed file to refresh the
"Load Sample" dataset with your latest progress.

![Copy Progress CSV Screenshot](path/to/image.png)

## Cross-Device Sync

Automatic, keyless-setup cross-device sync backed by [JSONBin.io](https://jsonbin.io). On first use,
the app prompts for a JSONBin Master Key and Bin ID (opening the JSONBin site to help you get one),
then:
- **Auto-push**: every local change is pushed to your sync bin in the background after a short
  debounce, with no interruption to your work.
- **Auto-pull on load**: each time the app starts, it silently checks the cloud for newer data and
  reloads if anything differs.
- **Manual Pull** button: force an on-demand refresh from the cloud, with a confirmation prompt
  since it overwrites local data.
- **Usage badge**: a small round badge shows how much of JSONBin's free-tier 100KB cap your data is
  using (green under 90%, red at/above it). The payload is gzip-compressed before upload to make the
  most of that cap.

![Sync Screenshot](path/to/image.png)

## Reset All Data

Permanently deletes every uploaded CSV, its progress, and app settings from this browser's storage.
Requires confirmation, since it cannot be undone.

![Reset All Screenshot](path/to/image.png)

---

## Nested Accordion Tree

The main view: a collapsible Subject → Topic → SubTopic → Question hierarchy. Each level is its own
Bootstrap accordion, so you can drill down into exactly the section you're studying and collapse the
rest.

![Accordion Tree Screenshot](path/to/image.png)

## Flatten View

A toggle (the align-left icon, next to the Copy button) that swaps the nested tree for a flat list —
one `Subject/Topic/SubTopic` path heading per group, followed directly by its question accordions.
Useful for scanning many questions without repeatedly expanding three levels of hierarchy. Defaults
to ON on mobile devices on first visit. Every per-question action (status flags, edit, move, etc.)
still works identically in this view.

![Flatten View Screenshot](path/to/image.png)

## Filters (Subject / Topic / SubTopic / Status)

A collapsible filter card with multi-select dropdowns for Subject, Topic, SubTopic, and Status
(Done / Review Later / Duplicate / Less Important / Starred). Filters narrow the visible tree and
each dropdown's own options adjust to stay consistent with the others (e.g. picking a Subject
narrows which Topics are offered). A **Clear Filters** button resets everything. Filter selections
are remembered per file.

![Filters Screenshot](path/to/image.png)

## Global Stats Badges

A row of colored badges above the tree showing **Total**, **Filtered**, **Review**, **Done**, and
**Starred** counts. Clicking **Total** resets all filters; clicking **Filtered** resets just the
Status filters; clicking **Review**/**Done**/**Starred** toggles that status filter on or off
directly, without opening the filter card. This is the fastest way to jump straight to "show me
everything I've starred" or "show me what's left to review."

![Stats Badges Screenshot](path/to/image.png)

## Jump to Question (Search)

A live search box ("Jump to Question") that matches against Subject, Topic, SubTopic, and question
text as you type, showing up to 10 grouped results. Clicking a result scrolls to and highlights that
question in the tree. Search is scoped to whatever is currently visible under the active filters.

![Question Search Screenshot](path/to/image.png)

## Header Breadcrumb

The app header shows a live breadcrumb of whichever Subject/Topic/SubTopic chain is currently open
in the tree, so you always know where you are. If an Active Question is set, its breadcrumb (with a
flag icon and clickable link back to it) takes priority over the open-accordion breadcrumb.

![Breadcrumb Screenshot](path/to/image.png)

## Active Question (Pin/Flag)

Click empty space in a question's header to "flag" it as the single globally Active Question — a
one-at-a-time bookmark that survives page reloads. A green flag link then appears in the header
breadcrumb, letting you jump straight back to it from anywhere in the app. Click the flag icon again
to clear it.

![Active Question Screenshot](path/to/image.png)

## Close All Accordions

A floating icon button that collapses every currently-open Subject/Topic/SubTopic/Question
accordion in one click — a quick way to reset the view before drilling into a different section.

![Close All Accordions Screenshot](path/to/image.png)

---

## Status Flags (Done, Review Later, Duplicate, Less Important, Starred)

Every question carries five independent status flags, each toggled with its own icon on the question
row:
- **Done** — mark as completed/studied.
- **Review Later** — flag for a follow-up pass.
- **Duplicate** — mark as a duplicate of another question (excluded from CSV exports).
- **Less Important** — deprioritize without deleting.
- **Starred** — bookmark favorites; also usable as its own filter/status badge.

Flags drive the tree's sort order, the global stats badges, and the Status filter, so toggling one
immediately updates counts and (if a Status filter is active) may move or hide the question.

![Status Flags Screenshot](path/to/image.png)

## Study Timer

A simple stopwatch in the header (Start / Pause / Reset) for timing study sessions. The elapsed time
persists across reloads while running, so an accidental refresh doesn't lose your progress.

![Timer Screenshot](path/to/image.png)

---

## Edit Mode

A floating toggle (pencil icon) that shows or hides every editing-related control at once: the
upload/export toolbar, filter card, add/bulk-add panels, drag handles, and per-item edit/copy/move/
delete icons. Turning Edit Mode OFF gives a clean, distraction-free reading view for pure study
sessions; turning it ON brings back full editing capability. The setting is remembered across visits.

![Edit Mode Screenshot](path/to/image.png)

## Edit / Add Answer

Every question has an "Edit Answer" (or "Add Answer" if blank) button, always available regardless
of Edit Mode, that opens an inline editor for that question's answer content (HTML supported).

![Edit Answer Screenshot](path/to/image.png)

## Quick Add Topic / SubTopic

Inline "add" affordances at the Topic and SubTopic level for quickly creating a new one without
leaving the tree. (Adding a brand-new Subject is done via the Bulk Add panel — see below.)

![Quick Add Screenshot](path/to/image.png)

## Bulk Add (CSV)

A "+ Bulk Add (CSV)" panel available at the root, and at each Subject/Topic/SubTopic level, that
accepts a small pasted CSV block (comma-separated, header row required) and creates one question per
row. Rows can leave Subject/Topic/SubTopic blank to inherit the previous row's value or the panel's
own scope, so pasting many questions under the same group only requires naming that group once. Rows
that already exist (matched case-insensitively) are silently skipped and reported in the result
summary, along with any rows ignored for missing hierarchy or missing question text. A "Copy/insert
sample row" link fills in a starter template.

![Bulk Add Screenshot](path/to/image.png)

## Bulk Update (CSV)

The same CSV-paste mechanism as Bulk Add, but matches each row against an existing question (by
Subject+Topic+SubTopic+Question) and overwrites its answer and status flags in place; unmatched rows
are added as new questions instead, so nothing pasted is silently dropped.

![Bulk Update Screenshot](path/to/image.png)

## Bulk Copy (CSV)

Exports whatever scope you're viewing (the whole filtered set at the root, or just one Subject/
Topic/SubTopic) as CSV text to the clipboard, in the exact same column format Bulk Add/Update expect
— so you can copy a set of questions out, edit them, and paste them back in (or into another file)
without any reformatting.

![Bulk Copy Screenshot](path/to/image.png)

## Duplicate Detection Hints

While drafting a new question, the app fuzzy-matches your in-progress text against existing
questions and shows grouped "you may already have this" hints, with an auto-expanded group for any
exact (word-for-word) match — helping you avoid accidentally creating duplicate entries.

![Duplicate Hints Screenshot](path/to/image.png)

## Rename Subject / Topic / SubTopic

Rename any Subject, Topic, or SubTopic in place via a prompt dialog — every question underneath it,
and any related empty-group placeholder, is updated to match automatically.

![Rename Screenshot](path/to/image.png)

## Delete Subject / Topic / SubTopic / Question

Delete icons are available at every level. Deleting a Subject/Topic/SubTopic is blocked (with an
explanatory alert) if it still contains any questions — you must move or delete those first, which
prevents accidental mass data loss. Individual questions can always be deleted directly, with a
confirmation prompt.

![Delete Screenshot](path/to/image.png)

## Bulk Selection & Bulk Delete

A "Select" mode at the Subject, Topic, and SubTopic levels lets you check multiple items, see a live
selected-count bar, and delete all selected-and-empty items in one action (items that still contain
questions are skipped and called out). Questions within a SubTopic have their own selection mode too,
which also feeds bulk drag-move (see below).

![Bulk Selection Screenshot](path/to/image.png)

## Move Question(s) to a Different Subject/Topic/SubTopic

A "Change Subject/Topic/SubTopic" form (opened from a question's move icon, or from "Move Selected"
after a bulk selection) lets you relocate one or many questions to any other group — including
creating brand-new Subject/Topic/SubTopic destinations on the fly via inline "+ Add New" pickers,
with automatic cascading prompts when a newly-picked Subject or Topic has no children yet.

![Move Question Screenshot](path/to/image.png)

## Drag & Drop Reordering

Drag handles let you reorder Subjects, Topics, SubTopics, and Questions by dragging, including
dragging a question (or a bulk-selected batch) directly onto another SubTopic's header — even while
that SubTopic is collapsed — to move it there. This has its own independent on/off toggle (separate
from Edit Mode) in the global stats/actions row, since drag handles are otherwise always visible.

![Drag and Drop Screenshot](path/to/image.png)

## Move Up / Down / Top / Bottom

Per-question buttons to nudge a question one position up/down within its SubTopic, or jump it
straight to the top or bottom — a precise alternative to dragging for fine-tuning order.

![Move Up Down Screenshot](path/to/image.png)

## Empty Group Placeholders

Subjects, Topics, and SubTopics can exist with zero questions under them (e.g. right after creating
a new one, or after deleting all its questions) and still keep their place in the tree, filters, and
CSV export/import round-trip — they don't silently disappear until you explicitly delete them.

![Empty Groups Screenshot](path/to/image.png)

---

## Copy Single Question

Each question has a quick "copy" action to copy just its text to the clipboard, plus a
"copy and search" variant that also runs it through the duplicate-detection search.

![Copy Single Question Screenshot](path/to/image.png)

## Per-Level Copy Menus

Every Subject/Topic/SubTopic header has its own copy dropdown with five export formats scoped to
just that node and everything beneath it:
- **Questions (plain)** — one question per line.
- **Structure + Answer** — tab-separated Subject/Topic/SubTopic/Question rows.
- **Hierarchy (tab-indented)** — names and questions, indented by level.
- **Structure only** — tab-separated Subject/Topic/SubTopic rows, no questions.
- **Hierarchy only** — just the group names, tab-indented, no questions.

![Per-Level Copy Screenshot](path/to/image.png)

## Copy Visible Questions (Global)

A primary Copy button in the global stats/actions row offers the same five export formats as the
per-level menus, but scoped to whatever is currently visible under the active filters across the
whole tree.

![Copy Visible Questions Screenshot](path/to/image.png)

---

## Undo / Redo

A global, snapshot-based Undo/Redo (floating buttons) that covers every data-changing action —
status toggles, drag-and-drop reorder/move, group reassignment, deletes, and Bulk Add/Update — through
one shared mechanism, up to 50 steps back. History is in-memory only and resets on page reload.

![Undo Redo Screenshot](path/to/image.png)

## Floating Toggle Group

A compact floating control cluster (bottom corner) holding Close All Accordions, Undo, Redo, and the
Edit Mode toggle. On desktop it expands on hover; on mobile (no hover) tapping the main button
expands/collapses it, keeping the screen uncluttered while still one tap away from these actions.

![Floating Toggle Group Screenshot](path/to/image.png)

## Responsive / Mobile Layout

The layout adapts to smaller screens — Flatten View defaults on for first-time mobile visitors, the
header and floating controls resize/reflow for touch use, and every interactive control remains
reachable without horizontal scrolling.

![Responsive Layout Screenshot](path/to/image.png)
