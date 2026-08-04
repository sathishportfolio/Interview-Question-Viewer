/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state } from '../state.js';
import { persistCurrentProgress, saveActiveQuestion } from '../api.js';
import { filterGroupedData, refreshFilterOptions } from './filters.js';
import { addQuestionAfterMatch, flashHighlightItem, subTopicAlertKey, openSubTopicAddPanelPrefilled, populateFuzzyHint, showSubTopicAlert, showSuccessAlert } from './fuzzyHints.js';
import { promptRename, renameSubTopic, renameSubject, renameTopic } from './metadata.js';
import { populateQuestionSearch } from './search.js';
import { updateGlobalStatsBadges } from './stats.js';
import { buildHierarchyOnlyCopyText, buildStructureOnlyCopyText, buildStructureWithAnswerCopyText, buildTreeCopyText, computeStats, flattenQuestions, getExistingOrder, groupData, idsWithInsertAfter, markGroupEmpty, mergeReorder, nextQuestionOrder, questionExistsIn, toBool, uid } from '../utils.js';

// Requirement: dragging a question (or a bulk-selected batch) onto a SubTopic's header — always
// visible whether that SubTopic is open or collapsed — must work as a drop target, not just its
// (possibly hidden) question list. SortableJS's cross-list linking only reaches a list that's
// actually laid out/visible, and — in this app's Sortable config — the drag itself is its own
// internal pointer-tracked gesture, not a real native HTML5 drag (no native dragover/drop ever
// fires on a plain foreign element like a header). So header-dropping is its own mechanism: a
// `document`-level pointermove listener that hit-tests (`elementFromPoint`) for a SubTopic
// header under the cursor while draggingQids is non-empty, highlighting it; `finishDragIfHoveringHeader()`
// (called from wherever a drag ends — questionAccordion Sortable's onEnd, or the bulk-move
// handle's own mouseup) commits the move if the drag ended over a header. draggingQids/
// draggingSourceKey are set by whichever drag started — the questionAccordion Sortable's
// onStart (single question, drag handle) or the bulk-move handle's mousedown (createSubTopic()).
let draggingQids = [];
let draggingSourceKey = null; // "subject|topic" — cross-SubTopic drag stays within one Topic
let dragHoverTarget = null;   // {subject, topic, subTopic} of the header currently under the pointer, or null

function clearDropHighlights() {
  document.querySelectorAll(".drop-target-highlight.is-active").forEach(h => h.classList.remove("is-active"));
}

function hitTestDropHeader(clientX, clientY) {
  clearDropHighlights();
  dragHoverTarget = null;
  if (!draggingQids.length) return;

  // elementFromPoint ignores .drop-target-highlight itself (pointer-events: none), so this
  // always resolves to whatever real header content is under the cursor, never the overlay.
  const el = document.elementFromPoint(clientX, clientY);
  const headerEl = el && el.closest(".accordion-header");
  const subTopicItem = headerEl && headerEl.closest("[data-sub-topic]");
  if (!subTopicItem) return;

  const topicAncestor = subTopicItem.closest("[data-topic]");
  const subjectAncestor = subTopicItem.closest("[data-subject]");
  if (!topicAncestor || !subjectAncestor) return;
  if (subjectAncestor.dataset.subject + "|" + topicAncestor.dataset.topic !== draggingSourceKey) return;

  const highlight = headerEl.querySelector(":scope > .drop-target-highlight");
  if (highlight) highlight.classList.add("is-active");
  dragHoverTarget = { subject: subjectAncestor.dataset.subject, topic: topicAncestor.dataset.topic, subTopic: subTopicItem.dataset.subTopic };
}

function onDragHitTestMove(e) { hitTestDropHeader(e.clientX, e.clientY); }

function startHeaderDropTracking() {
  document.addEventListener("mousemove", onDragHitTestMove);
  document.addEventListener("dragover", onDragHitTestMove);
}

function stopHeaderDropTracking() {
  document.removeEventListener("mousemove", onDragHitTestMove);
  document.removeEventListener("dragover", onDragHitTestMove);
  clearDropHighlights();
}

// Returns true if the drag ended over a header and the move was performed.
function finishDragIfHoveringHeader() {
  if (!dragHoverTarget || !draggingQids.length) return false;
  const { subject, topic, subTopic } = dragHoverTarget;
  const qids = draggingQids;
  dragHoverTarget = null;
  moveQuestionsToSubTopic(qids, subject, topic, subTopic);
  return true;
}

export function reorderSubTopicQuestions(subject, topic, subTopic, newOrderIds) {
  const masterArr = state.grouped[subject] && state.grouped[subject][topic] && state.grouped[subject][topic][subTopic];
  if (!masterArr) return;

  const idToQ = {};
  masterArr.forEach(q => { idToQ[q._id] = q; });

  const queue = newOrderIds.slice();
  const visibleIds = new Set(newOrderIds);

  const newMaster = masterArr.map(q => visibleIds.has(q._id) ? idToQ[queue.shift()] : q);

  newMaster.forEach((q, i) => { q.Order = i; });
  state.grouped[subject][topic][subTopic] = newMaster;
  persistCurrentProgress();
}

export function moveQuestionToEdge(q, edge) {
  const arr = state.grouped[q.Subject] && state.grouped[q.Subject][q.Topic] && state.grouped[q.Subject][q.Topic][q.SubTopic];
  if (!arr) return;
  const otherIds = arr.map(r => r._id).filter(id => id !== q._id);
  const newOrderIds = edge === "top" ? [q._id, ...otherIds] : [...otherIds, q._id];
  reorderSubTopicQuestions(q.Subject, q.Topic, q.SubTopic, newOrderIds);
  state.pendingFocusQid = q._id;
  render();
  highlightMovedQuestion(q._id);
}

export function moveQuestionByStep(q, direction) {
  const arr = state.grouped[q.Subject] && state.grouped[q.Subject][q.Topic] && state.grouped[q.Subject][q.Topic][q.SubTopic];
  if (!arr) return;
  const ids = arr.map(r => r._id);
  const idx = ids.indexOf(q._id);
  if (idx === -1) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ids.length) return; // already at that edge
  [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
  reorderSubTopicQuestions(q.Subject, q.Topic, q.SubTopic, ids);
  state.pendingFocusQid = q._id;
  render();
  highlightMovedQuestion(q._id);
}

export function highlightMovedQuestion(qid) {
  flashHighlightItem(document.querySelector('[data-qid="' + qid + '"]'));
}

export function reorderSubjects(newOrderNames) {
  const allSubjects = Object.keys(state.grouped); // already in current sorted order
  const merged = mergeReorder(allSubjects, newOrderNames);
  merged.forEach((name, i) => {
    state.rawData.forEach(r => { if (r.Subject === name) r.SubjectOrder = i; });
  });
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
}

export function reorderTopics(subject, newOrderNames) {
  const allTopics = state.grouped[subject] ? Object.keys(state.grouped[subject]) : newOrderNames;
  const merged = mergeReorder(allTopics, newOrderNames);
  merged.forEach((name, i) => {
    state.rawData.forEach(r => { if (r.Subject === subject && r.Topic === name) r.TopicOrder = i; });
  });
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
}

export function reorderSubTopics(subject, topic, newOrderNames) {
  const allSubTopics = (state.grouped[subject] && state.grouped[subject][topic]) ? Object.keys(state.grouped[subject][topic]) : newOrderNames;
  const merged = mergeReorder(allSubTopics, newOrderNames);
  merged.forEach((name, i) => {
    state.rawData.forEach(r => { if (r.Subject === subject && r.Topic === topic && r.SubTopic === name) r.SubTopicOrder = i; });
  });
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
}

// Requirement: New Topic / New SubTopic can each be created on its own — just the one name
// being created, nothing lower forced — instead of the old cascade that dragged the user all
// the way down to typing a first question. Creating one just registers it as an empty group
// (markGroupEmpty(), utils.js); groupData() keeps its header alive with zero questions until
// something real gets added under it. (New Subject has no single-entry quickAdd anymore — the
// "+ Bulk Add New Subjects" textarea handles a single line just as well; see render().)
export function quickAddTopic(subject) {
  const topic = (prompt('New Topic name under "' + subject + '":') || "").trim();
  if (!topic) return;
  if (state.grouped[subject] && state.grouped[subject][topic]) {
    alert('"' + topic + '" already exists under "' + subject + '".');
    return;
  }
  // Requirement: adding an item shouldn't collapse whatever else was already open — capture/
  // restore the same way delete* does (see the comment on captureOpenState() up top).
  const openState = captureOpenState();
  markGroupEmpty(subject, topic, null);
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  render();
  restoreOpenState(openState);
  highlightNewGroup(subject, topic, null);
}

export function quickAddSubTopic(subject, topic) {
  const subTopic = (prompt('New SubTopic name under "' + subject + " / " + topic + '":') || "").trim();
  if (!subTopic) return;
  if (state.grouped[subject] && state.grouped[subject][topic] && state.grouped[subject][topic][subTopic]) {
    alert('"' + subTopic + '" already exists under "' + subject + " / " + topic + '".');
    return;
  }
  const openState = captureOpenState();
  markGroupEmpty(subject, topic, subTopic);
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  render();
  restoreOpenState(openState);
  highlightNewGroup(subject, topic, subTopic);
}

// Requirement: ONE core bulk-add function reused by all three "+ Bulk Add New ..." buttons
// (Subjects at the root, Topics within a Subject, SubTopics within a Subject+Topic) — no more
// separate bulkAddSubjects/bulkAddTopics/bulkAddSubTopics. `fixedSubject`/`fixedTopic` are
// whatever's already pinned by context (both null at the root, just Subject pinned inside a
// Subject's own body, both pinned inside a Topic's own body); each textarea line is tab-
// separated fields for whatever's left: [Subject?, Topic?, SubTopic?, Question?, Answer?],
// trimmed down to only the fields not already fixed. A line can stop at any depth — trailing
// fields are optional — so the exact same core handles "just a name" (old bulkAdd* behavior)
// all the way up to a full Subject→Topic→SubTopic→Question→Answer row in one line:
//   root:                Subject [Tab] Topic [Tab] SubTopic [Tab] Question [Tab] Answer
//   inside a Subject:               Topic [Tab] SubTopic [Tab] Question [Tab] Answer
//   inside a Subject+Topic:                   SubTopic [Tab] Question [Tab] Answer
// A line stopping short of Question just registers an empty group (markGroupEmpty(), same
// mechanism as the single quickAdd* functions); a full line creates a real question exactly
// like createAddQuestionPanel()'s own bulk-CSV path does (nextQuestionOrder() for Order,
// getExistingOrder() for the hierarchy Order fields, questionExistsIn() to skip a duplicate
// question silently rather than erroring the whole paste out).
export function bulkAddHierarchy(fixedSubject, fixedTopic, rawText) {
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { groupsAdded: 0, questionsAdded: 0 };

  // Mirrors markGroupEmpty()'s own "does this already have rows" check, but also checks
  // state.emptyGroups directly (not the state.grouped cache, which isn't rebuilt until the end
  // of this whole batch) so it stays accurate against groups added earlier in the *same* paste.
  function groupAlreadyExists(subject, topic, subTopic) {
    const hasRows = state.rawData.some(r =>
      r.Subject === subject && (topic == null || r.Topic === topic) && (subTopic == null || r.SubTopic === subTopic));
    if (hasRows) return true;
    return state.emptyGroups.some(g => g.Subject === subject && g.Topic === (topic ?? null) && g.SubTopic === (subTopic ?? null));
  }

  const openState = captureOpenState();
  let groupsAdded = 0;
  let questionsAdded = 0;
  let lastQid = null;
  let lastGroup = null;

  lines.forEach(line => {
    const fields = line.split("\t").map(f => f.trim());
    let i = 0;
    const subject = fixedSubject || fields[i++] || "";
    if (!subject) return;
    const topic = fixedTopic || fields[i++] || "";
    if (!topic) {
      if (!groupAlreadyExists(subject, null, null)) { markGroupEmpty(subject, null, null); groupsAdded++; }
      lastGroup = { subject, topic: null, subTopic: null };
      return;
    }
    const subTopic = fields[i++] || "";
    if (!subTopic) {
      if (!groupAlreadyExists(subject, topic, null)) { markGroupEmpty(subject, topic, null); groupsAdded++; }
      lastGroup = { subject, topic, subTopic: null };
      return;
    }
    const questionText = fields[i++] || "";
    if (!questionText) {
      if (!groupAlreadyExists(subject, topic, subTopic)) { markGroupEmpty(subject, topic, subTopic); groupsAdded++; }
      lastGroup = { subject, topic, subTopic };
      return;
    }
    const answerText = fields[i++] || "";
    const siblings = state.rawData.filter(r => r.Subject === subject && r.Topic === topic && r.SubTopic === subTopic);
    if (questionExistsIn(siblings, questionText)) return; // skip duplicates silently
    const ord = getExistingOrder(subject, topic, subTopic);
    const newQ = {
      Subject: subject, Topic: topic, SubTopic: subTopic,
      Question: questionText, Answer: answerText,
      Done: false, ReviewLater: false, Duplicate: false, LessImportant: false, Starred: false,
      Order: nextQuestionOrder(subject, topic, subTopic),
      SubjectOrder: ord.subjectOrder, TopicOrder: ord.topicOrder, SubTopicOrder: ord.subTopicOrder,
      _id: uid("q")
    };
    state.rawData.push(newQ);
    questionsAdded++;
    lastQid = newQ._id;
    lastGroup = { subject, topic, subTopic };
  });

  if (!groupsAdded && !questionsAdded) return { groupsAdded, questionsAdded };

  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  if (lastQid) state.pendingFocusQid = lastQid;
  render();
  restoreOpenState(openState);
  if (lastQid) {
    highlightMovedQuestion(lastQid);
  } else if (lastGroup) {
    highlightNewGroup(lastGroup.subject, lastGroup.topic, lastGroup.subTopic);
  }

  const parts = [];
  if (groupsAdded) parts.push(groupsAdded + " group(s)");
  if (questionsAdded) parts.push(questionsAdded + " question(s)");
  showSuccessAlert(parts.join(" and ") + " added.");

  return { groupsAdded, questionsAdded };
}

function highlightNewGroup(subject, topic, subTopic) {
  requestAnimationFrame(() => {
    const item = expandGroupChain(subject, topic, subTopic);
    if (!item) return;
    updateHeaderBreadcrumb();
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    flashHighlightItem(item);
  });
}

export function createQuickAddButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm btn-outline-primary quick-add-row mb-2";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

// Requirement: default <textarea> Tab behavior shifts focus to the next control, which fights
// every tab-separated bulk-add textarea in this file — typing a row by hand needs a literal tab
// between fields, not a focus jump. Intercept Tab (and Shift+Tab, same as Tab here — there's no
// existing indentation to outdent) and insert a real tab character at the caret instead, then
// restore the caret position right after it so typing can continue immediately.
function enableTabCharacterInsertion(textarea) {
  textarea.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + "\t" + textarea.value.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + 1;
  });
}

// Requirement: a shared "quick-copy/edit" link for any tab-separated bulk-add textarea — copies
// a sample row to the clipboard AND appends it as a new line in the textarea itself, ready to
// edit in place, instead of making the user retype the column order from the hint text above it.
function createBulkTemplateLink(textarea, templateRow) {
  const link = document.createElement("a");
  link.href = "#";
  link.className = "small d-inline-block mb-1";
  link.textContent = "Copy/insert sample row";
  link.title = "Copies a sample tab-separated row (" + templateRow.split("\t").join(" / ") + ") to the clipboard and inserts it below for editing";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const sep = textarea.value && !textarea.value.endsWith("\n") ? "\n" : "";
    textarea.value += sep + templateRow;
    navigator.clipboard.writeText(templateRow).catch(() => { });
    textarea.focus();
  });
  return link;
}

// Requirement: a toggleable "+ Bulk Add New ..." panel — a textarea, one row per group/question,
// tab-separated fields for whatever hierarchy depth isn't already fixed by context. Thin UI shell
// now: all parsing/dedup/creation lives in bulkAddHierarchy(), so onAddRaw is just that function
// (or a wrapper around it) called with the raw textarea text; the panel only clears/hides itself
// once onAddRaw reports at least one thing was actually added (0/0 leaves the draft in place so
// the user can fix a typo rather than losing their paste). `placeholder`/`templateRow` are both
// optional — omit either to skip that affordance for a given caller.
export function createBulkAddGroupButton(label, hint, onAddRaw, placeholder, templateRow) {
  const wrap = document.createElement("div");
  wrap.className = "mb-2 quick-add-row";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "btn btn-sm btn-outline-secondary mb-2";
  toggleBtn.textContent = label;
  wrap.appendChild(toggleBtn);

  const panel = document.createElement("div");
  panel.className = "add-question-panel";
  panel.style.display = "none";
  wrap.appendChild(panel);

  const hintEl = document.createElement("div");
  hintEl.className = "small text-muted mb-1";
  hintEl.textContent = hint;
  panel.appendChild(hintEl);

  const textarea = document.createElement("textarea");
  textarea.className = "form-control form-control-sm mb-2";
  textarea.rows = 5;
  if (placeholder) textarea.placeholder = placeholder;
  enableTabCharacterInsertion(textarea);

  if (templateRow) panel.appendChild(createBulkTemplateLink(textarea, templateRow));
  panel.appendChild(textarea);

  const actions = document.createElement("div");
  const addAllBtn = document.createElement("button");
  addAllBtn.type = "button";
  addAllBtn.className = "btn btn-sm btn-success me-2";
  addAllBtn.textContent = "Add All";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-sm btn-outline-secondary";
  cancelBtn.textContent = "Cancel";
  actions.appendChild(addAllBtn);
  actions.appendChild(cancelBtn);
  panel.appendChild(actions);

  toggleBtn.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  cancelBtn.addEventListener("click", () => {
    textarea.value = "";
    panel.style.display = "none";
  });

  addAllBtn.addEventListener("click", () => {
    if (!textarea.value.trim()) {
      alert("Nothing to add.");
      return;
    }
    const result = onAddRaw(textarea.value);
    if (!result || (!result.groupsAdded && !result.questionsAdded)) {
      alert("No new rows to add (all blank, duplicate, or already exist).");
      return;
    }
    textarea.value = "";
    panel.style.display = "none";
  });

  return wrap;
}

// Requirement: consistent selection controls (individual checkbox, Select/Done Selecting,
// Select All, Clear, and bulk delete) at every tree level — reused identically for Subjects
// (render()), Topics (createSubject()), and SubTopics (createTopic()); the pre-existing
// per-question selection UI in createSubTopic() predates this and stays hand-written (it also
// drives bulk *move* via drag, which these three don't need), but follows the same shape.
//
// - `itemNoun`: singular label used in button/status text ("Subject", "Topic", "SubTopic").
// - `getCheckboxes()`: thunk returning the *current* NodeList of this level's checkboxes —
//   re-queried on every call since the accordion this belongs to gets rebuilt on every render().
// - `isEmpty(name)` / `bulkDelete(names)`: emptiness check and the actual bulk-delete call,
//   both keyed by name (Subject/Topic/SubTopic string), not by DOM reference.
//
// Returns { selectToggleBtn, selectAllBtn, bulkBar, selectedNames, toggleSelectingOn(el) } —
// the caller inserts selectToggleBtn/selectAllBtn into its own toolbar and bulkBar wherever it
// likes, calls toggleSelectingOn(itemEl) from its own "Select" click handler (since only the
// caller knows which element should carry the `.selecting` class its own CSS gate keys off of),
// and wires each item's own checkbox to add/remove from `selectedNames` + call `updateBulkBar()`.
function createGroupSelectionUI(itemNoun, getCheckboxes, isEmpty, bulkDelete) {
  const selectedNames = new Set();

  const selectToggleBtn = document.createElement("button");
  selectToggleBtn.type = "button";
  selectToggleBtn.className = "btn btn-sm btn-outline-secondary select-toggle-btn";
  selectToggleBtn.textContent = "Select";

  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.className = "btn btn-sm btn-outline-secondary select-toggle-btn";
  selectAllBtn.textContent = "Select All";
  selectAllBtn.style.display = "none";

  const bulkBar = document.createElement("div");
  bulkBar.className = "bulk-move-bar";
  bulkBar.style.display = "none";

  const bulkBarLabel = document.createElement("span");
  bulkBarLabel.className = "bulk-move-label";

  const bulkBarDelete = document.createElement("button");
  bulkBarDelete.type = "button";
  bulkBarDelete.className = "btn btn-sm btn-link text-danger";
  bulkBarDelete.textContent = "Delete Selected";

  const bulkBarClear = document.createElement("button");
  bulkBarClear.type = "button";
  bulkBarClear.className = "btn btn-sm btn-link";
  bulkBarClear.textContent = "Clear";

  bulkBar.appendChild(bulkBarLabel);
  bulkBar.appendChild(bulkBarDelete);
  bulkBar.appendChild(bulkBarClear);

  function updateBulkBar() {
    const count = selectedNames.size;
    bulkBar.style.display = count ? "flex" : "none";
    bulkBarLabel.textContent = count + " " + itemNoun + (count === 1 ? "" : "s") + " selected";
  }

  function clearSelection() {
    selectedNames.clear();
    getCheckboxes().forEach(cb => { cb.checked = false; });
    updateBulkBar();
  }

  // Requirement: toggling selection mode needs to add/remove `.selecting` on the *caller's*
  // element (a Subject/Topic item, or a root wrapper) — this helper doesn't know which, so it
  // doesn't wire selectToggleBtn's click itself. Callers do:
  // `selectToggleBtn.addEventListener("click", () => toggleSelectingOn(theirElement));` — one
  // listener, not two, so the click can't double-toggle.
  function toggleSelectingOn(el) {
    const selecting = !el.classList.contains("selecting");
    el.classList.toggle("selecting", selecting);
    selectToggleBtn.textContent = selecting ? "Done Selecting" : "Select";
    selectAllBtn.style.display = selecting ? "" : "none";
    if (!selecting) clearSelection();
  }

  selectAllBtn.addEventListener("click", () => {
    getCheckboxes().forEach(cb => { cb.checked = true; });
    // Checkboxes carry the name in their own change handler's closure, not a shared lookup here
    // — so "select all" also needs each checkbox's name, read back off a data attribute it sets.
    getCheckboxes().forEach(cb => { if (cb.dataset.selectName) selectedNames.add(cb.dataset.selectName); });
    updateBulkBar();
  });

  bulkBarClear.addEventListener("click", clearSelection);

  bulkBarDelete.addEventListener("click", () => {
    const names = [...selectedNames];
    if (!names.length) return;
    const emptyNames = names.filter(isEmpty);
    const blockedCount = names.length - emptyNames.length;
    if (!emptyNames.length) {
      alert("None of the selected " + itemNoun + "s can be deleted — they all still have questions under them. Move or delete them first.");
      return;
    }
    const msg = "Delete " + emptyNames.length + " empty " + itemNoun + (emptyNames.length === 1 ? "" : "s") + "?" +
      (blockedCount ? " (" + blockedCount + " selected " + itemNoun + (blockedCount === 1 ? "" : "s") + " skipped — still has questions.)" : "");
    if (!confirm(msg)) return;
    bulkDelete(emptyNames);
  });

  return { selectToggleBtn, selectAllBtn, bulkBar, selectedNames, updateBulkBar, toggleSelectingOn };
}

export function updateHeaderBreadcrumb() {
  const el = document.getElementById("headerBreadcrumb");
  if (!el) return;
  el.textContent = "";

  // Requirement: the Active Question's own breadcrumb link takes over #headerBreadcrumb
  // entirely when one exists — the open Subject/Topic/SubTopic chain (below) only renders as a
  // fallback when there's no active-question-breadcrumb-link to show.
  if (appendActiveQuestionBreadcrumbLink(el)) return;

  const openSubject = document.querySelector("#subjectAccordion > .accordion-item:has(> .accordion-collapse.show)");
  if (!openSubject) return;

  const parts = [openSubject.dataset.subject];
  const topicAcc = openSubject.querySelector(":scope > .accordion-collapse.show > .accordion-body > .accordion");
  const openTopic = topicAcc && topicAcc.querySelector(":scope > .accordion-item:has(> .accordion-collapse.show)");
  if (openTopic) {
    parts.push(openTopic.dataset.topic);
    const subTopicAcc = openTopic.querySelector(":scope > .accordion-collapse.show > .accordion-body > .accordion");
    const openSubTopic = subTopicAcc && subTopicAcc.querySelector(":scope > .accordion-item:has(> .accordion-collapse.show)");
    if (openSubTopic) parts.push(openSubTopic.dataset.subTopic);
  }
  el.appendChild(document.createTextNode(parts.join(" / ")));
}

// Requirement: the globally-flagged Active Question (setActiveQuestion(), above) gets its own
// link in the header breadcrumb — Subject / Topic / SubTopic / <flag icon> Question, using the
// question's own hierarchy (not whatever chain happens to currently be open) — replacing the
// open-accordion breadcrumb entirely rather than sitting alongside it. Returns whether it
// actually rendered anything, so updateHeaderBreadcrumb() knows whether to fall back. Clicking it
// expands just enough to reveal the question's own header row (its answer body stays collapsed)
// and scrolls to it — reuses expandToQuestion() rather than reimplementing that "expand ancestors
// only" logic a second time.
function appendActiveQuestionBreadcrumbLink(el) {
  const active = state.activeQuestion;
  if (!active) return false;
  const match = state.rawData.find(r =>
    r.Subject === active.Subject && r.Topic === active.Topic &&
    r.SubTopic === active.SubTopic && r.Question === active.Question
  );
  if (!match) return false;

  // Requirement: turns red (.is-unavailable, style.css) whenever the active question isn't
  // currently reachable in the DOM — e.g. an active Subject/Topic/SubTopic/Status filter hides
  // it — and back to its normal green the moment a filter change makes it visible again, since
  // this whole function re-runs (and re-checks) every time updateHeaderBreadcrumb() does.
  const isAvailable = !!document.querySelector('#subjectAccordion [data-qid="' + match._id + '"]');

  const link = document.createElement("a");
  link.href = "#";
  link.className = "active-question-breadcrumb-link" + (isAvailable ? "" : " is-unavailable");
  link.title = isAvailable ? "Scroll to the active question" : "The active question is hidden by the current filters";
  link.appendChild(document.createTextNode(match.Subject + " / " + match.Topic + " / " + match.SubTopic + " / "));
  const flagIcon = document.createElement("i");
  flagIcon.className = "fa-solid fa-flag";
  link.appendChild(flagIcon);
  link.appendChild(document.createTextNode(" " + match.Question));
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const qItem = expandToQuestion(match._id);
    if (qItem) {
      requestAnimationFrame(() => {
        qItem.scrollIntoView({ behavior: "smooth", block: "center" });
        flashHighlightItem(qItem);
      });
    }
  });
  el.appendChild(link);
  return true;
}

export function render() {
  const root = document.getElementById("rootAccordion");
  root.textContent = "";
  state.badgeRefs = {};
  state.scrollTargetEl = null;
  state.expandDirection = state.tempMode ? "last" : "first";

  updateHeaderBreadcrumb(); // clears stale text; re-set once the tree (re)opens below

  const filtered = filterGroupedData();
  const filteredQuestions = flattenQuestions(filtered);
  updateGlobalStatsBadges(filteredQuestions);
  populateQuestionSearch(filteredQuestions); // Requirement: search only the currently filtered questions

  if (!Object.keys(state.grouped).length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No data loaded yet. Upload a CSV to get started.";
    root.appendChild(empty);
    return;
  }

  // Requirement: the #globalStatsBadges "flatten" toggle (updateGlobalStatsBadges(), stats.js)
  // swaps the nested Subject > Topic > SubTopic accordion tree below for a flat list of just
  // the question accordions, one Subject/Topic/SubTopic path heading per group — same filtered
  // data (`filtered`), just laid out differently (see renderFlatGroupedView() below).
  if (state.flatGroupView) {
    renderFlatGroupedView(root, filtered);
    return;
  }

  if (!Object.keys(filtered).length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No questions match the current filters.";
    root.appendChild(empty);
    return;
  }

  const subjectAccordion = document.createElement("div");
  subjectAccordion.className = "accordion";
  subjectAccordion.id = "subjectAccordion";

  // Requirement: Universal Selection Controls — select 1+ Subjects at the root, then bulk
  // delete the empty ones. Same shape as the Topic/SubTopic selection UIs one level down;
  // `.selecting` toggles on #subjectAccordion itself, since Subjects have no shared wrapper
  // item the way Topics/SubTopics do (their parent Subject/Topic item).
  const subjectSelectionUI = createGroupSelectionUI(
    "Subject",
    () => subjectAccordion.querySelectorAll(".subject-select-checkbox"),
    name => !state.rawData.some(r => r.Subject === name),
    names => bulkDeleteSubjects(names)
  );
  const subjectSelectionCtx = { selectedNames: subjectSelectionUI.selectedNames, onChange: subjectSelectionUI.updateBulkBar };

  // Requirement: no standalone "+ Add New Subject" — the bulk-add textarea already accepts a
  // single line/entry just fine, so it's the one way to add a Subject now. Its toggle button
  // shares one row with Select/Select All (the bulk-add panel itself still unfolds below).
  const subjectBulkAdd = createBulkAddGroupButton(
    "+ Bulk Add New Subjects",
    "One row per line, tab-separated: Subject [Topic] [SubTopic] [Question] [Answer]. Trailing fields are optional.",
    rawText => bulkAddHierarchy(null, null, rawText)
  );
  const subjectControlsRow = document.createElement("div");
  subjectControlsRow.className = "d-flex align-items-start flex-wrap gap-2 mb-2 quick-add-row";
  subjectControlsRow.appendChild(subjectBulkAdd);
  subjectControlsRow.appendChild(subjectSelectionUI.selectToggleBtn);
  subjectControlsRow.appendChild(subjectSelectionUI.selectAllBtn);
  root.appendChild(subjectControlsRow);
  root.appendChild(subjectSelectionUI.bulkBar);
  subjectSelectionUI.selectToggleBtn.addEventListener("click", () => subjectSelectionUI.toggleSelectingOn(subjectAccordion));

  // While focusing a specific just-added question, suppress the state.tempMode first/last
  // auto-expand entirely so we don't end up with two different branches expanded at once.
  const focusing = !!state.pendingFocusQid;

  const subjectKeys = Object.keys(filtered);
  const subjectTargetIdx = state.expandDirection === "last" ? subjectKeys.length - 1 : 0;

  subjectKeys.forEach((subject, i) => {
    const isTarget = !focusing && state.tempMode && !state.editModeOn && i === subjectTargetIdx;
    const subjectItem = createSubject(subject, filtered[subject], subjectAccordion.id, isTarget, subjectSelectionCtx);
    subjectAccordion.appendChild(subjectItem);
  });

  // drag-to-reorder: reorder top-level Subjects
  Sortable.create(subjectAccordion, {
    handle: ".drag-handle",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: function () {
      const newOrder = Array.from(subjectAccordion.children).map(el => el.dataset.subject);
      reorderSubjects(newOrder);
    }
  });

  root.appendChild(subjectAccordion);
  updateHeaderBreadcrumb(); // reflects any isTarget auto-expand that just happened above

  if (focusing) {
    const targetQid = state.pendingFocusQid;
    state.pendingFocusQid = null;
    const qItem = expandToQuestion(targetQid);
    if (qItem) {
      updateHeaderBreadcrumb(); // expandToQuestion may have opened a different chain
      requestAnimationFrame(() => {
        qItem.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    // fall through to the normal state.scrollTargetEl handling below if the question wasn't found
    // (e.g. hidden by an active filter)
  }

  if (state.scrollTargetEl) {
    requestAnimationFrame(() => {
      state.scrollTargetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

// Requirement: the #globalStatsBadges flatten toggle (stats.js) — instead of the nested
// Subject > Topic > SubTopic accordion tree, show one Subject/Topic/SubTopic path heading
// (a plain <p>, not an accordion header — collapsing the group headers away is the whole
// point of this view) per group that actually has questions, followed by that group's
// question accordions. Reuses createQuestion() as-is (same status icons/edit/delete/move,
// same q-item markup) so every per-question action still works identically to the nested
// tree — only the Subject/Topic/SubTopic layer around it is gone. Each group still gets its
// own createMoveForm() instance, same "one shared instance per SubTopic" pattern
// createSubTopic() uses, so moveIconBtn has somewhere to open into; there's no bulk-select/
// drag-reorder here, though, since those are about relocating within/between SubTopics, which
// this view doesn't otherwise represent.
export function renderFlatGroupedView(root, filtered) {
  const container = document.createElement("div");
  container.id = "flatGroupedView";
  root.appendChild(container);

  let renderedAny = false;
  let focusedItem = null;
  const focusQid = state.pendingFocusQid;
  state.pendingFocusQid = null;

  Object.keys(filtered).forEach(subject => {
    const topics = filtered[subject];
    Object.keys(topics).forEach(topic => {
      const subTopics = topics[topic];
      Object.keys(subTopics).forEach(subTopic => {
        const questions = subTopics[subTopic];
        if (!questions.length) return; // an empty group has no questions to flatten into view
        renderedAny = true;

        const pathHeading = document.createElement("p");
        pathHeading.className = "flat-group-path";
        pathHeading.textContent = subject + "/" + topic + "/" + subTopic;
        container.appendChild(pathHeading);

        const moveForm = createMoveForm(subject, topic, subTopic);
        container.appendChild(moveForm.wrapper);

        const questionAccordionId = uid("flatQAcc");
        const questionAccordion = document.createElement("div");
        questionAccordion.className = "accordion mb-4";
        questionAccordion.id = questionAccordionId;

        questions.forEach(q => {
          const qItem = createQuestion(q, questionAccordionId, false, null, qids => moveForm.openFor(qids));
          questionAccordion.appendChild(qItem);
          if (focusQid && q._id === focusQid) focusedItem = qItem;
        });

        container.appendChild(questionAccordion);
      });
    });
  });

  if (!renderedAny) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No questions match the current filters.";
    container.appendChild(empty);
    return;
  }

  if (focusedItem) {
    requestAnimationFrame(() => focusedItem.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
}

export function expandToQuestion(qid) {
  const qItem = document.querySelector('#subjectAccordion [data-qid="' + qid + '"]');
  if (!qItem) return null;

  // Only the Subject/Topic/SubTopic ancestors are auto-opened; the question's own answer body
  // stays collapsed and is just scrolled into view below.
  let collapse = qItem.closest(".accordion-collapse");
  while (collapse) {
    const item = collapse.parentElement;
    const btn = item.querySelector(":scope > .accordion-header > .accordion-button");
    if (btn) expandItem(btn, collapse);
    collapse = item.closest(".accordion-collapse");
  }

  return qItem;
}

export function expandSubTopicChain(subject, topic, subTopic) {
  const subjectItem = Array.from(document.querySelectorAll("#subjectAccordion > .accordion-item"))
    .find(el => el.dataset.subject === subject);
  if (!subjectItem) return null;
  openChainItem(subjectItem);

  const topicItem = Array.from(subjectItem.querySelectorAll(":scope > .accordion-collapse > .accordion-body > .accordion > .accordion-item"))
    .find(el => el.dataset.topic === topic);
  if (!topicItem) return null;
  openChainItem(topicItem);

  const subTopicItem = Array.from(topicItem.querySelectorAll(":scope > .accordion-collapse > .accordion-body > .accordion > .accordion-item"))
    .find(el => el.dataset.subTopic === subTopic);
  if (!subTopicItem) return null;
  openChainItem(subTopicItem);

  return subTopicItem;
}

// Like expandSubTopicChain, but tolerates a shallower target (topic/subTopic null) — used to
// jump to a freshly-created empty Subject/Topic/SubTopic, which by definition has nothing under
// it yet. Returns the deepest item found along the way instead of failing the whole lookup.
export function expandGroupChain(subject, topic, subTopic) {
  const subjectItem = Array.from(document.querySelectorAll("#subjectAccordion > .accordion-item"))
    .find(el => el.dataset.subject === subject);
  if (!subjectItem) return null;
  openChainItem(subjectItem);
  if (!topic) return subjectItem;

  const topicItem = Array.from(subjectItem.querySelectorAll(":scope > .accordion-collapse > .accordion-body > .accordion > .accordion-item"))
    .find(el => el.dataset.topic === topic);
  if (!topicItem) return subjectItem;
  openChainItem(topicItem);
  if (!subTopic) return topicItem;

  const subTopicItem = Array.from(topicItem.querySelectorAll(":scope > .accordion-collapse > .accordion-body > .accordion > .accordion-item"))
    .find(el => el.dataset.subTopic === subTopic);
  if (!subTopicItem) return topicItem;
  openChainItem(subTopicItem);

  return subTopicItem;
}

// Requirement: deletions (single or bulk, at any level) shouldn't collapse everything the user
// had open — render() always rebuilds #rootAccordion from scratch (fresh, all-collapsed DOM
// nodes), so "keep it open" has to mean "note what's open, rebuild, then reopen the same
// chains" rather than literally not touching the DOM. captureOpenState() walks the *current*
// (pre-render) tree for every open Subject/Topic/SubTopic chain — SubTopics aren't a strict
// one-open accordion (see the data-bs-parent comment in createSubTopic()), so more than one can
// be open under the same Topic; capture all of them, not just the first. restoreOpenState()
// replays each chain through expandGroupChain(), which already tolerates a chain that's now
// partially or fully gone (the deleted node) by just expanding as far as it still can.
export function captureOpenState() {
  const open = [];
  document.querySelectorAll("#subjectAccordion > .accordion-item[data-subject]").forEach(subjectEl => {
    if (!subjectEl.querySelector(":scope > .accordion-collapse")?.classList.contains("show")) return;
    const subject = subjectEl.dataset.subject;
    const topicEls = subjectEl.querySelectorAll(":scope > .accordion-collapse > .accordion-body > .accordion > .accordion-item[data-topic]");
    let anyTopicOpen = false;
    topicEls.forEach(topicEl => {
      if (!topicEl.querySelector(":scope > .accordion-collapse")?.classList.contains("show")) return;
      anyTopicOpen = true;
      const topic = topicEl.dataset.topic;
      const subTopicEls = topicEl.querySelectorAll(":scope > .accordion-collapse > .accordion-body > .accordion > .accordion-item[data-sub-topic]");
      let anySubTopicOpen = false;
      subTopicEls.forEach(subTopicEl => {
        if (!subTopicEl.querySelector(":scope > .accordion-collapse")?.classList.contains("show")) return;
        anySubTopicOpen = true;
        open.push({ subject, topic, subTopic: subTopicEl.dataset.subTopic });
      });
      if (!anySubTopicOpen) open.push({ subject, topic, subTopic: null });
    });
    if (!anyTopicOpen) open.push({ subject, topic: null, subTopic: null });
  });
  return open;
}

export function restoreOpenState(openState) {
  requestAnimationFrame(() => {
    openState.forEach(({ subject, topic, subTopic }) => expandGroupChain(subject, topic, subTopic));
    updateHeaderBreadcrumb();
  });
}

// Requirement: an action that mutates in place and deliberately does NOT jump anywhere
// afterward (no highlightMovedQuestion/scrollIntoView of its own — unlike add/reorder flows,
// which want to land on the new/moved item) still visibly jumps the page to the top, because
// render()'s `root.textContent = ""` briefly shrinks the document below the current scroll
// position and the browser clamps scrollY down to fit; restoreOpenState() then re-expands the
// tree back to full height on the next frame, but browsers don't auto-restore a scroll position
// that was only clamped, not explicitly changed. Call this right after restoreOpenState(), with
// the scrollY captured before mutating, to put the viewport back where the user actually was —
// scheduled as its own requestAnimationFrame so it runs after restoreOpenState()'s own callback
// (registered first) has already re-expanded the chains and grown the page back out.
export function restoreScrollAfter(scrollY) {
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

export function openChainItem(item) {
  const btn = item.querySelector(":scope > .accordion-header > .accordion-button");
  const collapse = item.querySelector(":scope > .accordion-collapse");
  if (btn && collapse) expandItem(btn, collapse);
}

export function expandItem(button, collapse) {
  button.classList.remove("collapsed");
  button.setAttribute("aria-expanded", "true");
  collapse.classList.add("show");
}

export function renumberQuestionAccordion(accordionEl) {
  if (!accordionEl) return;
  Array.from(accordionEl.children).forEach((el, i) => {
    const idx = el.querySelector(":scope > .accordion-header .q-index");
    if (idx) idx.textContent = (i + 1) + ".";
  });
}

export function autoExpandFirstDescendant(accordionEl) {
  if (!accordionEl) return;
  const firstItem = accordionEl.querySelector(":scope > .accordion-item");
  if (!firstItem) return;
  // Only Subject/Topic/SubTopic ("tree-item") accordions auto-open. Question items ("q-item")
  // are never auto-opened, so the answer body stays collapsed until the user clicks it.
  if (!firstItem.classList.contains("tree-item")) return;
  const btn = firstItem.querySelector(":scope > .accordion-header > .accordion-button");
  const col = firstItem.querySelector(":scope > .accordion-collapse");
  if (!btn || !col) return;
  if (btn.classList.contains("collapsed")) expandItem(btn, col);
  const nestedAccordion = col.querySelector(":scope > .accordion-body > .accordion");
  if (nestedAccordion) autoExpandFirstDescendant(nestedAccordion);
}

export function createBadges(stats) {
  const wrap = document.createDocumentFragment();

  const total = document.createElement("span");
  total.className = "badge bg-secondary ms-2 badge-count";
  total.textContent = stats.total;
  wrap.appendChild(total);

  if (stats.done > 0) {
    const done = document.createElement("span");
    done.className = "badge ms-1 badge-count";
    done.style.backgroundColor = "var(--done-line)";
    done.style.color = "#fff";
    done.textContent = "Done " + stats.done;
    wrap.appendChild(done);
  }

  if (stats.review > 0) {
    const review = document.createElement("span");
    review.className = "badge ms-1 badge-count";
    review.style.backgroundColor = "var(--review-line)";
    review.style.color = "#fff";
    review.textContent = "Review " + stats.review;
    wrap.appendChild(review);
  }

  return wrap;
}

export function syncBadges(q) {
  ["S|" + q.Subject,
  "T|" + q.Subject + "|" + q.Topic,
  "L|" + q.Subject + "|" + q.Topic + "|" + q.SubTopic
  ].forEach(key => {
    const ref = state.badgeRefs[key];
    if (!ref) return;
    const stats = computeStats(flattenQuestions(ref.node));
    ref.holder.textContent = "";
    ref.holder.appendChild(createBadges(stats));
  });
}

export function deleteQuestionById(qid) {
  const idx = state.rawData.findIndex(r => r._id === qid);
  if (idx === -1) return;
  const { Subject, Topic, SubTopic } = state.rawData[idx];
  const openState = captureOpenState();
  state.rawData.splice(idx, 1);
  // Requirement: a SubTopic (or Topic/Subject) left with zero questions keeps its header
  // instead of vanishing from the tree — markGroupEmpty() is a no-op if it still has rows.
  markGroupEmpty(Subject, Topic, SubTopic);
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
}

// Requirement: delete a whole Subject/Topic/SubTopic and everything under it (rows AND any
// empty-group markers within that branch) — the header delete buttons above confirm() first,
// this just does the removal + rebuild. Uses .filter() rather than deleteQuestionById()-style
// splice-in-a-loop since a cascading delete can remove many rows/markers in one pass.
export function deleteSubjectGroup(subject) {
  const openState = captureOpenState();
  state.rawData = state.rawData.filter(r => r.Subject !== subject);
  state.emptyGroups = state.emptyGroups.filter(g => g.Subject !== subject);
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
  showSuccessAlert('Deleted Subject "' + subject + '".');
}

export function deleteTopicGroup(subject, topic) {
  const openState = captureOpenState();
  state.rawData = state.rawData.filter(r => !(r.Subject === subject && r.Topic === topic));
  state.emptyGroups = state.emptyGroups.filter(g => !(g.Subject === subject && g.Topic === topic));
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
  showSuccessAlert('Deleted Topic "' + topic + '".');
}

export function deleteSubTopicGroup(subject, topic, subTopic) {
  const openState = captureOpenState();
  state.rawData = state.rawData.filter(r => !(r.Subject === subject && r.Topic === topic && r.SubTopic === subTopic));
  state.emptyGroups = state.emptyGroups.filter(g => !(g.Subject === subject && g.Topic === topic && g.SubTopic === subTopic));
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
  showSuccessAlert('Deleted SubTopic "' + subTopic + '".');
}

// Requirement: bulk delete for Subjects/Topics/SubTopics — same cascading-but-empty-only removal
// as the single-item delete* functions above, batched into one groupData/persist/render pass.
// Names have already been filtered to "provably empty" ones by the caller (createGroupSelectionUI()'s
// bulk-delete handler); this doesn't re-check.
export function bulkDeleteSubjects(subjects) {
  const openState = captureOpenState();
  const set = new Set(subjects);
  state.rawData = state.rawData.filter(r => !set.has(r.Subject));
  state.emptyGroups = state.emptyGroups.filter(g => !set.has(g.Subject));
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
  showSuccessAlert(subjects.length + " Subject(s) deleted.");
}

export function bulkDeleteTopics(subject, topics) {
  const openState = captureOpenState();
  const set = new Set(topics);
  state.rawData = state.rawData.filter(r => !(r.Subject === subject && set.has(r.Topic)));
  state.emptyGroups = state.emptyGroups.filter(g => !(g.Subject === subject && set.has(g.Topic)));
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
  showSuccessAlert(topics.length + ' Topic(s) deleted under "' + subject + '".');
}

export function bulkDeleteSubTopics(subject, topic, subTopics) {
  const openState = captureOpenState();
  const set = new Set(subTopics);
  state.rawData = state.rawData.filter(r => !(r.Subject === subject && r.Topic === topic && set.has(r.SubTopic)));
  state.emptyGroups = state.emptyGroups.filter(g => !(g.Subject === subject && g.Topic === topic && set.has(g.SubTopic)));
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
  showSuccessAlert(subTopics.length + ' SubTopic(s) deleted under "' + subject + " / " + topic + '".');
}

// Requirement: bulk delete for selected questions (the "Delete Selected" link next to "Clear"
// in the bulk-move-bar, createSubTopic()).
export function bulkDeleteQuestions(qids) {
  const openState = captureOpenState();
  const scrollY = window.scrollY;
  const groups = [];
  qids.forEach(qid => {
    const idx = state.rawData.findIndex(r => r._id === qid);
    if (idx === -1) return;
    groups.push({ Subject: state.rawData[idx].Subject, Topic: state.rawData[idx].Topic, SubTopic: state.rawData[idx].SubTopic });
    state.rawData.splice(idx, 1);
  });
  groups.forEach(g => markGroupEmpty(g.Subject, g.Topic, g.SubTopic));
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
  restoreOpenState(openState);
  restoreScrollAfter(scrollY);
  showSuccessAlert(groups.length + " question(s) deleted.");
}

// Requirement: bulk status quick-actions (Done/Review Later/Duplicate/Less Important icons in
// the bulk-move-bar, createSubTopic()) — each click flips every selected question's OWN current
// value for that field independently (true->false, false->true per question), the same as
// clicking each one's individual status-icon toggle would, just in one motion. There's no single
// "before" state to show since a mixed selection can have some already on and some off, so
// unlike the single-question toggles this button has no pressed/is-active look of its own.
export function bulkToggleQuestionStatus(qids, field, label) {
  const targets = qids.map(qid => state.rawData.find(r => r._id === qid)).filter(Boolean);
  if (!targets.length) return;
  if (field === "Duplicate" && targets.some(q => !q.Duplicate && q.Answer && q.Answer.trim())) {
    const proceed = confirm("One or more selected questions already have an answer filled in. Marking them Duplicate excludes them from the exported Progress CSV, so that content could effectively be lost. Continue?");
    if (!proceed) return;
  }
  const openState = captureOpenState();
  const scrollY = window.scrollY;
  targets.forEach(q => {
    q[field] = !q[field];
    if (field === "Done" && q.Done) q.ReviewLater = false;
    if (field === "ReviewLater" && q.ReviewLater) q.Done = false;
  });
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  render();
  restoreOpenState(openState);
  restoreScrollAfter(scrollY);
  showSuccessAlert(label + " toggled for " + targets.length + " question(s).");
}

// Requirement: an icon-only copy button for the Subject accordion that flattens every
// currently-visible question under it to one per line, regardless of Topic/SubTopic nesting —
// same flattenQuestions() this file already uses for badge stats, same wiring shape as
// createCopyQuestionsButton() below, just no structure at all in the output.
export function createPlainCopyButton(getNode) {
  const btn = document.createElement("span");
  btn.className = "tree-copy-btn";
  btn.title = "Copy every currently-visible question under here, one per line";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-list";
  btn.appendChild(icon);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const qs = flattenQuestions(getNode());
    if (!qs.length) { alert("No questions to copy."); return; }
    const text = qs.map(q => q.Question).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      showSuccessAlert(qs.length + " question(s) copied to clipboard.");
    }).catch(() => {
      alert("Copy failed — clipboard access may be blocked by the browser.");
    });
  });
  return btn;
}

export function createCopyQuestionsButton(getNode, kind, label) {
  const btn = document.createElement("span");
  btn.className = "tree-copy-btn";
  btn.title = kind === "subTopic"
    ? "Copy all visible questions (one per line)"
    : "Copy all visible questions (tab-indented hierarchy)";
  btn.innerHTML = '<i class="fa-solid fa-sitemap"></i>';
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const { text, count } = buildTreeCopyText(getNode(), kind, label);
    if (!count) { alert("No questions to copy."); return; }
    navigator.clipboard.writeText(text).then(() => {
      showSuccessAlert(count + " question(s) copied to clipboard.");
    }).catch(() => {
      alert("Copy failed — clipboard access may be blocked by the browser.");
    });
  });
  return btn;
}

// Requirement: a second copy button — hierarchy only (Subject/Topic/SubTopic names), no
// Question text — same wiring as createCopyQuestionsButton() above, different icon/util.
export function createHierarchyCopyButton(getNode, kind, label) {
  const btn = document.createElement("span");
  btn.className = "tree-copy-btn";
  btn.title = "Copy visible hierarchy only (Subjects/Topics/SubTopics, no questions)";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-folder-tree";
  btn.appendChild(icon);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const { text, count } = buildHierarchyOnlyCopyText(getNode(), kind, label);
    if (!count) { alert("No hierarchy to copy."); return; }
    navigator.clipboard.writeText(text).then(() => {
      showSuccessAlert(count + " item(s) copied to clipboard.");
    }).catch(() => {
      alert("Copy failed — clipboard access may be blocked by the browser.");
    });
  });
  return btn;
}

// Requirement: two more copy buttons alongside createCopyQuestionsButton()/
// createHierarchyCopyButton() above — same wiring. Every tree-copy-btn is scoped to its own node
// plus descendants only, never ancestors (a Topic's copy must not carry its parent Subject, a
// SubTopic's must not carry Subject/Topic) — `label` here is just this node's own name, matching
// buildTreeCopyText()'s `label` param (see buildStructureWithAnswerCopyText()/
// buildStructureOnlyCopyText() in utils.js).
export function createStructureWithAnswerCopyButton(getNode, kind, label) {
  const btn = document.createElement("span");
  btn.className = "tree-copy-btn";
  btn.title = "Copy visible structure with question (this node's own Topic/SubTopic/Question path per row, no ancestors)";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-table-list";
  btn.appendChild(icon);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const { text, count } = buildStructureWithAnswerCopyText(getNode(), kind, label);
    if (!count) { alert("No questions to copy."); return; }
    navigator.clipboard.writeText(text).then(() => {
      showSuccessAlert(count + " row(s) copied to clipboard.");
    }).catch(() => {
      alert("Copy failed — clipboard access may be blocked by the browser.");
    });
  });
  return btn;
}

export function createStructureCopyButton(getNode, kind, label) {
  const btn = document.createElement("span");
  btn.className = "tree-copy-btn";
  btn.title = "Copy visible structure only (this node's own Topic/SubTopic path per row, no ancestors, no questions)";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-diagram-project";
  btn.appendChild(icon);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const { text, count } = buildStructureOnlyCopyText(getNode(), kind, label);
    if (!count) { alert("No structure to copy."); return; }
    navigator.clipboard.writeText(text).then(() => {
      showSuccessAlert(count + " row(s) copied to clipboard.");
    }).catch(() => {
      alert("Copy failed — clipboard access may be blocked by the browser.");
    });
  });
  return btn;
}

export function copyAndSearchQuestion(q) {
  const searchText = q.Subject + " + " + q.Topic + " + " + q.Question;
  navigator.clipboard.writeText(searchText).catch(() => { /* still proceed to search below */ });
  window.open("https://www.google.com/search?q=" + encodeURIComponent(searchText), "_blank", "noopener,noreferrer");
}

export function copyQuestionOnly(q) {
  navigator.clipboard.writeText(q.Question).then(() => {
    showSuccessAlert("Question copied to clipboard.");
  }).catch(() => {
    alert("Copy failed — clipboard access may be blocked by the browser.");
  });
}

// Requirement: a single global "Active Question" flag (at most one at a time, unlike Starred/Done
// etc. which any number of questions can carry) — identified by content
// (Subject/Topic/SubTopic/Question), not _id, since _id is regenerated on every load/switch (see
// readFileData()/processParsedResults() in api.js) and so can't survive a reload. Set by clicking
// empty header space on a question (see the `button` click listener in createQuestion()); cleared
// only via its own flag icon, never by clicking a different question's empty space while one is
// already active — clicking empty space anywhere always just sets that question as the new active
// one, implicitly replacing whichever was active before.
//
// Deliberately NOT a render()-triggering mutation, unlike Starred/LessImportant's
// state.grouped = groupData(...); render() pattern — flagging a question is meant to be inert
// (no re-render, no scroll, no repositioning), so both functions patch just the affected
// .icon-flag DOM nodes directly. `flagBtn` is this question's own flag <span>, already in scope
// at the call site (defined earlier in the same createQuestion() invocation) — passing it in
// lets us flip its own is-active state without a DOM lookup.
export function isActiveQuestion(q) {
  const a = state.activeQuestion;
  return !!a && a.Subject === q.Subject && a.Topic === q.Topic && a.SubTopic === q.SubTopic && a.Question === q.Question;
}

export function setActiveQuestion(q, flagBtn) {
  document.querySelectorAll(".status-icon-btn.icon-flag.is-active").forEach(el => {
    if (el === flagBtn) return;
    el.classList.remove("is-active");
    el.title = "Not the active question";
  });
  state.activeQuestion = { Subject: q.Subject, Topic: q.Topic, SubTopic: q.SubTopic, Question: q.Question };
  saveActiveQuestion(state.currentFileName, state.activeQuestion);
  if (flagBtn) {
    flagBtn.classList.add("is-active");
    flagBtn.title = "Clear active question flag";
  }
  updateHeaderBreadcrumb();
}

export function clearActiveQuestion(flagBtn) {
  state.activeQuestion = null;
  saveActiveQuestion(state.currentFileName, null);
  if (flagBtn) {
    flagBtn.classList.remove("is-active");
    flagBtn.title = "Not the active question";
  }
  updateHeaderBreadcrumb();
}

export function createSubject(subject, topics, parentId, isTarget, selectionCtx) {
  const itemId = uid("subj");
  const item = document.createElement("div");
  item.className = "accordion-item tree-item";
  item.dataset.subject = subject;

  const header = document.createElement("h2");
  header.className = "accordion-header";

  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.title = "Drag to reorder";
  dragHandle.textContent = "⠿";

  // Requirement: Universal Selection Controls — this Subject's own checkbox, controlled by the
  // root-level selection UI (render()), same shape as createQuestion()'s selectionCtx.
  let selectCheckbox = null;
  if (selectionCtx) {
    selectCheckbox = document.createElement("input");
    selectCheckbox.type = "checkbox";
    selectCheckbox.className = "form-check-input subject-select-checkbox";
    selectCheckbox.title = "Select for bulk delete";
    selectCheckbox.dataset.selectName = subject;
    selectCheckbox.checked = selectionCtx.selectedNames.has(subject);
    selectCheckbox.addEventListener("click", e => e.stopPropagation());
    selectCheckbox.addEventListener("change", () => {
      if (selectCheckbox.checked) selectionCtx.selectedNames.add(subject);
      else selectionCtx.selectedNames.delete(subject);
      selectionCtx.onChange();
    });
  }

  const button = document.createElement("button");
  button.className = "accordion-button collapsed";
  button.type = "button";
  button.setAttribute("data-bs-toggle", "collapse");
  button.setAttribute("data-bs-target", "#" + itemId);
  button.textContent = subject;

  const stats = computeStats(flattenQuestions(topics));
  const badgeHolder = document.createElement("span");
  badgeHolder.className = "badge-holder";
  badgeHolder.appendChild(createBadges(stats));
  button.appendChild(badgeHolder);
  state.badgeRefs["S|" + subject] = { holder: badgeHolder, node: topics };

  const editSubjectBtn = document.createElement("span");
  editSubjectBtn.className = "tree-edit-btn";
  editSubjectBtn.title = "Rename Subject";
  editSubjectBtn.textContent = "✎";
  editSubjectBtn.addEventListener("click", () => promptRename("Subject", subject, newName => renameSubject(subject, newName)));
  const copySubjectPlainBtn = createPlainCopyButton(() => topics);
  const copySubjectBtn = createCopyQuestionsButton(() => topics, "subject", subject);
  const copySubjectHierarchyBtn = createHierarchyCopyButton(() => topics, "subject", subject);
  const copySubjectStructureAnswerBtn = createStructureWithAnswerCopyButton(() => topics, "subject", subject);
  const copySubjectStructureBtn = createStructureCopyButton(() => topics, "subject", subject);

  // Requirement: delete a whole Subject (and everything under it) from its header, with a
  // confirmation that spells out exactly how much is about to go — this is the one destructive
  // tree-level action, so it gets its own red-on-hover styling (.tree-delete-btn) rather than
  // reusing .tree-edit-btn/.tree-copy-btn's neutral look.
  const deleteSubjectBtn = document.createElement("span");
  deleteSubjectBtn.className = "tree-delete-btn";
  deleteSubjectBtn.title = "Delete Subject";
  const deleteSubjectIcon = document.createElement("i");
  deleteSubjectIcon.className = "fa-solid fa-trash";
  deleteSubjectBtn.appendChild(deleteSubjectIcon);
  deleteSubjectBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Requirement: a non-empty Subject can't be deleted from here at all — no cascading data
    // loss through this button. Move/delete its questions first to empty it out.
    const qCount = flattenQuestions(topics).length;
    if (qCount > 0) {
      alert('Cannot delete Subject "' + subject + '" — it still has ' + qCount + ' question(s) under it. Move or delete them first.');
      return;
    }
    if (!confirm('Delete empty Subject "' + subject + '"?')) return;
    deleteSubjectGroup(subject);
  });

  header.appendChild(dragHandle);
  if (selectCheckbox) header.appendChild(selectCheckbox);
  header.appendChild(button);
  header.appendChild(editSubjectBtn);

  header.appendChild(copySubjectPlainBtn);
  header.appendChild(copySubjectStructureAnswerBtn);
  header.appendChild(copySubjectBtn);
  header.appendChild(copySubjectStructureBtn);
  header.appendChild(copySubjectHierarchyBtn);

  header.appendChild(deleteSubjectBtn);
  item.appendChild(header);

  const collapse = document.createElement("div");
  collapse.id = itemId;
  collapse.className = "accordion-collapse collapse";
  collapse.setAttribute("data-bs-parent", "#" + parentId);

  const body = document.createElement("div");
  body.className = "accordion-body";

  const topicAccordionId = uid("topicAcc");
  const topicAccordion = document.createElement("div");
  topicAccordion.className = "accordion";
  topicAccordion.id = topicAccordionId;

  // Requirement: Universal Selection Controls — select 1+ Topics under this Subject, then bulk
  // delete the empty ones. topicSelectionCtx is passed to each createTopic() call below so it
  // can render its own checkbox; toggleSelectingOn(item) puts the `.selecting` class on this
  // Subject's own item (CSS: [data-subject].selecting .topic-select-checkbox).
  const topicSelectionUI = createGroupSelectionUI(
    "Topic",
    () => topicAccordion.querySelectorAll(".topic-select-checkbox"),
    name => !state.rawData.some(r => r.Subject === subject && r.Topic === name),
    names => bulkDeleteTopics(subject, names)
  );
  const topicSelectionCtx = { selectedNames: topicSelectionUI.selectedNames, onChange: topicSelectionUI.updateBulkBar };

  const topicKeys = Object.keys(topics);
  const topicTargetIdx = state.expandDirection === "last" ? topicKeys.length - 1 : 0;

  topicKeys.forEach((topic, i) => {
    const childIsTarget = isTarget && i === topicTargetIdx;
    const topicItem = createTopic(subject, topic, topics[topic], topicAccordionId, childIsTarget, topicSelectionCtx);
    topicAccordion.appendChild(topicItem);
  });

  // Requirement: "+ Add New Topic", "+ Bulk Add New Topics", and Select share one row.
  const topicControlsRow = document.createElement("div");
  topicControlsRow.className = "d-flex align-items-start flex-wrap gap-2 mb-2 quick-add-row";
  topicControlsRow.appendChild(createQuickAddButton("+ Add New Topic", () => quickAddTopic(subject)));
  topicControlsRow.appendChild(createBulkAddGroupButton(
    "+ Bulk Add New Topics",
    "One row per line, tab-separated: Topic [SubTopic] [Question] [Answer]. Trailing fields are optional.",
    rawText => bulkAddHierarchy(subject, null, rawText),
    "topic",
    "Topic\tSubTopic\tQuestion\tAnswer"
  ));
  topicControlsRow.appendChild(topicSelectionUI.selectToggleBtn);
  topicControlsRow.appendChild(topicSelectionUI.selectAllBtn);
  body.appendChild(topicControlsRow);
  body.appendChild(topicSelectionUI.bulkBar);
  topicSelectionUI.selectToggleBtn.addEventListener("click", () => topicSelectionUI.toggleSelectingOn(item));
  body.appendChild(topicAccordion);
  collapse.appendChild(body);
  item.appendChild(collapse);

  // Requirement #1: any click that opens a Subject accordion drills into its first
  // Topic -> first SubTopic -> first Question. shown.bs.collapse bubbles, so only react
  // when it's this exact collapse (not a nested one) firing.
  collapse.addEventListener("shown.bs.collapse", e => {
    if (e.target !== collapse) return;
    autoExpandFirstDescendant(topicAccordion);
  });

  if (isTarget) expandItem(button, collapse);

  // drag-to-reorder: reorder Topics within this Subject
  Sortable.create(topicAccordion, {
    handle: ".drag-handle",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: function () {
      const newOrder = Array.from(topicAccordion.children).map(el => el.dataset.topic);
      reorderTopics(subject, newOrder);
    }
  });

  return item;
}

export function createTopic(subject, topic, subTopics, parentId, isTarget, selectionCtx) {
  const itemId = uid("topic");
  const item = document.createElement("div");
  item.className = "accordion-item tree-item";
  item.dataset.topic = topic;

  const header = document.createElement("h2");
  header.className = "accordion-header";

  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.title = "Drag to reorder";
  dragHandle.textContent = "⠿";

  // Requirement: Universal Selection Controls — this Topic's own checkbox, controlled by its
  // parent Subject's selection UI (createSubject()).
  let selectCheckbox = null;
  if (selectionCtx) {
    selectCheckbox = document.createElement("input");
    selectCheckbox.type = "checkbox";
    selectCheckbox.className = "form-check-input topic-select-checkbox";
    selectCheckbox.title = "Select for bulk delete";
    selectCheckbox.dataset.selectName = topic;
    selectCheckbox.checked = selectionCtx.selectedNames.has(topic);
    selectCheckbox.addEventListener("click", e => e.stopPropagation());
    selectCheckbox.addEventListener("change", () => {
      if (selectCheckbox.checked) selectionCtx.selectedNames.add(topic);
      else selectionCtx.selectedNames.delete(topic);
      selectionCtx.onChange();
    });
  }

  const button = document.createElement("button");
  button.className = "accordion-button collapsed";
  button.type = "button";
  button.setAttribute("data-bs-toggle", "collapse");
  button.setAttribute("data-bs-target", "#" + itemId);
  button.textContent = topic;

  const stats = computeStats(flattenQuestions(subTopics));
  const badgeHolder = document.createElement("span");
  badgeHolder.className = "badge-holder";
  badgeHolder.appendChild(createBadges(stats));
  button.appendChild(badgeHolder);
  state.badgeRefs["T|" + subject + "|" + topic] = { holder: badgeHolder, node: subTopics };

  const editTopicBtn = document.createElement("span");
  editTopicBtn.className = "tree-edit-btn";
  editTopicBtn.title = "Rename Topic";
  editTopicBtn.textContent = "✎";
  editTopicBtn.addEventListener("click", () => promptRename("Topic", topic, newName => renameTopic(subject, topic, newName)));
  const copyTopicPlainBtn = createPlainCopyButton(() => subTopics);
  const copyTopicBtn = createCopyQuestionsButton(() => subTopics, "topic", topic);
  const copyTopicHierarchyBtn = createHierarchyCopyButton(() => subTopics, "topic", topic);
  const copyTopicStructureAnswerBtn = createStructureWithAnswerCopyButton(() => subTopics, "topic", topic);
  const copyTopicStructureBtn = createStructureCopyButton(() => subTopics, "topic", topic);

  const deleteTopicBtn = document.createElement("span");
  deleteTopicBtn.className = "tree-delete-btn";
  deleteTopicBtn.title = "Delete Topic";
  const deleteTopicIcon = document.createElement("i");
  deleteTopicIcon.className = "fa-solid fa-trash";
  deleteTopicBtn.appendChild(deleteTopicIcon);
  deleteTopicBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Requirement: a non-empty Topic can't be deleted from here — no cascading data loss.
    const qCount = flattenQuestions(subTopics).length;
    if (qCount > 0) {
      alert('Cannot delete Topic "' + topic + '" — it still has ' + qCount + ' question(s) under it. Move or delete them first.');
      return;
    }
    if (!confirm('Delete empty Topic "' + topic + '"?')) return;
    deleteTopicGroup(subject, topic);
  });

  header.appendChild(dragHandle);
  if (selectCheckbox) header.appendChild(selectCheckbox);
  header.appendChild(button);
  header.appendChild(editTopicBtn);

  header.appendChild(copyTopicPlainBtn);
  header.appendChild(copyTopicStructureAnswerBtn);
  header.appendChild(copyTopicBtn);
  header.appendChild(copyTopicStructureBtn);
  header.appendChild(copyTopicHierarchyBtn);

  header.appendChild(deleteTopicBtn);
  item.appendChild(header);

  const collapse = document.createElement("div");
  collapse.id = itemId;
  collapse.className = "accordion-collapse collapse";
  collapse.setAttribute("data-bs-parent", "#" + parentId);

  const body = document.createElement("div");
  body.className = "accordion-body";

  const subTopicAccordionId = uid("subTopicAcc");
  const subTopicAccordion = document.createElement("div");
  subTopicAccordion.className = "accordion";
  subTopicAccordion.id = subTopicAccordionId;

  // Requirement: Universal Selection Controls — select 1+ SubTopics under this Topic, then bulk
  // delete the empty ones. Same shape as createSubject()'s topicSelectionUI, one level down.
  const subTopicSelectionUI = createGroupSelectionUI(
    "SubTopic",
    () => subTopicAccordion.querySelectorAll(".subtopic-select-checkbox"),
    name => !state.rawData.some(r => r.Subject === subject && r.Topic === topic && r.SubTopic === name),
    names => bulkDeleteSubTopics(subject, topic, names)
  );
  const subTopicSelectionCtx = { selectedNames: subTopicSelectionUI.selectedNames, onChange: subTopicSelectionUI.updateBulkBar };

  const subTopicKeys = Object.keys(subTopics);
  const subTopicTargetIdx = state.expandDirection === "last" ? subTopicKeys.length - 1 : 0;

  subTopicKeys.forEach((subTopic, i) => {
    const childIsTarget = isTarget && i === subTopicTargetIdx;
    const subTopicItem = createSubTopic(subject, topic, subTopic, subTopics[subTopic], subTopicAccordionId, childIsTarget, subTopicSelectionCtx);
    subTopicAccordion.appendChild(subTopicItem);
  });

  // Requirement: "+ Add New SubTopic", "+ Bulk Add New SubTopics", and Select share one row.
  const subTopicControlsRow = document.createElement("div");
  subTopicControlsRow.className = "d-flex align-items-start flex-wrap gap-2 mb-2 quick-add-row";
  subTopicControlsRow.appendChild(createQuickAddButton("+ Add New SubTopic", () => quickAddSubTopic(subject, topic)));
  subTopicControlsRow.appendChild(createBulkAddGroupButton(
    "+ Bulk Add New SubTopics",
    "One row per line, tab-separated: SubTopic [Question] [Answer]. Trailing fields are optional.",
    rawText => bulkAddHierarchy(subject, topic, rawText),
    "subtopic",
    "SubTopic\tQuestion\tAnswer"
  ));
  subTopicControlsRow.appendChild(subTopicSelectionUI.selectToggleBtn);
  subTopicControlsRow.appendChild(subTopicSelectionUI.selectAllBtn);
  body.appendChild(subTopicControlsRow);
  body.appendChild(subTopicSelectionUI.bulkBar);
  subTopicSelectionUI.selectToggleBtn.addEventListener("click", () => subTopicSelectionUI.toggleSelectingOn(item));
  body.appendChild(subTopicAccordion);
  collapse.appendChild(body);
  item.appendChild(collapse);

  // Requirement: clicking a Topic accordion always drills into its first SubTopic -> first
  // Question, same as clicking a Subject drills into its first Topic. Mirrors the listener
  // in createSubject; only reacts to this exact collapse (not a nested one) firing.
  collapse.addEventListener("shown.bs.collapse", e => {
    if (e.target !== collapse) return;
    autoExpandFirstDescendant(subTopicAccordion);
  });

  if (isTarget) expandItem(button, collapse);

  // drag-to-reorder: reorder SubTopics within this Topic
  Sortable.create(subTopicAccordion, {
    handle: ".drag-handle",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: function () {
      const newOrder = Array.from(subTopicAccordion.children).map(el => el.dataset.subTopic);
      reorderSubTopics(subject, topic, newOrder);
    }
  });

  return item;
}

export function createAddQuestionPanel(subject, topic, subTopic, questions) {
  const wrap = document.createElement("div");
  wrap.className = "add-question-wrap mt-2";

  const toolbar = document.createElement("div");
  toolbar.className = "d-flex gap-2 mb-2";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn-sm btn-outline-primary";
  addBtn.textContent = "+ Add Question";

  const bulkBtn = document.createElement("button");
  bulkBtn.type = "button";
  bulkBtn.className = "btn btn-sm btn-outline-secondary";
  bulkBtn.textContent = "+ Bulk Add (CSV)";

  toolbar.appendChild(addBtn);
  toolbar.appendChild(bulkBtn);
  wrap.appendChild(toolbar);

  /* ---- Single add form ---- */
  const singlePanel = document.createElement("div");
  singlePanel.className = "add-question-panel";
  singlePanel.style.display = "none";

  const qInput = document.createElement("textarea");
  qInput.className = "form-control form-control-sm mb-2";
  qInput.rows = 2;
  qInput.placeholder = "Question text...";

  /* Requirement: fuzzy-duplicate hints — as the user types, surface existing questions
     (anywhere in the dataset) that share a significant word; clicking one jumps to it. */
  const fuzzyHint = document.createElement("div");
  fuzzyHint.className = "small text-muted mb-2";
  fuzzyHint.style.display = "none";

  const aInput = document.createElement("textarea");
  aInput.className = "form-control form-control-sm mb-2";
  aInput.rows = 3;
  aInput.placeholder = "Answer (HTML allowed)...";

  function renderFuzzyHint() {
    populateFuzzyHint(fuzzyHint, qInput.value, {
      jumpBack: () => {
        requestAnimationFrame(() => wrap.scrollIntoView({ behavior: "smooth", block: "center" }));
        qInput.focus();
        flashHighlightItem(wrap);
      },
      // Requirement: "Add anyway" does NOT save automatically, and doesn't just bounce back
      // to this draft either — it opens and pre-fills the TARGET question's own SubTopic's add
      // panel with this draft, so the user saves it right alongside the question they just
      // reviewed (see openSubTopicAddPanelPrefilled).
      addAnyway: targetItem => {
        const openedWrap = openSubTopicAddPanelPrefilled(targetItem, qInput.value, aInput.value);
        if (!openedWrap) return;
        requestAnimationFrame(() => openedWrap.scrollIntoView({ behavior: "smooth", block: "center" }));
        flashHighlightItem(openedWrap);
      },
      // Requirement: "Add Question After" auto-saves the draft directly after the matched
      // question, in ITS SubTopic (not this panel where the draft was typed), then jumps to it.
      addAfter: matchedQ => addQuestionAfterMatch(matchedQ, qInput.value, aInput.value, draft)
    });
  }

  qInput.addEventListener("input", renderFuzzyHint);

  const draft = { Done: false, ReviewLater: false, Duplicate: false, LessImportant: false, Starred: false };
  const iconRow = document.createElement("div");
  iconRow.className = "status-icon-row";

  let doneT, reviewT;
  doneT = createStatusIconToggle({
    key: "done", icon: "fa-solid fa-check", label: "Done", initial: false,
    onToggle: active => {
      draft.Done = active;
      if (active && reviewT.classList.contains("is-active")) {
        reviewT.classList.remove("is-active");
        reviewT.setAttribute("aria-pressed", "false");
        draft.ReviewLater = false;
      }
    }
  });
  reviewT = createStatusIconToggle({
    key: "review", icon: "fa-solid fa-clock", label: "Review Later", initial: false,
    onToggle: active => {
      draft.ReviewLater = active;
      if (active && doneT.classList.contains("is-active")) {
        doneT.classList.remove("is-active");
        doneT.setAttribute("aria-pressed", "false");
        draft.Done = false;
      }
    }
  });
  const dupT = createStatusIconToggle({ key: "duplicate", icon: "fa-solid fa-clone", label: "Duplicate", initial: false, onToggle: a => { draft.Duplicate = a; } });
  const lessT = createStatusIconToggle({ key: "less", icon: "fa-solid fa-down-long", label: "Less Important", initial: false, onToggle: a => { draft.LessImportant = a; } });
  const starT = createStatusIconToggle({ key: "star", icon: "fa-solid fa-star", label: "Starred", initial: false, onToggle: a => { draft.Starred = a; } });

  [doneT, reviewT, dupT, lessT, starT].forEach(b => iconRow.appendChild(b));

  const singleActions = document.createElement("div");
  const saveSingleBtn = document.createElement("button");
  saveSingleBtn.type = "button";
  saveSingleBtn.className = "btn btn-sm btn-success me-2";
  saveSingleBtn.textContent = "Save Question";
  const cancelSingleBtn = document.createElement("button");
  cancelSingleBtn.type = "button";
  cancelSingleBtn.className = "btn btn-sm btn-outline-secondary";
  cancelSingleBtn.textContent = "Cancel";
  singleActions.appendChild(saveSingleBtn);
  singleActions.appendChild(cancelSingleBtn);

  singlePanel.appendChild(qInput);
  singlePanel.appendChild(fuzzyHint);
  singlePanel.appendChild(aInput);
  singlePanel.appendChild(iconRow);
  singlePanel.appendChild(singleActions);

  function resetSingleForm() {
    qInput.value = "";
    aInput.value = "";
    renderFuzzyHint();
    [doneT, reviewT, dupT, lessT, starT].forEach(b => {
      b.classList.remove("is-active");
      b.setAttribute("aria-pressed", "false");
    });
    draft.Done = draft.ReviewLater = draft.Duplicate = draft.LessImportant = draft.Starred = false;
  }

  addBtn.addEventListener("click", () => {
    bulkPanel.style.display = "none";
    singlePanel.style.display = singlePanel.style.display === "none" ? "block" : "none";
  });

  cancelSingleBtn.addEventListener("click", () => {
    resetSingleForm();
    singlePanel.style.display = "none";
  });

  /* Shared save logic for both "Save Question" and "Save & Add". Returns
     { ok:true, newQ } on success, or { ok:false, reason:"empty"|"duplicate" }. */
  function trySaveQuestion(questionText, answerText) {
    const text = (questionText || "").trim();
    if (!text) return { ok: false, reason: "empty" };
    if (questionExistsIn(questions, text)) return { ok: false, reason: "duplicate" };
    const ord = getExistingOrder(subject, topic, subTopic);
    const newQ = {
      Subject: subject, Topic: topic, SubTopic: subTopic,
      Question: text, Answer: answerText || "",
      Done: draft.Done, ReviewLater: draft.ReviewLater,
      Duplicate: draft.Duplicate, LessImportant: draft.LessImportant, Starred: draft.Starred,
      // Requirement: always append at the bottom of this SubTopic's list — nextQuestionOrder()
      // reads state.rawData directly rather than trusting `questions`.length, which can be a
      // Status-filtered (shorter) subset when a filter is active.
      Order: nextQuestionOrder(subject, topic, subTopic),
      SubjectOrder: ord.subjectOrder, TopicOrder: ord.topicOrder, SubTopicOrder: ord.subTopicOrder,
      _id: uid("q")
    };
    questions.push(newQ);
    state.rawData.push(newQ);

    // Requirement: if this save was pre-filled via "Add anyway" from a specific matched
    // question, position the new question directly after that one instead of at the end.
    // Only ever applies to the FIRST save after a pre-fill — Save & Add's later prompts
    // fall through to the normal end-of-list placement.
    const insertAfterQid = singlePanel.dataset.insertAfterQid;
    if (insertAfterQid) {
      delete singlePanel.dataset.insertAfterQid;
      if (questions.some(q => q._id === insertAfterQid)) {
        const newOrderIds = idsWithInsertAfter(questions.map(q => q._id), newQ._id, insertAfterQid);
        reorderSubTopicQuestions(subject, topic, subTopic, newOrderIds);
      }
    }

    persistCurrentProgress();
    // Prunes this SubTopic's now-redundant empty-group marker (if it was one) so it doesn't
    // linger as a duplicate ghost entry once it genuinely has a question.
    state.grouped = groupData(state.rawData, state.emptyGroups);
    return { ok: true, newQ };
  }

  /* Shared by the "Save Question" button and the fuzzy-hint "Add anyway" icon (which fires
     this with whatever is currently in the form, from the target question's accordion). */
  function finishSingleSave(text, answer) {
    const result = trySaveQuestion(text, answer);
    if (!result.ok) {
      alert(result.reason === "empty" ? "Question text cannot be empty." : "This question already exists in this accordion.");
      return;
    }
    resetSingleForm();
    singlePanel.style.display = "none";
    // Requirement: adding a question shouldn't collapse whatever else was already open.
    const openState = captureOpenState();
    state.pendingFocusQid = result.newQ._id; // stay on the question we just added instead of collapsing back
    render();
    restoreOpenState(openState);
    showSubTopicAlert(subject, topic, subTopic, "success", 'Added: "' + result.newQ.Question + '"', result.newQ._id);
    flashHighlightItem(document.querySelector('[data-qid="' + result.newQ._id + '"]'));
  }

  saveSingleBtn.addEventListener("click", () => finishSingleSave(qInput.value, aInput.value));

  /* Requirement: "Save & Add" — saves the current form, then keeps prompting via
     window.prompt() for more Question/Answer pairs (same Subject/Topic/SubTopic) until the
     user cancels a prompt. */
  const saveAddBtn = document.createElement("button");
  saveAddBtn.type = "button";
  saveAddBtn.className = "btn btn-sm btn-outline-success me-2";
  saveAddBtn.textContent = "Save & Add";
  singleActions.insertBefore(saveAddBtn, cancelSingleBtn);

  saveAddBtn.addEventListener("click", () => {
    const first = trySaveQuestion(qInput.value, aInput.value);
    if (!first.ok) {
      alert(first.reason === "empty" ? "Question text cannot be empty." : "This question already exists in this accordion.");
      return;
    }
    let lastId = first.newQ._id;
    let count = 1;
    while (true) {
      const nextQuestion = prompt('Next question for "' + subject + " / " + topic + " / " + subTopic + '" (Cancel to stop):');
      if (nextQuestion === null) break;
      if (!nextQuestion.trim()) { alert("Question text cannot be empty — skipped."); continue; }
      const nextAnswer = prompt("Answer for that question (HTML allowed, optional):") || "";
      const result = trySaveQuestion(nextQuestion, nextAnswer);
      if (!result.ok) {
        alert('Already exists — skipped: "' + nextQuestion.trim() + '"');
        continue;
      }
      lastId = result.newQ._id;
      count++;
    }
    resetSingleForm();
    singlePanel.style.display = "none";
    const openState = captureOpenState();
    state.pendingFocusQid = lastId;
    render();
    restoreOpenState(openState);
    showSubTopicAlert(subject, topic, subTopic, "success", count + " question(s) added — click to view the last one", lastId);
  });

  /* ---- Bulk add form (CSV pasted into a textarea) ---- */
  const bulkPanel = document.createElement("div");
  bulkPanel.className = "add-question-panel";
  bulkPanel.style.display = "none";

  const bulkHint = document.createElement("div");
  bulkHint.className = "small text-muted mb-1";
  bulkHint.textContent = "One question per row, tab-separated: Question [Tab] Answer [Tab] Done [Tab] Review Later [Tab] Duplicate [Tab] Less Important [Tab] Starred. Paste directly from Excel/Google Sheets, or type fields separated by Tab. No header row. Answer and every status flag are optional and may be left off the end of a row — status flags accept true/false (or 1/0) and default to false (unmarked) when omitted.";

  const bulkTextarea = document.createElement("textarea");
  bulkTextarea.className = "form-control form-control-sm mb-2";
  bulkTextarea.rows = 6;
  bulkTextarea.placeholder = "question\tanswer";
  enableTabCharacterInsertion(bulkTextarea);

  const bulkTemplateLink = createBulkTemplateLink(bulkTextarea, "question\tanswer\tDone\tReview Later\tDuplicate\tLess Important\tStarred");

  const bulkActions = document.createElement("div");
  const saveBulkBtn = document.createElement("button");
  saveBulkBtn.type = "button";
  saveBulkBtn.className = "btn btn-sm btn-success me-2";
  saveBulkBtn.textContent = "Add All";
  const cancelBulkBtn = document.createElement("button");
  cancelBulkBtn.type = "button";
  cancelBulkBtn.className = "btn btn-sm btn-outline-secondary";
  cancelBulkBtn.textContent = "Cancel";
  bulkActions.appendChild(saveBulkBtn);
  bulkActions.appendChild(cancelBulkBtn);

  bulkPanel.appendChild(bulkHint);
  bulkPanel.appendChild(bulkTemplateLink);
  bulkPanel.appendChild(bulkTextarea);
  bulkPanel.appendChild(bulkActions);

  bulkBtn.addEventListener("click", () => {
    singlePanel.style.display = "none";
    bulkPanel.style.display = bulkPanel.style.display === "none" ? "block" : "none";
  });

  cancelBulkBtn.addEventListener("click", () => {
    bulkTextarea.value = "";
    bulkPanel.style.display = "none";
  });

  saveBulkBtn.addEventListener("click", () => {
    const rawText = bulkTextarea.value.trim();
    if (!rawText) {
      alert("Paste at least one CSV row first.");
      return;
    }
    const parsed = Papa.parse(rawText, { skipEmptyLines: true, delimiter: "\t" });
    if (parsed.errors && parsed.errors.length) {
      alert("Could not parse that text: " + parsed.errors[0].message);
      return;
    }
    // Requirement: bulk-added questions always append at the bottom — nextOrder starts from
    // state.rawData's real count for this SubTopic (nextQuestionOrder()), not `questions`.length,
    // which can be a Status-filtered (shorter) subset when a filter is active.
    let nextOrder = nextQuestionOrder(subject, topic, subTopic);
    let added = 0;
    let lastAddedId = null;
    const ord = getExistingOrder(subject, topic, subTopic);
    parsed.data.forEach(row => {
      const questionText = (row[0] || "").trim();
      if (!questionText) return;
      // Requirement: status flags are optional trailing columns — Done/ReviewLater/Duplicate/
      // LessImportant/Starred, in that order, tab-separated after Answer. toBool() (utils.js)
      // already treats a missing/blank column as false, which is exactly "omitted -> unmarked".
      const newQ = {
        Subject: subject, Topic: topic, SubTopic: subTopic,
        Question: questionText, Answer: row[1] || "",
        Done: toBool(row[2]), ReviewLater: toBool(row[3]), Duplicate: toBool(row[4]),
        LessImportant: toBool(row[5]), Starred: toBool(row[6]),
        Order: nextOrder++,
        SubjectOrder: ord.subjectOrder, TopicOrder: ord.topicOrder, SubTopicOrder: ord.subTopicOrder,
        _id: uid("q")
      };
      questions.push(newQ);
      state.rawData.push(newQ);
      lastAddedId = newQ._id;
      added++;
    });
    if (!added) {
      alert("No valid rows found (first column must be non-empty Question text).");
      return;
    }
    persistCurrentProgress();
    // Prunes this SubTopic's now-redundant empty-group marker (if it was one).
    state.grouped = groupData(state.rawData, state.emptyGroups);
    bulkTextarea.value = "";
    bulkPanel.style.display = "none";
    const openState = captureOpenState();
    state.pendingFocusQid = lastAddedId; // stay on the SubTopic, land on the last question added
    render();
    restoreOpenState(openState);
    showSubTopicAlert(subject, topic, subTopic, "success", added + " question(s) added — click to view the last one", lastAddedId);
  });

  wrap.appendChild(singlePanel);
  wrap.appendChild(bulkPanel);
  return wrap;
}

// Requirement: Reusable Global Selection Form — the "Change Subject/Topic/SubTopic" controls,
// built once per SubTopic (createSubTopic() below) instead of once per question. `subject`/
// `topic`/`subTopic` are this SubTopic's own identity — the "current location" every question
// inside it (individually or as part of a bulk selection) shares, and moveTargetQids (set by
// openFor()) is whichever qid(s) the caller is currently acting on. performMove() reuses
// moveQuestionsToSubTopic() (the same data function cross-SubTopic drag-and-drop uses) rather
// than duplicating the move logic a third time.
function createMoveForm(subject, topic, subTopic) {
  const moveWrapper = document.createElement("div");
  moveWrapper.style.display = "none";
  moveWrapper.className = "mb-2 p-2 border rounded";
  let moveTargetQids = [];

  // Requirement: native <select multiple> listboxes (no Select2) instead of a combo-box +
  // "+ New ..." custom-text-input — picking a value is the whole interaction, no separate Save
  // step. Options are read from state.grouped (not state.rawData), so empty Subjects/Topics/
  // SubTopics (created via the independent "+ Add New ..." flow) show up here too — the main
  // reason to move a question is often to relocate it into a hierarchy you just created empty.
  function movePickerList(labelText) {
    const wrap = document.createElement("div");
    wrap.className = "mb-2 move-picker-col";
    const lbl = document.createElement("label");
    lbl.className = "form-label small fw-bold";
    lbl.textContent = labelText;
    const select = document.createElement("select");
    select.multiple = true;
    select.size = 5;
    select.className = "form-select form-select-sm";
    wrap.appendChild(lbl);
    wrap.appendChild(select);

    function fillOptions(values, selectedValue) {
      select.textContent = "";
      values.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        if (v === selectedValue) opt.selected = true;
        select.appendChild(opt);
      });
    }

    // Only one value is ever meaningfully "selected" — the `multiple` attribute is purely for
    // the always-visible native listbox look the requirement asked for, not actual multi-pick.
    function getValue() {
      return select.selectedOptions[0] ? select.selectedOptions[0].value : null;
    }

    return { wrap, select, fillOptions, getValue };
  }

  const subjectField = movePickerList("Subject");
  const topicField = movePickerList("Topic");
  const subTopicField = movePickerList("SubTopic");

  // Requirement: persistent "+ Add New ..." buttons (Font Awesome plus icon) — always
  // available, not just when the current selection has no children, so a new Subject/Topic/
  // SubTopic can be added alongside existing ones at any time, not only as a last resort.
  // Requirement: icon-only — just the Font Awesome plus glyph, no label — title carries the
  // accessible name/tooltip since there's no visible text.
  function addNewButton(label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-outline-primary mt-1";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    return btn;
  }

  const addSubjectBtn = addNewButton("Add New Subject");
  subjectField.wrap.appendChild(addSubjectBtn);
  const addTopicBtn = addNewButton("Add New Topic");
  topicField.wrap.appendChild(addTopicBtn);
  const addSubTopicBtn = addNewButton("Add New SubTopic");
  subTopicField.wrap.appendChild(addSubTopicBtn);

  function refreshMoveTopicOptions(selectedTopic) {
    const subj = subjectField.getValue();
    const topics = (subj && state.grouped[subj]) ? Object.keys(state.grouped[subj]).sort() : [];
    topicField.fillOptions(topics, selectedTopic);
  }

  function refreshMoveSubTopicOptions(selectedSubTopic) {
    const subj = subjectField.getValue();
    const top = topicField.getValue();
    const subTopics = (subj && top && state.grouped[subj] && state.grouped[subj][top])
      ? Object.keys(state.grouped[subj][top]).sort() : [];
    subTopicField.fillOptions(subTopics, selectedSubTopic);
  }

  // Requirement: moving qid(s) is the terminal action, whether they got here by picking an
  // existing SubTopic or creating a brand-new one — both end with moveTargetQids sitting in
  // newSubject/newTopic/newSubTopic. Reuses moveQuestionsToSubTopic() (also used by cross-
  // SubTopic drag-and-drop) for the actual data mutation + persist + render + highlight.
  function performMove(newSubject, newTopic, newSubTopic) {
    if (!moveTargetQids.length) return;
    moveQuestionsToSubTopic(moveTargetQids, newSubject, newTopic, newSubTopic);
    moveWrapper.style.display = "none";
    moveTargetQids = [];
  }

  // Requirement: creates a new Topic under `subj`, selects it, and cascades the SubTopic picker
  // to match — shared by the manual "+ Add New Topic" button and maybeAutoPromptTopic() below.
  // Always ends by checking whether the (necessarily empty) new Topic needs its own SubTopic
  // auto-prompt too, so a from-scratch Subject/Topic/SubTopic chain completes in one go.
  function createTopicAndSelect(subj) {
    const newTopic = (prompt('New Topic name under "' + subj + '":') || "").trim();
    if (!newTopic) return;
    if (state.grouped[subj] && state.grouped[subj][newTopic]) {
      alert('"' + newTopic + '" already exists under "' + subj + '".');
      return;
    }
    markGroupEmpty(subj, newTopic, null);
    state.grouped = groupData(state.rawData, state.emptyGroups);
    persistCurrentProgress();
    refreshMoveTopicOptions(newTopic);
    refreshMoveSubTopicOptions(null);
    maybeAutoPromptSubTopic();
  }

  // Requirement: creating a SubTopic is always the terminal action — it's the reason this
  // prompt exists (there's nowhere else to put the question(s)), so it moves right away instead
  // of asking the user to then go pick the SubTopic it just created.
  function createSubTopicAndMove(subj, top) {
    const newSubTopic = (prompt('New SubTopic name under "' + subj + " / " + top + '":') || "").trim();
    if (!newSubTopic) return;
    if (state.grouped[subj] && state.grouped[subj][top] && state.grouped[subj][top][newSubTopic]) {
      alert('"' + newSubTopic + '" already exists under "' + subj + " / " + top + '".');
      return;
    }
    performMove(subj, top, newSubTopic);
  }

  // Requirement: auto-prompted creation — if the currently selected Subject/Topic has no
  // children at all, prompt for the missing level right away (sequential prompts, cascading
  // Topic then SubTopic) instead of leaving the user to notice and click "+ Add New ..." — that
  // button stays available too, for adding an alternative even when children already exist.
  function maybeAutoPromptTopic() {
    const subj = subjectField.getValue();
    if (!subj) return;
    const hasTopics = !!(state.grouped[subj] && Object.keys(state.grouped[subj]).length);
    if (hasTopics) return;
    createTopicAndSelect(subj);
  }

  function maybeAutoPromptSubTopic() {
    const subj = subjectField.getValue();
    const top = topicField.getValue();
    if (!subj || !top) return;
    const hasSubTopics = !!(state.grouped[subj] && state.grouped[subj][top] && Object.keys(state.grouped[subj][top]).length);
    if (hasSubTopics) return;
    createSubTopicAndMove(subj, top);
  }

  subjectField.select.addEventListener("change", () => {
    refreshMoveTopicOptions(null);
    refreshMoveSubTopicOptions(null);
    maybeAutoPromptTopic();
  });
  topicField.select.addEventListener("change", () => {
    refreshMoveSubTopicOptions(null);
    maybeAutoPromptSubTopic();
  });

  // Requirement: selecting a SubTopic is the terminal action — confirm, then move immediately.
  subTopicField.select.addEventListener("change", () => {
    const newSubject = subjectField.getValue();
    const newTopic = topicField.getValue();
    const newSubTopic = subTopicField.getValue();
    if (!newSubject || !newTopic || !newSubTopic) return;
    if (newSubject === subject && newTopic === topic && newSubTopic === subTopic) return;

    const count = moveTargetQids.length;
    const confirmed = confirm("Move " + (count === 1 ? "this question" : count + " questions") +
      ' to "' + newSubject + " / " + newTopic + " / " + newSubTopic + '"?');
    if (!confirmed) {
      refreshMoveFields(); // reselect the current location, undoing the picked option
      return;
    }
    performMove(newSubject, newTopic, newSubTopic);
  });

  addSubjectBtn.addEventListener("click", () => {
    const subj = (prompt("New Subject name:") || "").trim();
    if (!subj) return;
    if (state.grouped[subj]) {
      alert('"' + subj + '" already exists.');
      return;
    }
    markGroupEmpty(subj, null, null);
    state.grouped = groupData(state.rawData, state.emptyGroups);
    persistCurrentProgress();
    subjectField.fillOptions(Object.keys(state.grouped).sort(), subj);
    refreshMoveTopicOptions(null);
    refreshMoveSubTopicOptions(null);
    maybeAutoPromptTopic(); // the new Subject has zero Topics, so this always fires
  });

  addTopicBtn.addEventListener("click", () => {
    const subj = subjectField.getValue();
    if (!subj) { alert("Pick a Subject first."); return; }
    createTopicAndSelect(subj);
  });

  addSubTopicBtn.addEventListener("click", () => {
    const subj = subjectField.getValue();
    const top = topicField.getValue();
    if (!subj || !top) { alert("Pick a Subject and Topic first."); return; }
    createSubTopicAndMove(subj, top);
  });

  function refreshMoveFields() {
    const subjects = Object.keys(state.grouped).sort();
    subjectField.fillOptions(subjects, subject);
    refreshMoveTopicOptions(topic);
    refreshMoveSubTopicOptions(subTopic);
  }

  const moveActions = document.createElement("div");
  const moveCloseBtn = document.createElement("button");
  moveCloseBtn.type = "button";
  moveCloseBtn.className = "btn btn-sm btn-outline-secondary";
  moveCloseBtn.textContent = "Close";
  moveActions.appendChild(moveCloseBtn);

  // Requirement: Subject/Topic/SubTopic listboxes sit side by side in one row instead of
  // stacking (wraps on narrow viewports — see .move-picker-row/.move-picker-col in style.css).
  const pickerRow = document.createElement("div");
  pickerRow.className = "d-flex gap-2 move-picker-row";
  pickerRow.appendChild(subjectField.wrap);
  pickerRow.appendChild(topicField.wrap);
  pickerRow.appendChild(subTopicField.wrap);
  moveWrapper.appendChild(pickerRow);
  moveWrapper.appendChild(moveActions);

  moveCloseBtn.addEventListener("click", () => {
    moveWrapper.style.display = "none";
    moveTargetQids = [];
  });

  function openFor(qids) {
    moveTargetQids = qids;
    refreshMoveFields();
    moveWrapper.style.display = "block";
    requestAnimationFrame(() => moveWrapper.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  return { wrapper: moveWrapper, openFor };
}

export function createSubTopic(subject, topic, subTopic, questions, parentId, isTarget, groupSelectionCtx) {
  const itemId = uid("subTopic");
  const item = document.createElement("div");
  item.className = "accordion-item tree-item";
  item.dataset.subTopic = subTopic;

  const header = document.createElement("h2");
  header.className = "accordion-header";

  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.title = "Drag to reorder";
  dragHandle.textContent = "⠿";

  // Requirement: Universal Selection Controls — this SubTopic's own checkbox, controlled by its
  // parent Topic's selection UI (createTopic()). Distinct from the per-question checkbox
  // further down (.q-select-checkbox, driven by its own `selectionCtx` local below) — that one
  // selects Questions inside this SubTopic; this one selects the SubTopic itself, as seen from
  // its parent Topic. (Named `groupSelectionCtx`, not `selectionCtx`, specifically to avoid
  // colliding with that unrelated question-selection local of the same shape further down.)
  let selectCheckbox = null;
  if (groupSelectionCtx) {
    selectCheckbox = document.createElement("input");
    selectCheckbox.type = "checkbox";
    selectCheckbox.className = "form-check-input subtopic-select-checkbox";
    selectCheckbox.title = "Select for bulk delete";
    selectCheckbox.dataset.selectName = subTopic;
    selectCheckbox.checked = groupSelectionCtx.selectedNames.has(subTopic);
    selectCheckbox.addEventListener("click", e => e.stopPropagation());
    selectCheckbox.addEventListener("change", () => {
      if (selectCheckbox.checked) groupSelectionCtx.selectedNames.add(subTopic);
      else groupSelectionCtx.selectedNames.delete(subTopic);
      groupSelectionCtx.onChange();
    });
  }

  const button = document.createElement("button");
  button.className = "accordion-button collapsed";
  button.type = "button";
  button.setAttribute("data-bs-toggle", "collapse");
  button.setAttribute("data-bs-target", "#" + itemId);
  button.textContent = subTopic;

  const stats = computeStats(questions);
  const badgeHolder = document.createElement("span");
  badgeHolder.className = "badge-holder";
  badgeHolder.appendChild(createBadges(stats));
  button.appendChild(badgeHolder);
  state.badgeRefs["L|" + subject + "|" + topic + "|" + subTopic] = { holder: badgeHolder, node: questions };

  const editSubTopicBtn = document.createElement("span");
  editSubTopicBtn.className = "tree-edit-btn";
  editSubTopicBtn.title = "Rename SubTopic";
  editSubTopicBtn.textContent = "✎";
  editSubTopicBtn.addEventListener("click", () => promptRename("SubTopic", subTopic, newName => renameSubTopic(subject, topic, subTopic, newName)));
  const copySubTopicPlainBtn = createPlainCopyButton(() => questions);
  const copySubTopicBtn = createCopyQuestionsButton(() => questions, "subTopic");
  // Requirement: hierarchy-only copy for a SubTopic has nothing beneath it except questions
  // (which this excludes by design) — so its own "hierarchy" is just its own name.
  const copySubTopicHierarchyBtn = createHierarchyCopyButton(() => questions, "subTopic", subTopic);
  const copySubTopicStructureAnswerBtn = createStructureWithAnswerCopyButton(() => questions, "subTopic", subTopic);
  const copySubTopicStructureBtn = createStructureCopyButton(() => questions, "subTopic", subTopic);

  const deleteSubTopicBtn = document.createElement("span");
  deleteSubTopicBtn.className = "tree-delete-btn";
  deleteSubTopicBtn.title = "Delete SubTopic";
  const deleteSubTopicIcon = document.createElement("i");
  deleteSubTopicIcon.className = "fa-solid fa-trash";
  deleteSubTopicBtn.appendChild(deleteSubTopicIcon);
  deleteSubTopicBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Requirement: a non-empty SubTopic can't be deleted from here — no cascading data loss.
    if (questions.length > 0) {
      alert('Cannot delete SubTopic "' + subTopic + '" — it still has ' + questions.length + ' question(s) under it. Move or delete them first.');
      return;
    }
    if (!confirm('Delete empty SubTopic "' + subTopic + '"?')) return;
    deleteSubTopicGroup(subject, topic, subTopic);
  });

  header.appendChild(dragHandle);
  if (selectCheckbox) header.appendChild(selectCheckbox);
  header.appendChild(button);
  header.appendChild(editSubTopicBtn);

  header.appendChild(copySubTopicPlainBtn);
  header.appendChild(copySubTopicStructureAnswerBtn);
  // header.appendChild(copySubTopicBtn);
  header.appendChild(copySubTopicStructureBtn);
  // header.appendChild(copySubTopicHierarchyBtn);

  header.appendChild(deleteSubTopicBtn);
  item.appendChild(header);

  // Requirement: a SubTopic header is a drop target regardless of open/collapsed state — it's
  // the one element that's always laid out/visible, unlike the (possibly hidden) question list
  // in .accordion-body. Detection itself is centralized (hitTestDropHeader() et al., top of this
  // file) rather than per-header listeners — see that comment for why.
  //
  // The highlight itself has to be a separate absolutely-positioned overlay, not a class/outline
  // on the header directly — the header's own children (drag handle, edit/copy buttons, the
  // accordion-button) are in-flow and each paint their own opaque background edge-to-edge, which
  // would paint right over an outline/border applied to the header itself, leaving only slivers
  // visible. Same problem flashHighlightItem() already solves in fuzzyHints.js, same fix: an
  // absolutely-positioned sibling covering the whole header, above everything (.accordion-header
  // already has position:relative — see style.css).
  const dropHighlight = document.createElement("div");
  dropHighlight.className = "drop-target-highlight";
  header.appendChild(dropHighlight);

  const collapse = document.createElement("div");
  collapse.id = itemId;
  collapse.className = "accordion-collapse collapse";
  // Requirement: deliberately NOT `data-bs-parent`-linked to the sibling SubTopics (unlike
  // Subject/Topic, which stay strict one-open accordions). Cross-SubTopic drag-and-drop needs
  // two SubTopics' question lists visible at once to drag between — with data-bs-parent,
  // opening one SubTopic auto-collapses the other via Bootstrap's accordion behavior, making
  // the destination list invisible (and thus undroppable) the whole time.

  const body = document.createElement("div");
  body.className = "accordion-body";

  const addQuestionWrap = createAddQuestionPanel(subject, topic, subTopic, questions);

  // Requirement: bulk selection — a "Select" link next to "+ Add Question"/"+ Bulk Add (CSV)"
  // toggles a checkbox on every question below (CSS: [data-sub-topic].selecting), and a bulk
  // drag-handle bar appears once 1+ are checked, for moving them all in one drag (see the header
  // drop zone above, and the bulk handle's dragstart below — same draggingQids/draggingSourceKey
  // plumbing as a single-question drag).
  const selectedQids = new Set();
  const addQuestionToolbar = addQuestionWrap.querySelector(":scope > .d-flex.gap-2.mb-2");
  const selectToggleBtn = document.createElement("button");
  selectToggleBtn.type = "button";
  selectToggleBtn.className = "btn btn-sm btn-outline-secondary select-toggle-btn";
  selectToggleBtn.textContent = "Select";
  const selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button";
  selectAllBtn.className = "btn btn-sm btn-outline-secondary select-toggle-btn";
  selectAllBtn.textContent = "Select All";
  selectAllBtn.style.display = "none"; // only useful once selection mode is on
  if (addQuestionToolbar) {
    addQuestionToolbar.appendChild(selectToggleBtn);
    addQuestionToolbar.appendChild(selectAllBtn);
  }
  body.appendChild(addQuestionWrap);

  const bulkBar = document.createElement("div");
  bulkBar.className = "bulk-move-bar";
  bulkBar.style.display = "none";

  const bulkBarHandle = document.createElement("span");
  bulkBarHandle.className = "drag-handle bulk-drag-handle";
  bulkBarHandle.title = "Drag the selected questions to another SubTopic (open or collapsed)";
  bulkBarHandle.textContent = "⠿";

  const bulkBarLabel = document.createElement("span");
  bulkBarLabel.className = "bulk-move-label";

  // Requirement: quick-action icon buttons — toggle every checked question's own Done/Review
  // Later/Duplicate/Less Important flag in one click, without opening the move form or dragging.
  // Same icon markup/classes as the per-question status-icon toggles (createStatusIconToggle
  // above) so they read as the same action, just applied in bulk (see bulkToggleQuestionStatus()).
  function createBulkStatusQuickAction(key, icon, label, field) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "status-icon-btn icon-" + key + " compact";
    btn.title = "Toggle " + label;
    btn.setAttribute("aria-label", "Toggle " + label + " for selected");
    const glyph = document.createElement("span");
    glyph.className = "icon-glyph";
    const glyphIcon = document.createElement("i");
    glyphIcon.className = icon;
    glyph.appendChild(glyphIcon);
    btn.appendChild(glyph);
    btn.addEventListener("click", () => bulkToggleQuestionStatus([...selectedQids], field, label));
    return btn;
  }

  const bulkQuickActions = document.createElement("div");
  bulkQuickActions.className = "status-icon-row compact";
  [
    createBulkStatusQuickAction("done", "fa-solid fa-check", "Done", "Done"),
    createBulkStatusQuickAction("review", "fa-solid fa-clock", "Review Later", "ReviewLater"),
    createBulkStatusQuickAction("duplicate", "fa-solid fa-clone", "Duplicate", "Duplicate"),
    createBulkStatusQuickAction("less", "fa-solid fa-down-long", "Less Important", "LessImportant")
  ].forEach(btn => bulkQuickActions.appendChild(btn));

  // Requirement: "Move Selected" opens the shared Change Subject/Topic/SubTopic form (below)
  // pre-loaded with every checked question, as an alternative to dragging bulkBarHandle. Icon
  // matches the per-question moveIconBtn (icon-move / fa-right-left) exactly.
  const bulkBarMove = document.createElement("button");
  bulkBarMove.type = "button";
  bulkBarMove.className = "status-icon-btn icon-move compact";
  bulkBarMove.title = "Move Selected";
  bulkBarMove.setAttribute("aria-label", "Move Selected");
  const bulkBarMoveGlyph = document.createElement("span");
  bulkBarMoveGlyph.className = "icon-glyph";
  const bulkBarMoveIcon = document.createElement("i");
  bulkBarMoveIcon.className = "fa-solid fa-right-left";
  bulkBarMoveGlyph.appendChild(bulkBarMoveIcon);
  bulkBarMove.appendChild(bulkBarMoveGlyph);

  // Requirement: "Delete Selected" next to "Clear" — bulk-deletes every currently checked
  // question in one click (confirm first). Icon matches the per-question deleteBtn exactly.
  const bulkBarDelete = document.createElement("button");
  bulkBarDelete.type = "button";
  bulkBarDelete.className = "status-icon-btn icon-delete compact";
  bulkBarDelete.title = "Delete Selected";
  bulkBarDelete.setAttribute("aria-label", "Delete Selected");
  const bulkBarDeleteGlyph = document.createElement("span");
  bulkBarDeleteGlyph.className = "icon-glyph";
  const bulkBarDeleteIcon = document.createElement("i");
  bulkBarDeleteIcon.className = "fa-solid fa-trash";
  bulkBarDeleteGlyph.appendChild(bulkBarDeleteIcon);
  bulkBarDelete.appendChild(bulkBarDeleteGlyph);

  // Requirement: pulled to the far right of the bar, away from the other actions, since
  // "clear the selection" is a lower-stakes, unrelated action from the status/move/delete ones.
  const bulkBarClear = document.createElement("button");
  bulkBarClear.type = "button";
  bulkBarClear.className = "status-icon-btn compact";
  bulkBarClear.style.marginLeft = "auto";
  bulkBarClear.title = "Clear";
  bulkBarClear.setAttribute("aria-label", "Clear selection");
  const bulkBarClearGlyph = document.createElement("span");
  bulkBarClearGlyph.className = "icon-glyph";
  const bulkBarClearIcon = document.createElement("i");
  bulkBarClearIcon.className = "fa-regular fa-circle-xmark";
  bulkBarClearGlyph.appendChild(bulkBarClearIcon);
  bulkBarClear.appendChild(bulkBarClearGlyph);

  bulkBar.appendChild(bulkBarHandle);
  bulkBar.appendChild(bulkBarLabel);
  bulkBar.appendChild(bulkBarMove);
  bulkBar.appendChild(bulkQuickActions);
  bulkBar.appendChild(bulkBarDelete);
  bulkBar.appendChild(bulkBarClear);
  body.appendChild(bulkBar);

  function updateBulkBar() {
    const count = selectedQids.size;
    bulkBar.style.display = count ? "flex" : "none";
    bulkBarLabel.textContent = count + " question" + (count === 1 ? "" : "s") + " selected";
  }

  function clearSelection() {
    selectedQids.clear();
    questionAccordion.querySelectorAll(".q-select-checkbox").forEach(cb => { cb.checked = false; });
    updateBulkBar();
  }

  selectToggleBtn.addEventListener("click", () => {
    const selecting = !item.classList.contains("selecting");
    item.classList.toggle("selecting", selecting);
    selectToggleBtn.textContent = selecting ? "Done Selecting" : "Select";
    selectAllBtn.style.display = selecting ? "" : "none";
    if (!selecting) clearSelection();
  });
  bulkBarClear.addEventListener("click", clearSelection);
  bulkBarDelete.addEventListener("click", () => {
    const count = selectedQids.size;
    if (!count) return;
    if (!confirm("Delete " + count + " selected question(s)? This cannot be undone.")) return;
    bulkDeleteQuestions([...selectedQids]);
  });

  // Requirement: "Select All" next to "Select" — checks every question currently in this
  // SubTopic in one click, instead of clicking each checkbox individually.
  selectAllBtn.addEventListener("click", () => {
    questionAccordion.querySelectorAll(".q-select-checkbox").forEach(cb => {
      cb.checked = true;
      selectedQids.add(cb.closest(".q-item").dataset.qid);
    });
    updateBulkBar();
  });

  // Requirement: moving the whole bulk selection at once, dragged via this one handle — a plain
  // mousedown/mousemove/mouseup gesture (not native draggable/dragstart) driving the same
  // hitTestDropHeader() mechanism a single question's Sortable drag uses, so it works the same
  // way onto an open OR collapsed destination SubTopic.
  bulkBarHandle.addEventListener("mousedown", e => {
    if (!selectedQids.size) return;
    e.preventDefault();
    draggingQids = [...selectedQids];
    draggingSourceKey = subject + "|" + topic;
    startHeaderDropTracking();
    const onUp = () => {
      finishDragIfHoveringHeader();
      draggingQids = [];
      draggingSourceKey = null;
      stopHeaderDropTracking();
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mouseup", onUp);
  });

  const subTopicAlertHolder = document.createElement("div");
  subTopicAlertHolder.className = "subtopic-alert-holder";
  subTopicAlertHolder.dataset.subTopicAlertKey = subTopicAlertKey(subject, topic, subTopic);
  body.appendChild(subTopicAlertHolder);

  // Requirement: Reusable Global Selection Form — one shared "Change Subject/Topic/SubTopic"
  // form per SubTopic, positioned above #qAcc-* (the question accordion just below), instead of
  // every question privately building its own copy. Every question in this SubTopic shares the
  // same "current location" to move *from*, so one instance covers both a single question (its
  // own moveIconBtn, passed openMoveForm below) and the whole bulk selection (bulkBarMove above).
  const moveForm = createMoveForm(subject, topic, subTopic);
  body.appendChild(moveForm.wrapper);
  bulkBarMove.addEventListener("click", () => {
    if (!selectedQids.size) return;
    moveForm.openFor([...selectedQids]);
  });

  const questionAccordionId = uid("qAcc");
  const questionAccordion = document.createElement("div");
  questionAccordion.className = "accordion";
  questionAccordion.id = questionAccordionId;

  const selectionCtx = { selectedQids, onChange: updateBulkBar };
  questions.forEach((q, idx) => {
    // Auto-expand only ever reaches Subject/Topic/SubTopic — the question's own answer body
    // is never auto-opened, so isTarget is always false here.
    const qItem = createQuestion(q, questionAccordionId, false, selectionCtx, qids => moveForm.openFor(qids));
    const idxSpan = qItem.querySelector(":scope > .accordion-header .q-index");
    if (idxSpan) idxSpan.textContent = (idx + 1) + ".";
    questionAccordion.appendChild(qItem);
  });

  body.appendChild(questionAccordion);
  collapse.appendChild(body);
  item.appendChild(collapse);

  if (isTarget) expandItem(button, collapse);

  // drag-to-reorder: only the ⠿ handle initiates a drag; dropping rewrites Order and persists it
  // Requirement: a question accordion can be dragged into a different SubTopic within the same
  // Subject and Topic. `group` is shared by every SubTopic's questionAccordion under this same
  // Topic (parentId is that Topic's own subTopicAccordionId, so it's unique per Subject+Topic
  // and never collides across a different Topic/Subject) — that's what scopes cross-list drops
  // to siblings only. onUpdate fires for a plain same-list reorder; onAdd fires (once, on the
  // destination list only) when an item is dropped in from a different (open) SubTopic's list —
  // onStart/onEnd track draggingQids/draggingSourceKey so the header drop zone above also works
  // for a collapsed destination.
  Sortable.create(questionAccordion, {
    handle: ".drag-handle",
    group: "questions-" + parentId,
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onStart: function (evt) {
      draggingQids = [evt.item.dataset.qid];
      draggingSourceKey = subject + "|" + topic;
      startHeaderDropTracking();
    },
    // Belt-and-suspenders with the document-level listeners from startHeaderDropTracking():
    // onMove is SortableJS's own per-move callback, fired from its internal drag tracking
    // (native dragover or its pointer-based fallback, whichever this drag is actually using) —
    // so hit-testing here doesn't depend on assuming which one that is. Returning `undefined`
    // (not false) leaves SortableJS's own same/cross-list handling untouched.
    onMove: function (evt, originalEvent) {
      const src = evt.originalEvent || originalEvent;
      if (src) hitTestDropHeader(src.clientX, src.clientY);
    },
    // onEnd fires after onAdd/onUpdate above, once the drag concludes either way. If it landed
    // on a header (not a Sortable-tracked list — onAdd/onUpdate already handle those), finish it
    // here instead; dragHoverTarget is only ever set while hovering a header, so this can never
    // double-move a question onAdd/onUpdate already placed.
    onEnd: function () {
      finishDragIfHoveringHeader();
      draggingQids = [];
      draggingSourceKey = null;
      stopHeaderDropTracking();
    },
    onUpdate: function (evt) {
      const newOrderIds = Array.from(questionAccordion.children).map(el => el.dataset.qid);
      reorderSubTopicQuestions(subject, topic, subTopic, newOrderIds);
      renumberQuestionAccordion(questionAccordion);
      flashHighlightItem(evt.item); // sustained flash highlight (with dismiss) for the dropped question
    },
    onAdd: function (evt) {
      const newOrderIds = Array.from(questionAccordion.children).map(el => el.dataset.qid);
      moveQuestionToSubTopic(evt.item.dataset.qid, subject, topic, subTopic, newOrderIds);
    }
  });

  return item;
}

// Requirement: dragging a question accordion into a different SubTopic (same Subject/Topic)
// updates the question's SubTopic placement — not just its visual position. newOrderIds is the
// drop-target SubTopic's question order exactly as the drag left it (including the dropped
// item), so the question lands right where the user dropped it, not at the end of the list.
export function moveQuestionToSubTopic(qid, subject, topic, newSubTopic, newOrderIds) {
  const q = state.rawData.find(r => r._id === qid);
  if (!q) return;
  const oldSubTopic = q.SubTopic;
  if (oldSubTopic === newSubTopic) return;

  const openState = captureOpenState();
  const ord = getExistingOrder(subject, topic, newSubTopic);
  q.Subject = subject;
  q.Topic = topic;
  q.SubTopic = newSubTopic;
  q.SubjectOrder = ord.subjectOrder;
  q.TopicOrder = ord.topicOrder;
  q.SubTopicOrder = ord.subTopicOrder;

  // The SubTopic this question just left may now be empty — keep its header around instead of
  // letting it vanish from the tree (markGroupEmpty() is a no-op if it still has other rows).
  markGroupEmpty(subject, topic, oldSubTopic);

  state.grouped = groupData(state.rawData, state.emptyGroups);
  reorderSubTopicQuestions(subject, topic, newSubTopic, newOrderIds);
  persistCurrentProgress();
  refreshFilterOptions();
  state.pendingFocusQid = q._id;
  render();
  restoreOpenState(openState);
  highlightMovedQuestion(q._id);
}

// Requirement: drop target for a SubTopic HEADER (see wiring in createSubTopic()) — used for a
// single question dropped outside its destination's visible list (i.e. the SubTopic is
// collapsed) and for a bulk-selected batch, which has no single-list drop position to begin
// with. Unlike moveQuestionToSubTopic(), there's no drag-observed order to honor — each moved
// question is just appended after the destination's existing questions.
export function moveQuestionsToSubTopic(qids, subject, topic, newSubTopic) {
  const openState = captureOpenState();
  const movedIds = [];
  qids.forEach(qid => {
    const q = state.rawData.find(r => r._id === qid);
    if (!q || (q.Subject === subject && q.Topic === topic && q.SubTopic === newSubTopic)) return;
    const oldSubject = q.Subject, oldTopic = q.Topic, oldSubTopic = q.SubTopic;
    const ord = getExistingOrder(subject, topic, newSubTopic);
    const siblingCount = state.rawData.filter(r => r.Subject === subject && r.Topic === topic && r.SubTopic === newSubTopic).length;
    q.Subject = subject;
    q.Topic = topic;
    q.SubTopic = newSubTopic;
    q.Order = siblingCount;
    q.SubjectOrder = ord.subjectOrder;
    q.TopicOrder = ord.topicOrder;
    q.SubTopicOrder = ord.subTopicOrder;
    markGroupEmpty(oldSubject, oldTopic, oldSubTopic);
    movedIds.push(q._id);
  });
  if (!movedIds.length) return;

  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  state.pendingFocusQid = movedIds[movedIds.length - 1];
  render();
  restoreOpenState(openState);
  showSuccessAlert(movedIds.length + ' question(s) moved to "' + subject + " / " + topic + " / " + newSubTopic + '".');
  highlightMovedQuestion(movedIds[movedIds.length - 1]);
}

export function createStatusIconToggle(opts) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "status-icon-btn icon-" + opts.key + (opts.compact ? " compact" : "") + (opts.initial ? " is-active" : "");
  btn.title = opts.label;
  btn.setAttribute("aria-label", opts.label);
  btn.setAttribute("aria-pressed", opts.initial ? "true" : "false");

  const glyph = document.createElement("span");
  glyph.className = "icon-glyph";
  const glyphIcon = document.createElement("i");
  glyphIcon.className = opts.icon;
  glyph.appendChild(glyphIcon);
  btn.appendChild(glyph);

  if (!opts.compact) {
    const cap = document.createElement("span");
    cap.className = "icon-label";
    cap.textContent = opts.label;
    btn.appendChild(cap);
  }

  btn.addEventListener("click", () => {
    const active = !btn.classList.contains("is-active");
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
    opts.onToggle(active, btn);
  });

  return btn;
}

export function createQuestion(q, parentId, isTarget, selectionCtx, openMoveForm) {
  const itemId = uid("question");
  const item = document.createElement("div");
  item.className = "accordion-item q-item";
  item.dataset.qid = q._id;
  applyStatusClass(item, q);

  const header = document.createElement("h2");
  header.className = "accordion-header d-flex align-items-stretch";

  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.title = "Drag to reorder";
  dragHandle.textContent = "⠿";

  // Requirement: bulk-select checkbox for "move several questions at once" — hidden by CSS
  // ([data-sub-topic].selecting .q-select-checkbox) until the SubTopic's "Select" toggle
  // (createSubTopic()) turns selection mode on. selectionCtx is only passed by createSubTopic().
  let selectCheckbox = null;
  if (selectionCtx) {
    selectCheckbox = document.createElement("input");
    selectCheckbox.type = "checkbox";
    selectCheckbox.className = "form-check-input q-select-checkbox";
    selectCheckbox.title = "Select for bulk move";
    selectCheckbox.checked = selectionCtx.selectedQids.has(q._id);
    selectCheckbox.addEventListener("click", e => e.stopPropagation()); // don't also toggle the accordion
    selectCheckbox.addEventListener("change", () => {
      if (selectCheckbox.checked) selectionCtx.selectedQids.add(q._id);
      else selectionCtx.selectedQids.delete(q._id);
      selectionCtx.onChange();
    });
  }

  // Requirement: this button deliberately has NO data-bs-toggle/data-bs-target — see the
  // qText click listener below for why.
  const button = document.createElement("button");
  button.className = "accordion-button collapsed";
  button.type = "button";

  const indexSpan = document.createElement("span");
  indexSpan.className = "q-index";
  button.appendChild(indexSpan);

  const warnIcon = document.createElement("span");
  // warnIcon.className = "ms-2";
  warnIcon.title = "No answer provided yet";
  warnIcon.textContent = "⚠️";
  warnIcon.style.display = (q.Answer && q.Answer.trim()) ? "none" : "inline";
  button.appendChild(warnIcon);

  // Requirement: collapse/expand is triggered by clicks on the question text only — everywhere
  // else in the header (index number, warning icon, empty background space) must NOT toggle it.
  // qText is styled as a plain-looking link (.q-text-link, style.css: inherits color, underlines
  // only on hover) to signal it's the clickable part, without being an actual navigating <a href>.
  //
  // A plain e.stopPropagation() on `button` for non-text clicks does NOT work here: Bootstrap 5's
  // data-api collapse toggle is registered on `document` with the native addEventListener capture
  // flag set to true (EventHandler.on()'s delegated/selector listeners pass `isDelegated` straight
  // through as that third "useCapture" argument), so it fires during the CAPTURE phase — before a
  // bubble-phase stopPropagation on any descendant, including `button` itself, ever runs. Beating
  // a document-level capture listener from below it in the tree is structurally impossible.
  // Instead of fighting that, `button` simply carries no data-bs-toggle/data-bs-target at all, so
  // Bootstrap's data-api never matches it for ANY click, anywhere in this row. qText's own click
  // handler below drives the real bootstrap.Collapse instance directly (getOrCreateInstance().
  // toggle()) — same sliding-animation behavior, since that's a property of the Collapse instance
  // acting on `collapse` (and still reads its `data-bs-parent` for "close my SubTopic siblings"),
  // not of the data-api wiring — and keeps `button`'s own `.collapsed`/aria-expanded in sync by
  // hand since Bootstrap no longer auto-manages them without a data-bs-toggle trigger element.
  const qText = document.createElement("a");
  qText.className = "q-text-link";
  qText.textContent = q.Question;
  qText.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = collapse.classList.contains("show");
    bootstrap.Collapse.getOrCreateInstance(collapse).toggle();
    button.classList.toggle("collapsed", wasOpen);
    button.setAttribute("aria-expanded", String(!wasOpen));
  });
  button.appendChild(qText);

  // Requirement: "Copy question" and "Copy (+Subject/Topic) & search" sit immediately after the
  // question text itself, inside the accordion-button, instead of pinned to the header's far
  // right edge — the accordion-button flex-grows to fill the row (.q-item .accordion-button in
  // style.css), so anything appended as a header-level sibling instead lands far from short
  // question text. Both are <span>s, not <button>s (nesting a real <button> inside this
  // accordion-button would be invalid HTML), and each stops its click from bubbling so it doesn't
  // also toggle the accordion open/closed. Wrapped in a "status-icon-row compact" span so the
  // compact icon-glyph sizing/spacing (style.css, scoped to that ancestor class pair) still
  // applies despite living inside the button rather than in controlsEnd alongside its siblings.
  const qInlineActions = document.createElement("span");
  qInlineActions.className = "status-icon-row compact ms-2";

  const copyQuestionBtn = document.createElement("span");
  copyQuestionBtn.className = "status-icon-btn icon-copy compact";
  copyQuestionBtn.title = "Copy question text";
  copyQuestionBtn.setAttribute("aria-label", "Copy question text");
  const copyGlyph = document.createElement("span");
  copyGlyph.className = "icon-glyph";
  const copyGlyphIcon = document.createElement("i");
  copyGlyphIcon.className = "fa-solid fa-copy";
  copyGlyph.appendChild(copyGlyphIcon);
  copyQuestionBtn.appendChild(copyGlyph);
  copyQuestionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyQuestionOnly(q);
  });
  qInlineActions.appendChild(copyQuestionBtn);

  const searchBtn = document.createElement("span");
  searchBtn.className = "status-icon-btn icon-search compact";
  searchBtn.title = "Copy question (with Subject & Topic) and search on Google";
  searchBtn.setAttribute("aria-label", "Copy and search question on Google");
  const searchGlyph = document.createElement("span");
  searchGlyph.className = "icon-glyph";
  const searchGlyphIcon = document.createElement("i");
  searchGlyphIcon.className = "fa-solid fa-magnifying-glass";
  searchGlyph.appendChild(searchGlyphIcon);
  searchBtn.appendChild(searchGlyph);
  searchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyAndSearchQuestion(q);
  });
  qInlineActions.appendChild(searchBtn);

  // Requirement: a green flag icon marking the single global "Active Question" (see
  // setActiveQuestion()/clearActiveQuestion() above). Only clears — it never sets, since setting
  // is reserved for clicking empty header space (the `button` click listener below).
  const flagBtn = document.createElement("span");
  const active = isActiveQuestion(q);
  flagBtn.className = "status-icon-btn icon-flag compact" + (active ? " is-active" : "");
  flagBtn.title = active ? "Clear active question flag" : "Not the active question";
  flagBtn.setAttribute("aria-label", "Active question flag");
  const flagGlyph = document.createElement("span");
  flagGlyph.className = "icon-glyph";
  const flagGlyphIcon = document.createElement("i");
  flagGlyphIcon.className = "fa-solid fa-flag";
  flagGlyph.appendChild(flagGlyphIcon);
  flagBtn.appendChild(flagGlyph);
  flagBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isActiveQuestion(q)) clearActiveQuestion(flagBtn);
  });
  qInlineActions.appendChild(flagBtn);

  // Requirement: a "Collapse all accordions" shortcut right next to the flag icon, visible only
  // while this question is the flagged Active Question (CSS: the adjacent-sibling rule keyed off
  // flagBtn's own is-active class, style.css — no separate visibility state to keep in sync here).
  // Reuses the exact same handler as the floating #closeAllAccordionsBtn by just clicking it,
  // rather than duplicating its collapse-everything logic here.
  const collapseAllBtn = document.createElement("span");
  collapseAllBtn.className = "status-icon-btn icon-collapse-all compact";
  collapseAllBtn.title = "Collapse all accordions";
  collapseAllBtn.setAttribute("aria-label", "Collapse all accordions");
  const collapseAllGlyph = document.createElement("span");
  collapseAllGlyph.className = "icon-glyph";
  const collapseAllGlyphIcon = document.createElement("i");
  collapseAllGlyphIcon.className = "fa-solid fa-xmark";
  collapseAllGlyph.appendChild(collapseAllGlyphIcon);
  collapseAllBtn.appendChild(collapseAllGlyph);
  collapseAllBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("closeAllAccordionsBtn").click();
  });
  qInlineActions.appendChild(collapseAllBtn);

  button.appendChild(qInlineActions);

  // Requirement: clicking empty header space (anywhere in `button` besides qText, which handles
  // its own toggle above, or the inline copy/search/flag icons, which each stop their own clicks
  // from bubbling this far) sets this question as the new Active Question. Since `button` no
  // longer carries data-bs-toggle at all, there's no Bootstrap behavior left to suppress here —
  // this stopPropagation is just routine hygiene against any other ancestor listener.
  button.addEventListener("click", (e) => {
    if (qText.contains(e.target)) return;
    e.stopPropagation();
    setActiveQuestion(q, flagBtn);
  });

  /* ---- Status icon toggles: compact, icon-only, inline next to the drag handle ---- */
  const controlsStart = document.createElement("div");
  controlsStart.className = "status-icon-row compact";

  const controlsEnd = document.createElement("div");
  controlsEnd.className = "status-icon-row compact";

  const doneBtn = createStatusIconToggle({
    key: "done", icon: "fa-solid fa-check", label: "Done", initial: !!q.Done, compact: true,
    onToggle: active => {
      q.Done = active;
      if (q.Done && reviewBtn.classList.contains("is-active")) {
        reviewBtn.classList.remove("is-active");
        reviewBtn.setAttribute("aria-pressed", "false");
        q.ReviewLater = false;
      }
      applyStatusClass(item, q);
      syncBadges(q);
      persistCurrentProgress();
    }
  });

  const reviewBtn = createStatusIconToggle({
    key: "review", icon: "fa-solid fa-clock", label: "Review Later", initial: !!q.ReviewLater, compact: true,
    onToggle: active => {
      q.ReviewLater = active;
      if (q.ReviewLater && doneBtn.classList.contains("is-active")) {
        doneBtn.classList.remove("is-active");
        doneBtn.setAttribute("aria-pressed", "false");
        q.Done = false;
      }
      applyStatusClass(item, q);
      syncBadges(q);
      persistCurrentProgress();
    }
  });

  const dupBtn = createStatusIconToggle({
    key: "duplicate", icon: "fa-solid fa-clone", label: "Duplicate", initial: !!q.Duplicate, compact: true,
    onToggle: (active, btn) => {
      if (active && q.Answer && q.Answer.trim()) {
        const proceed = confirm("This question already has an answer filled in. Marking it Duplicate excludes it from the exported Progress CSV, so it could effectively be lost. Continue?");
        if (!proceed) {
          btn.classList.remove("is-active");
          btn.setAttribute("aria-pressed", "false");
          return;
        }
      }
      q.Duplicate = active;
      persistCurrentProgress();
    }
  });

  const lessBtn = createStatusIconToggle({
    key: "less", icon: "fa-solid fa-down-long", label: "Less Important", initial: !!q.LessImportant, compact: true,
    onToggle: active => {
      q.LessImportant = active;
      syncBadges(q);
      persistCurrentProgress();
      // Re-sort this SubTopic so Less Important stays at the bottom, then jump back to the
      // question (its index number will have changed) and flash it, mirroring the Starred toggle.
      state.grouped = groupData(state.rawData, state.emptyGroups);
      state.pendingFocusQid = q._id;
      render();
      highlightMovedQuestion(q._id);
    }
  });

  const starBtn = createStatusIconToggle({
    key: "star", icon: "fa-solid fa-star", label: "Starred", initial: !!q.Starred, compact: true,
    onToggle: active => {
      q.Starred = active;
      persistCurrentProgress();
      // Re-sort this SubTopic so Starred stays first, then jump back to the question
      // (its index number will have changed) and flash it so the move is obvious.
      state.grouped = groupData(state.rawData, state.emptyGroups);
      state.pendingFocusQid = q._id;
      render();
      highlightMovedQuestion(q._id);
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "status-icon-btn icon-delete compact";
  deleteBtn.title = "Delete question";
  deleteBtn.setAttribute("aria-label", "Delete question");
  const delGlyph = document.createElement("span");
  delGlyph.className = "icon-glyph";
  const delGlyphIcon = document.createElement("i");
  delGlyphIcon.className = "fa-solid fa-trash";
  delGlyph.appendChild(delGlyphIcon);
  deleteBtn.appendChild(delGlyph);
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const hasAnswer = !!(q.Answer && q.Answer.trim());
    if (hasAnswer) {
      const msg = "This question already has an answer filled in. Delete it permanently anyway?";
      if (!confirm(msg)) return;
    }
    const qText = q.Question;
    const subj = q.Subject, top = q.Topic, lvl = q.SubTopic;
    deleteQuestionById(q._id);
    const subTopicItem = expandSubTopicChain(subj, top, lvl);
    showSubTopicAlert(subj, top, lvl, "danger", 'Deleted: "' + qText + '"');
    updateHeaderBreadcrumb();
    if (subTopicItem) {
      const holder = subTopicItem.querySelector(".subtopic-alert-holder");
      requestAnimationFrame(() => {
        (holder || subTopicItem).scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  });

  controlsStart.appendChild(starBtn);

  // Requirement: the old "Change Subject/Topic/SubTopic" text button (previously buried in the
  // answer body's actions row) is now a single icon button living in the header. Its click just
  // opens the shared move form (createMoveForm(), passed in as openMoveForm) — that form now
  // lives once per SubTopic, not once per question.
  const moveIconBtn = document.createElement("button");
  moveIconBtn.type = "button";
  moveIconBtn.className = "status-icon-btn icon-move compact";
  moveIconBtn.title = "Change Subject/Topic/SubTopic";
  moveIconBtn.setAttribute("aria-label", "Change Subject/Topic/SubTopic");
  const moveGlyph = document.createElement("span");
  moveGlyph.className = "icon-glyph";
  const moveGlyphIcon = document.createElement("i");
  moveGlyphIcon.className = "fa-solid fa-right-left";
  moveGlyph.appendChild(moveGlyphIcon);
  moveIconBtn.appendChild(moveGlyph);

  // Requirement: sleeker header — group the "editing status" toggles into one pill-shaped
  // cluster, visually separated from the destructive Delete action by a divider, instead of
  // five icons crammed shoulder-to-shoulder with equal visual weight.
  const statusCluster = document.createElement("div");
  statusCluster.className = "status-cluster";
  statusCluster.appendChild(doneBtn);
  statusCluster.appendChild(reviewBtn);
  statusCluster.appendChild(dupBtn);
  statusCluster.appendChild(lessBtn);
  controlsEnd.appendChild(moveIconBtn);
  controlsEnd.appendChild(statusCluster);
  controlsEnd.appendChild(deleteBtn);

  header.appendChild(dragHandle);
  if (selectCheckbox) header.appendChild(selectCheckbox);
  header.appendChild(controlsStart);
  header.appendChild(button);
  header.appendChild(controlsEnd);
  item.appendChild(header);

  const collapse = document.createElement("div");
  collapse.id = itemId;
  collapse.className = "accordion-collapse collapse";
  collapse.setAttribute("data-bs-parent", "#" + parentId);

  const body = document.createElement("div");
  body.className = "accordion-body answer-body";

  /* ---- Row 2: edit/move actions ---- */
  const actionsRow = document.createElement("div");
  actionsRow.className = "status-controls";

  const editQuestionBtn = document.createElement("button");
  editQuestionBtn.type = "button";
  editQuestionBtn.className = "btn btn-sm btn-outline-secondary";
  editQuestionBtn.textContent = "Edit Question";
  actionsRow.appendChild(editQuestionBtn);

  // Requirement: Edit Answer stays visible/usable regardless of Edit Mode, unlike Edit Question
  // and the move buttons above/below (still in actionsRow/.status-controls, still Edit-Mode-
  // gated) — so it lives in its own row (.answer-edit-row, style.css), deliberately never
  // touched by any body.edit-mode-off rule.
  const answerEditRow = document.createElement("div");
  answerEditRow.className = "answer-edit-row";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-sm btn-outline-primary";
  editBtn.textContent = q.Answer && q.Answer.trim() ? "Edit Answer" : "Add Answer";
  answerEditRow.appendChild(editBtn);

  const moveUpBtn = document.createElement("button");
  moveUpBtn.type = "button";
  moveUpBtn.className = "btn btn-sm btn-outline-dark";
  moveUpBtn.title = "Move up one position";
  moveUpBtn.textContent = "↑ Up";
  moveUpBtn.addEventListener("click", () => moveQuestionByStep(q, "up"));
  actionsRow.appendChild(moveUpBtn);

  const moveDownBtn = document.createElement("button");
  moveDownBtn.type = "button";
  moveDownBtn.className = "btn btn-sm btn-outline-dark";
  moveDownBtn.title = "Move down one position";
  moveDownBtn.textContent = "↓ Down";
  moveDownBtn.addEventListener("click", () => moveQuestionByStep(q, "down"));
  actionsRow.appendChild(moveDownBtn);

  const moveTopBtn = document.createElement("button");
  moveTopBtn.type = "button";
  moveTopBtn.className = "btn btn-sm btn-outline-dark";
  moveTopBtn.title = "Move to top of this SubTopic";
  moveTopBtn.textContent = "⇈ Top";
  moveTopBtn.addEventListener("click", () => moveQuestionToEdge(q, "top"));
  actionsRow.appendChild(moveTopBtn);

  const moveBottomBtn = document.createElement("button");
  moveBottomBtn.type = "button";
  moveBottomBtn.className = "btn btn-sm btn-outline-dark";
  moveBottomBtn.title = "Move to bottom of this SubTopic";
  moveBottomBtn.textContent = "⇊ Bottom";
  moveBottomBtn.addEventListener("click", () => moveQuestionToEdge(q, "bottom"));
  actionsRow.appendChild(moveBottomBtn);

  /* ---- Answer view/edit ---- */
  const answerContent = document.createElement("div");
  answerContent.innerHTML = q.Answer; // trusted HTML answer content from CSV, rendered as-is

  const editWrapper = document.createElement("div");
  editWrapper.style.display = "none";

  const textarea = document.createElement("textarea");
  textarea.className = "form-control mb-2";
  textarea.rows = 6;
  textarea.placeholder = "HTML answer content...";

  const editActions = document.createElement("div");
  editActions.className = "mb-2";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn btn-sm btn-success me-2";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-sm btn-outline-secondary";
  cancelBtn.textContent = "Cancel";

  editActions.appendChild(saveBtn);
  editActions.appendChild(cancelBtn);
  editWrapper.appendChild(textarea);
  editWrapper.appendChild(editActions);

  function enterEditMode() {
    textarea.value = q.Answer || "";
    answerContent.style.display = "none";
    editBtn.style.display = "none";
    editWrapper.style.display = "block";
    textarea.focus();
  }

  function exitEditMode() {
    editWrapper.style.display = "none";
    answerContent.style.display = "";
    editBtn.style.display = "";
  }

  editBtn.addEventListener("click", enterEditMode);

  saveBtn.addEventListener("click", () => {
    q.Answer = textarea.value;
    answerContent.innerHTML = q.Answer;
    editBtn.textContent = q.Answer && q.Answer.trim() ? "Edit Answer" : "Add Answer";
    warnIcon.style.display = (q.Answer && q.Answer.trim()) ? "none" : "inline";
    persistCurrentProgress();
    exitEditMode();
  });

  cancelBtn.addEventListener("click", exitEditMode);

  /* ---- Edit Question text ---- */
  const questionEditWrapper = document.createElement("div");
  questionEditWrapper.style.display = "none";
  questionEditWrapper.className = "mb-2";

  const questionInput = document.createElement("textarea");
  questionInput.className = "form-control mb-2";
  questionInput.rows = 2;

  const questionEditActions = document.createElement("div");
  const qSaveBtn = document.createElement("button");
  qSaveBtn.type = "button";
  qSaveBtn.className = "btn btn-sm btn-success me-2";
  qSaveBtn.textContent = "Save";
  const qCancelBtn = document.createElement("button");
  qCancelBtn.type = "button";
  qCancelBtn.className = "btn btn-sm btn-outline-secondary";
  qCancelBtn.textContent = "Cancel";
  questionEditActions.appendChild(qSaveBtn);
  questionEditActions.appendChild(qCancelBtn);
  questionEditWrapper.appendChild(questionInput);
  questionEditWrapper.appendChild(questionEditActions);

  editQuestionBtn.addEventListener("click", () => {
    questionInput.value = q.Question;
    questionEditWrapper.style.display = "block";
    questionInput.focus();
  });

  qSaveBtn.addEventListener("click", () => {
    const trimmed = questionInput.value.trim();
    if (!trimmed) {
      alert("Question text cannot be empty.");
      return;
    }
    q.Question = trimmed;
    qText.textContent = trimmed;
    persistCurrentProgress();
    questionEditWrapper.style.display = "none";
  });

  qCancelBtn.addEventListener("click", () => {
    questionEditWrapper.style.display = "none";
  });

  /* ---- Move Subject/Topic/SubTopic ---- */
  // Requirement: Reusable Global Selection Form — the picker itself now lives once per SubTopic
  // (createMoveForm(), above createSubTopic()), not once per question. This button just opens
  // it for this one question; no need to expand this question's own answer body first anymore
  // either, since the shared form lives in the SubTopic's always-visible body, not nested inside
  // any one question's collapsed section.
  moveIconBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openMoveForm([q._id]);
  });

  body.appendChild(answerContent);
  body.appendChild(answerEditRow);
  body.appendChild(actionsRow);
  body.appendChild(questionEditWrapper);
  body.appendChild(editWrapper);
  collapse.appendChild(body);
  item.appendChild(collapse);

  if (isTarget) {
    expandItem(button, collapse);
    state.scrollTargetEl = item;
  }

  return item;
}

export function applyStatusClass(item, q) {
  item.classList.remove("status-done", "status-review");
  if (q.Done) item.classList.add("status-done");
  else if (q.ReviewLater) item.classList.add("status-review");
}
