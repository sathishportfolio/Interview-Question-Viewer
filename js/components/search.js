/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state } from '../state.js';
import { flashHighlightItem, renderGroupedQuestionLinks } from './fuzzyHints.js';
import { render } from './tree.js';

export function populateQuestionSearch(questionsList) {
  const wrap = document.getElementById("questionSearchWrap");
  const input = document.getElementById("questionSearchInput");
  const results = document.getElementById("questionSearchResults");
  if (!wrap || !input || !results) return;

  state.searchableQuestions = questionsList;

  if (!state.rawData.length) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";

  // A fresh filtered set may no longer match whatever was typed before this render() ran —
  // clear the box rather than leave stale results on screen.
  input.value = "";
  results.textContent = "";
  results.style.display = "none";

  input.oninput = () => runQuestionSearch(input.value, results);
}

export function runQuestionSearch(text, results) {
  const norm = (text || "").trim().toLowerCase();
  if (!norm) {
    results.textContent = "";
    results.style.display = "none";
    return;
  }
  const matches = [];
  for (const q of state.searchableQuestions) {
    const haystack = (q.Subject + " " + q.Topic + " " + q.SubTopic + " " + q.Question).toLowerCase();
    if (haystack.includes(norm)) {
      matches.push({ q, exact: q.Question.trim().toLowerCase() === norm });
      if (matches.length >= 10) break;
    }
  }
  // Requirement: clicking a result shows a "back to search" link in the target question's
  // accordion (no "add anyway" here — there's no draft question to add from a plain search).
  renderGroupedQuestionLinks(results, matches, {
    label: matches.length ? "Matching questions:" : "",
    sourceCtx: {
      jumpBackLabel: "Back to search",
      jumpBack: () => {
        const wrap = document.getElementById("questionSearchWrap");
        const input = document.getElementById("questionSearchInput");
        if (wrap) requestAnimationFrame(() => wrap.scrollIntoView({ behavior: "smooth", block: "center" }));
        if (input) input.focus();
        flashHighlightItem(wrap);
      }
    }
  });
}
