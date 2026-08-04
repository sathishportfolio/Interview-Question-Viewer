/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { FLASH_DURATION_MS } from '../state.js';
import { expandToQuestion, updateHeaderBreadcrumb } from './tree.js';

export function subTopicAlertKey(subject, topic, subTopic) {
  return subject + "\u0001" + topic + "\u0001" + subTopic;
}

export function showSubTopicAlert(subject, topic, subTopic, type, message, qidToScrollTo) {
  const key = subTopicAlertKey(subject, topic, subTopic);
  const holder = Array.from(document.querySelectorAll(".subtopic-alert-holder"))
    .find(h => h.dataset.subTopicAlertKey === key);
  if (!holder) return;
  holder.textContent = "";

  const alertEl = document.createElement("div");
  alertEl.className = "alert alert-" + type + " alert-dismissible fade show mt-2 mb-2";
  alertEl.setAttribute("role", "alert");

  if (qidToScrollTo) {
    const link = document.createElement("a");
    link.href = "#";
    link.className = "alert-link";
    link.textContent = message;
    link.addEventListener("click", e => {
      e.preventDefault();
      const target = document.querySelector('[data-qid="' + qidToScrollTo + '"]');
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      flashHighlightItem(target);
    });
    alertEl.appendChild(link);
  } else {
    alertEl.appendChild(document.createTextNode(message));
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-close";
  closeBtn.setAttribute("data-bs-dismiss", "alert");
  closeBtn.setAttribute("aria-label", "Close");
  alertEl.appendChild(closeBtn);
  holder.appendChild(alertEl);
}

export function showSuccessAlert(message) {
  const holder = document.getElementById("globalAlertHolder");
  if (!holder) return;
  const alertEl = document.createElement("div");
  alertEl.className = "alert alert-success alert-dismissible fade show shadow-sm";
  alertEl.setAttribute("role", "alert");
  alertEl.textContent = message;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-close";
  closeBtn.setAttribute("data-bs-dismiss", "alert");
  closeBtn.setAttribute("aria-label", "Close");
  alertEl.appendChild(closeBtn);
  holder.appendChild(alertEl);
  setTimeout(() => {
    if (!alertEl.parentNode) return;
    const inst = bootstrap.Alert.getOrCreateInstance(alertEl);
    inst.close();
  }, 3000);
}

export function flashHighlightItem(el, sourceCtx) {
  if (!el) return;
  const surface = el.querySelector(":scope > .accordion-header") || el;
  if (getComputedStyle(surface).position === "static") surface.style.position = "relative";
  if (surface._flashCleanup) surface._flashCleanup();

  const overlay = document.createElement("div");
  overlay.className = "flash-overlay";
  surface.appendChild(overlay);

  const actionIcons = document.createElement("div");
  actionIcons.className = "flash-action-icons";

  if (sourceCtx && sourceCtx.jumpBack) {
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "flash-action-icon-btn";
    backBtn.title = sourceCtx.jumpBackLabel || "Back to your draft question";
    backBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    backBtn.addEventListener("click", e => { e.stopPropagation(); sourceCtx.jumpBack(); });
    actionIcons.appendChild(backBtn);
  }

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "flash-action-icon-btn flash-dismiss-btn";
  dismissBtn.title = "Dismiss highlight";
  dismissBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  dismissBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (surface._flashCleanup) surface._flashCleanup();
  });
  actionIcons.appendChild(dismissBtn);

  // Requirement: place flash-action-icons as a normal in-flow flex child, right before the
  // status-cluster/delete icons, instead of absolutely overlapping them — so both sets of
  // icons stay fully visible and clickable during the flash. Headers without that cluster
  // (Subject/Topic/SubTopic tree headers, or a plain surface like the add-question-wrap used
  // for "jump back") fall back to a right-edge overlay.
  const compactRows = surface.querySelectorAll(":scope > .status-icon-row.compact");
  const insertBeforeEl = compactRows.length ? compactRows[compactRows.length - 1] : null;
  if (insertBeforeEl) {
    surface.insertBefore(actionIcons, insertBeforeEl);
  } else {
    actionIcons.classList.add("flash-action-icons-overlay");
    surface.appendChild(actionIcons);
  }

  requestAnimationFrame(() => {
    overlay.classList.add("fade");
    actionIcons.classList.add("fade");
  });

  const timeoutId = setTimeout(() => {
    overlay.remove();
    actionIcons.remove();
    surface._flashCleanup = null;
  }, FLASH_DURATION_MS);

  surface._flashCleanup = () => {
    clearTimeout(timeoutId);
    overlay.remove();
    actionIcons.remove();
    surface._flashCleanup = null;
  };
}

export function jumpToQuestion(qid, sourceCtx) {
  const qItem = expandToQuestion(qid);
  if (!qItem) {
    alert("That question is hidden by the current filters — clear filters to view it.");
    return;
  }
  updateHeaderBreadcrumb();
  requestAnimationFrame(() => {
    qItem.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  flashHighlightItem(qItem, sourceCtx);
}

export function renderGroupedQuestionLinks(container, matches, opts) {
  opts = opts || {};
  container.textContent = "";
  if (!matches.length) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";

  if (opts.label) {
    const label = document.createElement("div");
    label.className = "fuzzy-hint-label";
    label.textContent = opts.label;
    container.appendChild(label);
  }

  const groups = [];
  const groupIndex = new Map();
  matches.forEach(m => {
    const q = m.q;
    const key = q.Subject + "" + q.Topic + "" + q.SubTopic;
    let group = groupIndex.get(key);
    if (!group) {
      group = { subject: q.Subject, topic: q.Topic, subTopic: q.SubTopic, matches: [] };
      groupIndex.set(key, group);
      groups.push(group);
    }
    group.matches.push(m);
  });

  // Requirement: auto-open the first group containing an exact-text match (the yellow-
  // highlighted rows) so the most alarming duplicate is immediately visible, not one more
  // click away. Every other group still starts collapsed.
  const autoOpenGroup = groups.find(g => g.matches.some(m => m.exact));

  groups.forEach(group => {
    const groupWrap = document.createElement("div");
    groupWrap.className = "fuzzy-hint-group";

    const groupHeader = document.createElement("a");
    groupHeader.href = "#";
    groupHeader.className = "fuzzy-hint-group-header";
    groupHeader.textContent = group.subject + " > " + group.topic + " > " + group.subTopic +
      " (" + group.matches.length + ")";

    const list = document.createElement("div");
    list.className = "fuzzy-hint-group-list";
    const startOpen = group === autoOpenGroup;
    list.style.display = startOpen ? "block" : "none";
    if (startOpen) groupHeader.classList.add("is-open");

    groupHeader.addEventListener("click", e => {
      e.preventDefault();
      const open = list.style.display !== "none";
      list.style.display = open ? "none" : "block";
      groupHeader.classList.toggle("is-open", !open);
    });

    group.matches.forEach(m => {
      const row = document.createElement("div");
      row.className = "fuzzy-hint-row" + (m.exact ? " exact-match" : "");
      const link = document.createElement("a");
      link.href = "#";
      link.className = "alert-link";
      link.textContent = m.q.Question;
      if (m.exact) link.title = "Exact match — this question already exists word-for-word.";
      link.addEventListener("click", e => {
        e.preventDefault();
        jumpToQuestion(m.q._id, opts.sourceCtx);
      });
      row.appendChild(link);
      list.appendChild(row);
    });

    groupWrap.appendChild(groupHeader);
    groupWrap.appendChild(list);
    container.appendChild(groupWrap);
  });
}
