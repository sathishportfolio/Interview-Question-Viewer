/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state } from '../state.js';
import { loadFilterPrefs, saveFilterPrefs } from '../api.js';
import { render } from './tree.js';

function subjectMatchesActiveFilters(subject) {
  return !state.activeFilters.Subject.length || state.activeFilters.Subject.includes(subject);
}

function topicMatchesActiveFilters(subject, topic) {
  return subjectMatchesActiveFilters(subject) &&
    (!state.activeFilters.Topic.length || state.activeFilters.Topic.includes(topic));
}

export function filterGroupedData() {
  const result = {};
  Object.keys(state.grouped).forEach(subject => {
    const topics = state.grouped[subject];
    const filteredTopics = {};
    Object.keys(topics).forEach(topic => {
      const subTopics = topics[topic];
      const filteredSubTopics = {};
      Object.keys(subTopics).forEach(subTopic => {
        if (!passesFilter(subject, topic, subTopic)) return;
        const all = subTopics[subTopic];
        // Requirement: an empty SubTopic (no questions at all yet) always keeps its header —
        // the Status filter only has anything to test once there's at least one question.
        const visible = (all.length && state.activeFilters.Status.length)
          ? all.filter(q => matchesStatusFilter(q))
          : all;
        if (visible.length || !all.length) filteredSubTopics[subTopic] = visible;
      });
      // Requirement: an empty Topic (no SubTopics under it yet) keeps its header too, as long
      // as it still matches any active Subject/Topic filter.
      const topicIsEmpty = !Object.keys(subTopics).length;
      if (Object.keys(filteredSubTopics).length || (topicIsEmpty && topicMatchesActiveFilters(subject, topic))) {
        filteredTopics[topic] = filteredSubTopics;
      }
    });
    // Requirement: an empty Subject (no Topics under it yet) keeps its header too.
    const subjectIsEmpty = !Object.keys(topics).length;
    if (Object.keys(filteredTopics).length || (subjectIsEmpty && subjectMatchesActiveFilters(subject))) {
      result[subject] = filteredTopics;
    }
  });
  return result;
}

export function populateFilterOptions() {
  const saved = loadFilterPrefs(state.currentFileName);
  state.activeFilters = {
    Subject: (saved && saved.Subject) || [],
    Topic: (saved && saved.Topic) || [],
    SubTopic: (saved && saved.SubTopic) || [],
    Status: (saved && saved.Status) || []
  };
  const statusSelect = document.getElementById("statusFilter");
  Array.from(statusSelect.options).forEach(o => { o.selected = state.activeFilters.Status.includes(o.value); });
  refreshFilterOptions();
  initSelect2("statusFilter", "Filter by Status");
  document.getElementById("clearFiltersBtn").onclick = clearFilters;
}

export function computeAvailableOptions(dimension) {
  const values = new Set();
  state.rawData.forEach(r => {
    const matchSubject = dimension === "Subject" || !state.activeFilters.Subject.length || state.activeFilters.Subject.includes(r.Subject);
    const matchTopic = dimension === "Topic" || !state.activeFilters.Topic.length || state.activeFilters.Topic.includes(r.Topic);
    const matchSubTopic = dimension === "SubTopic" || !state.activeFilters.SubTopic.length || state.activeFilters.SubTopic.includes(r.SubTopic);
    if (matchSubject && matchTopic && matchSubTopic) values.add(r[dimension]);
  });
  return [...values].sort();
}

export function refreshFilterOptions() {
  const dims = [
    { key: "Subject", id: "subjectFilter", placeholder: "Filter by Subject" },
    { key: "Topic", id: "topicFilter", placeholder: "Filter by Topic" },
    { key: "SubTopic", id: "subTopicFilter", placeholder: "Filter by SubTopic" }
  ];

  dims.forEach(d => {
    const options = computeAvailableOptions(d.key);
    state.activeFilters[d.key] = state.activeFilters[d.key].filter(v => options.includes(v));
    fillSelect(d.id, options, state.activeFilters[d.key]);
  });

  dims.forEach(d => initSelect2(d.id, d.placeholder));
}

export function initSelect2(id, placeholder) {
  const $select = $("#" + id);
  if ($select.hasClass("select2-hidden-accessible")) {
    $select.off("change");
    $select.select2("destroy");
  }
  $select.select2({
    placeholder: placeholder,
    width: "100%",
    allowClear: true
  });
  $select.on("change", onFilterChange);
}

export function fillSelect(id, values, selectedValues) {
  selectedValues = selectedValues || [];
  const select = document.getElementById(id);
  select.textContent = "";
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if (selectedValues.includes(v)) opt.selected = true;
    select.appendChild(opt);
  });
}

export function getSelectedValues(id) {
  const select = document.getElementById(id);
  return Array.from(select.selectedOptions).map(o => o.value);
}

export function onFilterChange() {
  state.activeFilters.Subject = getSelectedValues("subjectFilter");
  state.activeFilters.Topic = getSelectedValues("topicFilter");
  state.activeFilters.SubTopic = getSelectedValues("subTopicFilter");
  state.activeFilters.Status = getSelectedValues("statusFilter");
  refreshFilterOptions();
  saveFilterPrefs();
  render();
}

export function clearFilters() {
  state.activeFilters = { Subject: [], Topic: [], SubTopic: [], Status: [] };
  refreshFilterOptions();
  $("#statusFilter").val(null).trigger("change.select2");
  saveFilterPrefs();
  render();
}

export function passesFilter(subject, topic, subTopic) {
  const sOk = !state.activeFilters.Subject.length || state.activeFilters.Subject.includes(subject);
  const tOk = !state.activeFilters.Topic.length || state.activeFilters.Topic.includes(topic);
  const lOk = !state.activeFilters.SubTopic.length || state.activeFilters.SubTopic.includes(subTopic);
  return sOk && tOk && lOk;
}

export function matchesStatusFilter(q) {
  if (!state.activeFilters.Status.length) return true;
  return state.activeFilters.Status.some(s => {
    if (s === "Done") return !!q.Done;
    if (s === "ReviewLater") return !!q.ReviewLater;
    if (s === "Duplicate") return !!q.Duplicate;
    if (s === "LessImportant") return !!q.LessImportant;
    if (s === "Starred") return !!q.Starred;
    return false;
  });
}

export function addStatusFilterValue(value) {
  const current = getSelectedValues("statusFilter");
  if (!current.includes(value)) current.push(value);
  $("#statusFilter").val(current).trigger("change");
}

// Requirement: the inline close (×) button on an active Review/Done/Starred badge
// (updateGlobalStatsBadges(), js/components/stats.js) removes just that one Status value,
// the inverse of addStatusFilterValue() above.
export function removeStatusFilterValue(value) {
  const current = getSelectedValues("statusFilter").filter(v => v !== value);
  $("#statusFilter").val(current).trigger("change");
}

// Requirement: the #globalStatsBadges "Filtered" badge resets just the Review Later/Done/Starred
// status filters — NOT the Subject/Topic/SubTopic filters (that's #clearFiltersBtn's job,
// clearFilters() above). Lets the statusFilter select's own "change" handler — onFilterChange(),
// which already does refreshFilterOptions()/saveFilterPrefs()/render() — pick up the trimmed value.
export function resetReviewDoneStarredFilters() {
  const current = getSelectedValues("statusFilter").filter(v => v !== "Done" && v !== "ReviewLater" && v !== "Starred");
  $("#statusFilter").val(current).trigger("change");
}
