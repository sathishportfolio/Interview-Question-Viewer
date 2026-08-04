/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state } from '../state.js';
import { persistCurrentProgress } from '../api.js';
import { refreshFilterOptions } from './filters.js';
import { render } from './tree.js';
import { groupData } from '../utils.js';

// Requirement: renaming a Subject/Topic/SubTopic also renames any matching state.emptyGroups
// marker(s) — otherwise renaming an empty group (which has zero rows for state.rawData's
// forEach above to touch) would silently do nothing to its header.
export function renameSubject(oldName, newName) {
  state.rawData.forEach(r => { if (r.Subject === oldName) r.Subject = newName; });
  state.emptyGroups.forEach(g => { if (g.Subject === oldName) g.Subject = newName; });
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
}

export function renameTopic(subject, oldName, newName) {
  state.rawData.forEach(r => { if (r.Subject === subject && r.Topic === oldName) r.Topic = newName; });
  state.emptyGroups.forEach(g => { if (g.Subject === subject && g.Topic === oldName) g.Topic = newName; });
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
}

export function renameSubTopic(subject, topic, oldName, newName) {
  state.rawData.forEach(r => { if (r.Subject === subject && r.Topic === topic && r.SubTopic === oldName) r.SubTopic = newName; });
  state.emptyGroups.forEach(g => { if (g.Subject === subject && g.Topic === topic && g.SubTopic === oldName) g.SubTopic = newName; });
  state.grouped = groupData(state.rawData, state.emptyGroups);
  persistCurrentProgress();
  refreshFilterOptions();
  render();
}

export function promptRename(kind, currentName, onRename) {
  const input = prompt("Rename " + kind + ":", currentName);
  if (input === null) return;
  const trimmed = input.trim();
  if (!trimmed || trimmed === currentName) return;
  onRename(trimmed);
}
