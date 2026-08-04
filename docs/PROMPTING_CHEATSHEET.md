<!--
  PERSONAL NOTES — for me, not for the AI.
  Not linked from README-AI.md or any code comment on purpose, so it doesn't get
  pulled into an assistant's context automatically. Keep it that way: don't rename
  it to README-AI-*, don't reference it from code, don't paste it into a prompt.
-->

# TOOL TODO





# CURRENT PROMPT 

- sync with firebase / JSONBin.io / npoint.io / GitHub Gist / Supabase
- hide status-icon-btn icon-flag compact if question is not active
- active-question-breadcrumb-link on click scrolling to question accordian but flash highlight similar to  so i can catch it easily
- question accordian Clicking empty header space rerenders or scrolls which is affecting my focus, on click of empty space donot rerender or scroll or change accodian position

---

Read `README-AI.md` for context on this project, then implement the following features and refactors:


Donot run tests i will do verifications manually

If this involves tracing where something lives, a reusable pattern, or a multi-file
convention that isn't already documented in `refactored/README-AI.md`, add a short note there before
finishing (pattern/location-focused, not a changelog of what you did).

Also before finishing, Highlight any additions or phrasing that can help reduce token/usage limits and make context easier for the you to understand in future prompts.

--

Remove Level Context: Replace all references to "Level" with "SubTopic" across the entire tool.

Updated Grouping Hierarchy: Update all question grouping links to follow the Subject > Topic > SubTopic structure going forward.

# MY AI TODOS

- How to effectively vibe code springboot / angular application from scratch
- How to effectively use it for interview preperation
- How can I build my own desktop / unknown stack applications


# How I prompt efficiently on this project

## Before asking
- Know (roughly) which file it touches. Cheat sheet:
  - Timer stuff → `js/components/timer.js`
  - Fuzzy-duplicate hints / flash highlight / jump-to-question → `js/components/fuzzyHints.js`
  - The Subject/Topic/Level tree, add/edit/delete/move a question → `js/components/tree.js`
  - Filters (dropdowns, status filter) → `js/components/filters.js`
  - Search box → `js/components/search.js`
  - Stats badges, "Copy Visible" → `js/components/stats.js`
  - Manage Subjects/Topics/Levels panel → `js/components/metadata.js`
  - Starred-only view → `js/components/starred.js`
  - CSV load/save, localStorage → `js/api.js`
  - Shared state shape → `js/state.js`
  - Pure helpers (formatting, grouping) → `js/utils.js`
  - Static event listeners, boot sequence → `js/app.js`
- If unsure, describe the *symptom* ("the copy icon under a Topic header does X"), not a guess at the file — a bad guess sends the assistant down the wrong path.

## Writing the ask
- One sentence: what should happen, when, and any edge case you already know about.
- Batch 2-3 related asks into one message instead of one-at-a-time — each new message re-loads context.
- Say "add" for new behavior, "fix" for broken behavior, "change" for tweaking existing behavior — matches how the assistant scopes its diff.
- Avoid "review everything" / "clean this up" without a target file — that forces a full-codebase read. Scope it: "review tree.js for bugs."

## New session (fresh conversation)
- Open with: "Read README-AI.md, then <ask>." That file has the architecture; don't re-explain it yourself.
- Don't paste large chunks of file content into the prompt — say the file/function name, the assistant will read it directly (cheaper than a paste that may already be stale).
- When a session is running low on context (e.g. a "~X% until auto-compact" warning), just close it and start fresh rather than letting it auto-compact — compaction summarizes the whole session and loses detail; a new session with a good pointer prompt only loads what it needs, since the codebase is modular now.

### Template for the first message in a new session
```
Read refactored/README-AI.md, then: <what should happen, and which file you think it
touches if you know>

If this involves tracing where something lives, a reusable pattern, or a multi-file
convention that isn't already documented in README-AI.md, add a short note there before
finishing (pattern/location-focused, not a changelog of what you did).
```
Example:
```
Read refactored/README-AI.md, then: add a "Clear Timer" keyboard shortcut (press 'R'
while focused on the timer widget) in components/timer.js.

If this involves tracing where something lives, a reusable pattern, or a multi-file
convention that isn't already documented in README-AI.md, add a short note there before
finishing (pattern/location-focused, not a changelog of what you did).
```
If you don't know the file, skip that part and describe the symptom instead — check the file-location cheat sheet above first.

The "add a note back" line is the cheap insurance: most asks won't trigger it (nothing new
discovered), but on the ones that involve real exploration (see the Duplicate-filter /
starred-sort / icon-styling session), it turns that one-time discovery into a standing
shortcut for every future session instead of it living only in one conversation's history.

## After a change
- Test in the browser via `npx serve .` (or Live Server) — don't stack 5 more asks on top of an untested change. If it breaks, you're debugging 1 diff instead of 5.
- If something's broken, say what you did and what you saw, not just "it's broken" — saves a round-trip of "what were you trying."

## Good vs. bad ask (examples)
- Bad: "make the app better"
- Good: "In tree.js, when a question is marked Done, also collapse its accordion."
- Bad: "the filter thing is broken" (which filter thing?)
- Good: "Status filter's 'Starred' option (filters.js) doesn't remove questions when unchecked — repro: check Starred, uncheck it, list doesn't update."
- 

# Prompt: can you provide sample step to ask question next time?

Yes — closing and starting fresh is fine, and usually cheaper than letting auto-compact kick in (compaction summarizes this whole session, which loses detail; a fresh session with a good pointer prompt only loads what it needs). Since the codebase is now modular, a new session doesn't need to re-read everything — just the file(s) relevant to your next ask.

Sample steps for next time:

Open a new session (don't wait for auto-compact).
First message, use this template:

Read README-AI.md in the refactored/ folder for context on this project.

[Your ask — one sentence: what should happen, and which file you think it touches if you know]
If you don't know the file, skip that part and just describe the symptom — check PROMPTING_CHEATSHEET.md first for the file-location cheat sheet (that's for you, not for me to read).
Batch 2-3 related asks into that first message if you have them, rather than trickling them in one at a time.
Test in the browser (npx serve .) before asking for more changes on top.
Example first message:


### Example PROMPT: Read README-AI.md in the refactored/ folder for context on this project, then: add a "Clear Timer" keyboard shortcut (press 'R' while focused on the timer widget) in components/timer.js.

### That costs roughly: reading README-AI.md (small) + reading components/timer.js (~50 lines) + maybe app.js for the event-wiring pattern — a few thousand tokens, not a full-codebase re-scan.

# Prompt: so how make you understand context of the project and seek your help to add/update feature in large projects like springboot, angular

For large Spring Boot/Angular projects, the efficient approach isn't memory files — it's letting me explore on-demand and anchoring with a project doc:

1. CLAUDE.md (do this first, once)
Run /init in the project root. It generates a CLAUDE.md that captures build commands, folder structure, conventions, key modules. This loads automatically every session — cheap, persistent, no memory system needed.

2. Point, don't paste
Instead of pasting huge files into chat, just reference paths: "update the OrderService.createOrder method in OrderService.java to also validate X." I'll read only what's needed via Read/Grep/Glob — targeted reads cost far less than you dumping whole files.

3. Let exploration be scoped
For "where is X handled" type questions across a big codebase, I use search tools (Grep/Glob) or spin up an Explore subagent that reads code in an isolated context and reports back a summary — keeping the bulk of file contents out of your main conversation's token count.

4. Feature work — give me the entry point
For "add/update a feature," the fastest path is: name the layer (controller/service/repo on Spring side, component/service on Angular side) and one existing similar feature to mirror. I'll trace dependencies from there rather than needing the whole architecture upfront.

5. Session hygiene
Long-running sessions on one feature are fine — context builds naturally as I read files during the work. Starting a new session per unrelated feature is actually cheaper than one giant session, since old irrelevant context doesn't linger.

So: CLAUDE.md for persistent project facts, targeted file/path references instead of pastes, and subagents for broad exploration — that's the combo that scales on large codebases without memory files.