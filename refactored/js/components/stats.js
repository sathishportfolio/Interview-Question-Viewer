/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state, LS_FLAT_GROUP_VIEW, LS_DRAG_DROP_ON } from '../state.js';
import { addStatusFilterValue, clearFilters, filterGroupedData, passesFilter, removeStatusFilterValue, resetReviewDoneStarredFilters } from './filters.js';
import { showSuccessAlert } from './fuzzyHints.js';
import { render } from './tree.js';
import { flattenQuestions } from '../utils.js';

export function getVisibleGroupedTree() {
  return filterGroupedData();
}

export function copyVisibleQuestionsPlain() {
  const qs = flattenQuestions(getVisibleGroupedTree());
  if (!qs.length) { alert("No visible questions to copy."); return; }
  const text = qs.map(q => q.Question).join("\n");
  navigator.clipboard.writeText(text).then(() => {
    showSuccessAlert(qs.length + " visible question(s) copied to clipboard.");
  }).catch(() => {
    alert("Copy failed — clipboard access may be blocked by the browser.");
  });
}

export function copyVisibleQuestionsHierarchy() {
  const tree = getVisibleGroupedTree();
  const subjects = Object.keys(tree);
  if (!subjects.length) { alert("No visible questions to copy."); return; }

  const lines = [];
  let count = 0;
  subjects.forEach(subject => {
    lines.push(subject);
    Object.keys(tree[subject]).forEach(topic => {
      lines.push("\t" + topic);
      Object.keys(tree[subject][topic]).forEach(subTopic => {
        lines.push("\t\t" + subTopic);
        tree[subject][topic][subTopic].forEach(q => {
          lines.push("\t\t\t" + q.Question);
          count++;
        });
      });
    });
  });

  if (!count) { alert("No visible questions to copy."); return; }
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    showSuccessAlert(count + " visible question(s) copied (hierarchy) to clipboard.");
  }).catch(() => {
    alert("Copy failed — clipboard access may be blocked by the browser.");
  });
}

// Requirement: a "hierarchy only" export — Subject/Topic/SubTopic *names*, tab-indented, no
// Question text — the whole-tree equivalent of buildHierarchyOnlyCopyText()'s per-node buttons.
export function copyVisibleHierarchyOnly() {
  const tree = getVisibleGroupedTree();
  const subjects = Object.keys(tree);
  if (!subjects.length) { alert("No visible questions to copy."); return; }

  const lines = [];
  let count = 0;
  subjects.forEach(subject => {
    lines.push(subject);
    Object.keys(tree[subject]).forEach(topic => {
      lines.push("\t" + topic);
      count++;
      Object.keys(tree[subject][topic]).forEach(subTopic => {
        lines.push("\t\t" + subTopic);
        count++;
      });
    });
  });

  if (!count) { alert("No visible hierarchy to copy."); return; }
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    showSuccessAlert(count + " item(s) copied (hierarchy only) to clipboard.");
  }).catch(() => {
    alert("Copy failed — clipboard access may be blocked by the browser.");
  });
}

// Requirement: a "Structure with answer" export — one tab-separated row per question, each row
// carrying the question's full Subject/Topic/SubTopic path (unlike the Hierarchy export above,
// which nests/indents instead of repeating ancestors per row).
export function copyVisibleQuestionsStructureWithAnswer() {
  const tree = getVisibleGroupedTree();
  const subjects = Object.keys(tree);
  if (!subjects.length) { alert("No visible questions to copy."); return; }

  const lines = [];
  subjects.forEach(subject => {
    Object.keys(tree[subject]).forEach(topic => {
      Object.keys(tree[subject][topic]).forEach(subTopic => {
        tree[subject][topic][subTopic].forEach(q => {
          lines.push([subject, topic, subTopic, q.Question].join("\t"));
        });
      });
    });
  });

  if (!lines.length) { alert("No visible questions to copy."); return; }
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    showSuccessAlert(lines.length + " visible question(s) copied (structure) to clipboard.");
  }).catch(() => {
    alert("Copy failed — clipboard access may be blocked by the browser.");
  });
}

// Requirement: a "Structure" export — one tab-separated row per progressive hierarchy level,
// excluding questions (Subject, then Subject+Topic, then Subject+Topic+SubTopic).
export function copyVisibleQuestionsStructure() {
  const tree = getVisibleGroupedTree();
  const subjects = Object.keys(tree);
  if (!subjects.length) { alert("No visible questions to copy."); return; }

  const lines = [];
  subjects.forEach(subject => {
    lines.push(subject);
    Object.keys(tree[subject]).forEach(topic => {
      lines.push(subject + "\t" + topic);
      Object.keys(tree[subject][topic]).forEach(subTopic => {
        lines.push(subject + "\t" + topic + "\t" + subTopic);
      });
    });
  });

  if (!lines.length) { alert("No visible structure to copy."); return; }
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
    showSuccessAlert(lines.length + " row(s) copied (structure) to clipboard.");
  }).catch(() => {
    alert("Copy failed — clipboard access may be blocked by the browser.");
  });
}

export function updateGlobalStatsBadges(filteredQuestions) {
  const holder = document.getElementById("globalStatsBadges");
  if (!holder) return;
  holder.textContent = "";
  const total = state.rawData.length;
  const done = filteredQuestions.filter(q => q.Done).length;
  const review = filteredQuestions.filter(q => q.ReviewLater).length;
  const starred = filteredQuestions.filter(q => q.Starred).length;

  // Requirement: "Filtered" stays static across Review/Done/Starred clicks — it reflects only
  // the Subject/Topic/SubTopic filters (passesFilter(), js/components/filters.js), never the
  // Status filter, so adding/removing a status value never moves this number.
  const structuralCount = state.rawData.filter(r => passesFilter(r.Subject, r.Topic, r.SubTopic)).length;

  // Requirement: a badge with a zero count has nothing to add a filter for, so it's shown inert
  // — no clickable styling, no cursor, no listener — rather than a click that does nothing.
  // Exception: an already-`active` badge stays clickable even at zero count, since a click there
  // means "turn this filter off," which is always a valid action regardless of how many (if any)
  // rows currently match it. `active` (Review/Done/Starred only) prefixes a checkmark icon. The
  // count itself renders in a nested .badge.badge-light (Bootstrap 4's class name — Bootstrap 5,
  // this project's version, dropped it, so it's defined locally in style.css).
  const make = (label, count, bg, { onClick, title, active } = {}) => {
    const b = document.createElement("span");
    const clickable = !!onClick && (count > 0 || active);
    b.className = "badge d-inline-flex align-items-center gap-1" + (clickable ? " stat-badge-clickable" : "");
    b.style.backgroundColor = bg;
    b.style.color = "#fff";

    if (active) {
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-check";
      b.appendChild(icon);
    }

    b.appendChild(document.createTextNode(label + ":"));

    const countBadge = document.createElement("span");
    countBadge.className = "badge badge-light";
    countBadge.textContent = String(count);
    b.appendChild(countBadge);

    if (clickable) {
      if (title) b.title = title;
      b.addEventListener("click", onClick);
    }

    return b;
  };

  const reviewActive = state.activeFilters.Status.includes("ReviewLater");
  const doneActive = state.activeFilters.Status.includes("Done");
  const starredActive = state.activeFilters.Status.includes("Starred");

  // Requirement: badges stay compact and grouped on the left; copy-export buttons get their own
  // group pulled to the far right (ms-auto) so they don't crowd or wrap awkwardly against the
  // now-smaller badges — holder itself is the flex row (.global-stats-badges, style.css).
  const badgesGroup = document.createElement("div");
  badgesGroup.className = "d-flex flex-wrap align-items-center gap-2";
  holder.appendChild(badgesGroup);

  badgesGroup.appendChild(make("Total", total, "#6c757d",
    { onClick: () => clearFilters(), title: "Click to reset all Subject/Topic/SubTopic/Status filters" }));
  badgesGroup.appendChild(make("Filtered", structuralCount, "var(--accent)",
    { onClick: () => resetReviewDoneStarredFilters(), title: "Click to reset the Review Later/Done/Starred filters" }));
  // Requirement: clicking a Review/Done/Starred badge toggles that Status value on or off
  // (rather than only ever adding it) — each is independent, so any combination can be active
  // at once (state.activeFilters.Status is already a plain array; addStatusFilterValue()/
  // removeStatusFilterValue() just push/filter a single value, never clobbering the others).
  badgesGroup.appendChild(make("Review", review, "var(--review-line)", {
    onClick: () => reviewActive ? removeStatusFilterValue("ReviewLater") : addStatusFilterValue("ReviewLater"),
    title: reviewActive ? "Click to remove the Review Later filter" : "Click to filter by Review Later",
    active: reviewActive
  }));
  badgesGroup.appendChild(make("Done", done, "var(--done-line)", {
    onClick: () => doneActive ? removeStatusFilterValue("Done") : addStatusFilterValue("Done"),
    title: doneActive ? "Click to remove the Done filter" : "Click to filter by Done",
    active: doneActive
  }));
  badgesGroup.appendChild(make("Starred", starred, "#e6bc2e", {
    onClick: () => starredActive ? removeStatusFilterValue("Starred") : addStatusFilterValue("Starred"),
    title: starredActive ? "Click to remove the Starred filter" : "Click to filter by Starred (within the current filters)",
    active: starredActive
  }));

  // Requirement: export actions live inside the stats badges row itself, pulled to the right.
  if (state.rawData.length) {
    const actionsGroup = document.createElement("div");
    actionsGroup.className = "d-flex flex-wrap align-items-center gap-2 ms-auto";
    holder.appendChild(actionsGroup);

    // Requirement: a toggle that swaps the nested Subject > Topic > SubTopic accordion tree
    // for a flat list of just the question accordions, one Subject/Topic/SubTopic path heading
    // per group (renderFlatGroupedView(), js/components/tree.js) — same filtered data either
    // way, just laid out differently. Persisted globally (not per-file) via localStorage, same
    // shape as the editModeToggle. Rebuilt fresh every render() like the rest of this holder, so
    // its pressed look (.active) always reflects state.flatGroupView directly rather than a
    // separate DOM state to keep in sync.
    const flatViewToggleBtn = document.createElement("button");
    flatViewToggleBtn.type = "button";
    flatViewToggleBtn.className = "btn btn-sm btn-outline-secondary" + (state.flatGroupView ? " active" : "");
    flatViewToggleBtn.title = state.flatGroupView
      ? "Switch back to the nested Subject/Topic/SubTopic accordion tree"
      : "Flatten to a list of questions grouped by Subject/Topic/SubTopic path";
    flatViewToggleBtn.setAttribute("aria-pressed", String(!!state.flatGroupView));
    flatViewToggleBtn.innerHTML = '<i class="fa-solid fa-align-left"></i>';
    flatViewToggleBtn.addEventListener("click", () => {
      state.flatGroupView = !state.flatGroupView;
      localStorage.setItem(LS_FLAT_GROUP_VIEW, String(state.flatGroupView));
      render();
    });
    actionsGroup.appendChild(flatViewToggleBtn);

    // Requirement: Drag & Drop toggle — independent of Edit Mode (drag handles are always
    // visible now, see .drag-handle in style.css/tree.js). Same rebuilt-fresh-every-render
    // pattern as flatViewToggleBtn just above: toggles state.dragDropOn + the body.drag-drop-off
    // class (style.css, hides every .drag-handle which also blocks Sortable from starting a
    // drag), persists via LS_DRAG_DROP_ON, then render() so the pressed look stays in sync.
    const dragDropToggleBtn = document.createElement("button");
    dragDropToggleBtn.type = "button";
    dragDropToggleBtn.className = "btn btn-sm btn-outline-secondary" + (state.dragDropOn ? " active" : "");
    dragDropToggleBtn.title = state.dragDropOn
      ? "Disable drag-and-drop reordering for all accordions"
      : "Enable drag-and-drop reordering for all accordions";
    dragDropToggleBtn.setAttribute("aria-pressed", String(!!state.dragDropOn));
    dragDropToggleBtn.innerHTML = '<i class="fa-solid fa-arrows-up-down-left-right"></i>';
    dragDropToggleBtn.addEventListener("click", () => {
      state.dragDropOn = !state.dragDropOn;
      localStorage.setItem(LS_DRAG_DROP_ON, String(state.dragDropOn));
      document.body.classList.toggle("drag-drop-off", !state.dragDropOn);
      render();
    });
    actionsGroup.appendChild(dragDropToggleBtn);

    const copyPlainBtn = document.createElement("button");
    copyPlainBtn.type = "button";
    copyPlainBtn.className = "btn btn-sm btn-outline-secondary";
    copyPlainBtn.title = "Copy every currently-visible question, one per line";
    copyPlainBtn.innerHTML = '<i class="fa-solid fa-list"></i>';
    copyPlainBtn.addEventListener("click", copyVisibleQuestionsPlain);
    actionsGroup.appendChild(copyPlainBtn);

    const copyStructureAnswerBtn = document.createElement("button");
    copyStructureAnswerBtn.type = "button";
    copyStructureAnswerBtn.className = "btn btn-sm btn-outline-secondary";
    copyStructureAnswerBtn.title = "Copy the currently-visible questions as tab-separated rows, each carrying its full Subject/Topic/SubTopic/Question path";
    copyStructureAnswerBtn.innerHTML = '<i class="fa-solid fa-table-list"></i>';
    copyStructureAnswerBtn.addEventListener("click", copyVisibleQuestionsStructureWithAnswer);
    actionsGroup.appendChild(copyStructureAnswerBtn);

    const copyHierarchyBtn = document.createElement("button");
    copyHierarchyBtn.type = "button";
    copyHierarchyBtn.className = "btn btn-sm btn-outline-secondary";
    copyHierarchyBtn.title = "Copy the currently-visible Subject > Topic > SubTopic > Question tree, tab-indented";
    copyHierarchyBtn.innerHTML = '<i class="fa-solid fa-sitemap"></i>';
    copyHierarchyBtn.addEventListener("click", copyVisibleQuestionsHierarchy);
    actionsGroup.appendChild(copyHierarchyBtn);

    const copyStructureBtn = document.createElement("button");
    copyStructureBtn.type = "button";
    copyStructureBtn.className = "btn btn-sm btn-outline-secondary";
    copyStructureBtn.title = "Copy the currently-visible Subject/Topic/SubTopic structure as tab-separated rows, one per progressive level, excluding questions";
    copyStructureBtn.innerHTML = '<i class="fa-solid fa-diagram-project"></i>';
    copyStructureBtn.addEventListener("click", copyVisibleQuestionsStructure);
    actionsGroup.appendChild(copyStructureBtn);

    const copyHierarchyOnlyBtn = document.createElement("button");
    copyHierarchyOnlyBtn.type = "button";
    copyHierarchyOnlyBtn.className = "btn btn-sm btn-outline-secondary";
    copyHierarchyOnlyBtn.title = "Copy visible hierarchy only (Subjects/Topics/SubTopics, no questions), tab-indented";
    copyHierarchyOnlyBtn.innerHTML = '<i class="fa-solid fa-folder-tree"></i>';
    copyHierarchyOnlyBtn.addEventListener("click", copyVisibleHierarchyOnly);
    actionsGroup.appendChild(copyHierarchyOnlyBtn);
  }
}
