/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state, LS_TIMER } from '../state.js';
import { formatTimer } from '../utils.js';

export function updateTimerDisplay() {
  document.getElementById("timerDisplay").textContent = formatTimer(state.timerSeconds);
}

export function syncHeaderPadding() {
  const header = document.querySelector(".app-header");
  if (!header) return;
  const rect = header.getBoundingClientRect();
  document.body.style.paddingTop = rect.height + "px";
}

export function watchHeaderHeight() {
  const header = document.querySelector(".app-header");
  if (!header) return;
  syncHeaderPadding();
  if (window.ResizeObserver) {
    new ResizeObserver(syncHeaderPadding).observe(header);
  } else {
    window.addEventListener("resize", syncHeaderPadding);
  }
}

export function persistTimerIfNeeded() {
  if (state.timerShouldPersist) localStorage.setItem(LS_TIMER, String(state.timerSeconds));
}

export function startTimer() {
  if (state.timerInterval) return;
  state.timerShouldPersist = true;
  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    updateTimerDisplay();
    persistTimerIfNeeded();
  }, 1000);
}

export function restoreTimer() {
  const stored = localStorage.getItem(LS_TIMER);
  if (stored === null) return;
  const secs = parseInt(stored, 10);
  if (!isNaN(secs) && secs >= 0) {
    state.timerSeconds = secs;
    updateTimerDisplay();
    startTimer();
  }
}
