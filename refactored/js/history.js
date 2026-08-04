/* Global Undo/Redo — snapshot-based, covers every question-level mutation (status toggles,
 * drag-and-drop reorder/move, group reassignment, and Bulk Add/Update CSV) through one shared
 * mechanism instead of writing a bespoke inverse for each action type. Every top-level mutator in
 * components/tree.js wraps its body in withHistory(), which snapshots state.rawData/emptyGroups
 * before the wrapped function runs and pushes that snapshot onto the undo stack only if something
 * actually changed. transactionDepth lets one top-level mutator call another (e.g.
 * moveQuestionToSubTopic() calls reorderSubTopicQuestions()) without recording two history entries
 * or capturing the wrong "before" state — only the outermost withHistory() call records anything.
 *
 * Deliberately in-memory only (no localStorage) — a page refresh/reload always starts a fresh JS
 * environment, so the stacks are empty again with no extra code needed; clearHistory() (called
 * from initApp()) just keeps the Undo/Redo buttons' disabled state consistent with that.
 */
import { state } from './state.js';
import { groupData } from './utils.js';
import { persistCurrentProgress } from './api.js';
import { refreshFilterOptions } from './components/filters.js';
import { render } from './components/tree.js';

const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];
let transactionDepth = 0;
let pendingBefore = null;
let undoBtn = null;
let redoBtn = null;

function snapshotJson() {
  return JSON.stringify({ rawData: state.rawData, emptyGroups: state.emptyGroups });
}

function updateButtons() {
  if (undoBtn) undoBtn.disabled = !undoStack.length;
  if (redoBtn) redoBtn.disabled = !redoStack.length;
}

export function initHistoryButtons(uBtn, rBtn) {
  undoBtn = uBtn;
  redoBtn = rBtn;
  updateButtons();
}

export function clearHistory() {
  undoStack = [];
  redoStack = [];
  transactionDepth = 0;
  pendingBefore = null;
  updateButtons();
}

// Requirement: wrap every top-level mutating question action in withHistory(fn) so a snapshot is
// captured exactly once per user-triggered action, even when it internally calls another
// exported mutator — nesting is tracked via transactionDepth so only the outermost call records
// history. Returns whatever fn() returns, so callers that use a mutator's return value (e.g.
// bulkAddQuestionsCsv()'s {added, lastQid, lastGroup}) are unaffected.
export function withHistory(fn) {
  const isOutermost = transactionDepth === 0;
  if (isOutermost) pendingBefore = snapshotJson();
  transactionDepth++;
  try {
    return fn();
  } finally {
    transactionDepth--;
    if (isOutermost) {
      const before = pendingBefore;
      pendingBefore = null;
      if (snapshotJson() !== before) {
        undoStack.push(before);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
      }
      updateButtons();
    }
  }
}

function applySnapshot(json) {
  const snap = JSON.parse(json);
  state.rawData = snap.rawData;
  state.emptyGroups = snap.emptyGroups;
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
}

export function undo() {
  if (!undoStack.length) return;
  const current = snapshotJson();
  const prev = undoStack.pop();
  redoStack.push(current);
  applySnapshot(prev);
  updateButtons();
}

export function redo() {
  if (!redoStack.length) return;
  const current = snapshotJson();
  const next = redoStack.pop();
  undoStack.push(current);
  applySnapshot(next);
  updateButtons();
}
