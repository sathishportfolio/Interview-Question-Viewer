/**
 * Application entry point. Loaded as `<script type="module" src="./js/app.js">` from
 * index.html — module scripts are deferred automatically, so the DOM is fully parsed by
 * the time this runs; no DOMContentLoaded wrapper is needed.
 *
 * This file is the auto-generated "everything that used to run at the top level of the
 * monolith's <script> tag" — mostly addEventListener wiring for static controls, plus a
 * few init calls. Two of these calls (watchHeaderHeight, restoreTimer) replace what used
 * to be self-invoking IIFEs in the monolith; splitting them into modules meant they had
 * to become plain exported functions, so they're called explicitly here instead, in the
 * same relative order they used to run in.
 *
 * Verify in a browser before trusting this — see README-AI.md.
 */

import { state, LS_TEMP_MODE, LS_EDIT_MODE_ON, LS_TIMER } from './state.js';
import {
  loadCSV, loadCSVFromString, getDefaultSampleCSV, downloadProgress, switchCSV, resetAllData,
  initApp
} from './api.js';
import { updateHeaderBreadcrumb } from './components/tree.js';
import { initPersistedToggle } from './components/toggles.js';
import {
  updateTimerDisplay, persistTimerIfNeeded, startTimer, watchHeaderHeight, restoreTimer
} from './components/timer.js';

// --- Event Listeners ---
// (csvInput's change listener is registered once, in the Event wiring block below.)

// "Load CSV" button: loads data.js's csvString if it's defined and non-empty,
// otherwise falls back to loading the built-in default sample question set.
document.getElementById("loadCsvStringBtn").addEventListener("click", () => {
  const hasDataJs = typeof csvString !== "undefined" && csvString && String(csvString).trim();
  if (hasDataJs) {
    loadCSVFromString(csvString, "Data_JS_Import.csv");
  } else {
    loadCSVFromString(getDefaultSampleCSV(), "sample_interview_questions.csv");
  }
});

/* ============ Event wiring ============ */
document.getElementById("csvInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) loadCSV(file);
});
document.getElementById("downloadProgressBtn").addEventListener("click", downloadProgress);
document.getElementById("csvSwitcher").addEventListener("change", e => switchCSV(e.target.value));
document.getElementById("resetAllBtn").addEventListener("click", resetAllData);
document.getElementById("tempModeToggle").addEventListener("change", e => {
  state.tempMode = e.target.checked;
  localStorage.setItem(LS_TEMP_MODE, state.tempMode);
});
/* Requirement: clear/reset the question search box and its results in one click. */
document.getElementById("questionSearchClearBtn").addEventListener("click", () => {
  const input = document.getElementById("questionSearchInput");
  const results = document.getElementById("questionSearchResults");
  if (input) { input.value = ""; input.focus(); }
  if (results) { results.textContent = ""; results.style.display = "none"; }
});

/* Requirement: #filterCard is hidden by default and toggleable via this link while Edit Mode
   is OFF. While Edit Mode is ON, CSS forces #filterCard visible regardless
   (body:not(.edit-mode-off) #filterCard, style.css) and hides this link entirely
   (body:not(.edit-mode-off) #filterCardToggleLink) since there's nothing left to toggle —
   this listener only matters, and only runs, while Edit Mode is OFF. */
document.getElementById("filterCardToggleLink").addEventListener("click", e => {
  e.preventDefault();
  const card = document.getElementById("filterCard");
  const link = e.currentTarget;
  const opening = card.style.display === "none";
  card.style.display = opening ? "block" : "none";
  link.textContent = "Filters " + (opening ? "▲" : "▾");
});

/* Icon-only floating Edit Icon toggle. Defaults to unchecked on a user's very first visit
   (no stored value yet); whatever the user leaves it at is then remembered in localStorage
   for every future session. ON shows every UI element; OFF applies what used to be Focus
   Mode's hiding (toolbar/filter/add-new cards) plus hides the editing-only affordances
   (drag handles, edit/copy/delete tree buttons, Duplicate/Move/Delete question icons) — see
   body.edit-mode-off in css/style.css. Focus Mode itself (a separate toggle) was removed;
   this is now the only visibility toggle. */
initPersistedToggle("editModeToggle", LS_EDIT_MODE_ON, checked => {
  document.body.classList.toggle("edit-mode-off", !checked);
  state.editModeOn = checked;
});

/* Requirement: floating icon that closes every currently-open Subject/Topic/SubTopic/Question
   accordion in one click. */
document.getElementById("closeAllAccordionsBtn").addEventListener("click", () => {
  document.querySelectorAll("#rootAccordion .accordion-collapse.show").forEach(collapse => {
    collapse.classList.remove("show");
    const item = collapse.parentElement;
    const btn = item && item.querySelector(":scope > .accordion-header > .accordion-button");
    if (btn) {
      btn.classList.add("collapsed");
      btn.setAttribute("aria-expanded", "false");
    }
  });
  updateHeaderBreadcrumb();
});

/* Requirement #3: Bootstrap's collapse events bubble, so one delegated listener on
   document catches every manual Subject/Topic/SubTopic accordion click (the render()-time
   calls above already cover programmatic/auto expansion, which doesn't fire these). */
document.addEventListener("shown.bs.collapse", updateHeaderBreadcrumb);
document.addEventListener("hidden.bs.collapse", updateHeaderBreadcrumb);

/* ============ Timer ============ */
// Originally a self-invoking IIFE (watchHeaderHeight) that ran at this point in the script.
watchHeaderHeight();

/* Requirement #3 (previous revision): while running, keep the elapsed count in storage so an
   accidental reload doesn't lose it. Reset clears storage and stops persisting until Start
   is pressed again. */
document.getElementById("timerStartBtn").addEventListener("click", startTimer);

document.getElementById("timerPauseBtn").addEventListener("click", () => {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
});

document.getElementById("timerResetBtn").addEventListener("click", () => {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.timerSeconds = 0;
  state.timerShouldPersist = false;
  localStorage.removeItem(LS_TIMER);
  updateTimerDisplay();
});

// Restore a persisted timer value and keep it running from where it left off.
// Originally a self-invoking IIFE (restoreTimer) that ran at this point in the script.
restoreTimer();

// Backup flush in case a tick's write gets missed right before the tab closes.
window.addEventListener("beforeunload", persistTimerIfNeeded);

initApp();
