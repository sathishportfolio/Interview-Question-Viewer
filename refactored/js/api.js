/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state, LS_TEMP_MODE, LS_FLAT_GROUP_VIEW, REQUIRED_COLUMNS, LS_FILE_LIST, LS_ACTIVE_FILE, LS_DATA_PREFIX, LS_FILTER_PREFIX, LS_EMPTY_PREFIX, LS_ACTIVE_QUESTION_PREFIX } from './state.js';
import { populateFilterOptions } from './components/filters.js';
import { render } from './components/tree.js';
import { groupData, toBool, uid } from './utils.js';

export function getFileList() {
  try {
    return JSON.parse(localStorage.getItem(LS_FILE_LIST)) || [];
  } catch (e) {
    return [];
  }
}

export function saveFileList(list) {
  localStorage.setItem(LS_FILE_LIST, JSON.stringify(list));
}

export function getActiveFileName() {
  return localStorage.getItem(LS_ACTIVE_FILE);
}

export function setActiveFileName(name) {
  localStorage.setItem(LS_ACTIVE_FILE, name);
}

export function saveFileData(filename, rows) {
  const slim = rows.map(r => ({
    Subject: r.Subject, Topic: r.Topic, SubTopic: r.SubTopic,
    Question: r.Question, Answer: r.Answer, Done: r.Done, ReviewLater: r.ReviewLater,
    Duplicate: !!r.Duplicate, LessImportant: !!r.LessImportant, Starred: !!r.Starred, Order: r.Order,
    SubjectOrder: r.SubjectOrder, TopicOrder: r.TopicOrder, SubTopicOrder: r.SubTopicOrder
  }));
  localStorage.setItem(LS_DATA_PREFIX + filename, JSON.stringify(slim));
}

export function readFileData(filename) {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_DATA_PREFIX + filename));
    if (!Array.isArray(raw)) return null;
    return raw.map(r => ({ ...r, _id: uid("q") }));
  } catch (e) {
    return null;
  }
}

export function saveEmptyGroups(filename, groups) {
  localStorage.setItem(LS_EMPTY_PREFIX + filename, JSON.stringify(groups || []));
}

export function readEmptyGroups(filename) {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_EMPTY_PREFIX + filename));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

export function persistCurrentProgress() {
  if (state.tempMode || !state.currentFileName) return;
  saveFileData(state.currentFileName, state.rawData);
  saveEmptyGroups(state.currentFileName, state.emptyGroups);
}

// Requirement: the "Active Question" flag is a single global pointer (at most one flagged
// question at a time), identified by content (Subject/Topic/SubTopic/Question) rather than _id
// since _id is regenerated on every load/switch (see readFileData()/processParsedResults() below)
// and so can't be used to find the same question again after a reload. Persisted per-file, same
// shape as saveFilterPrefs()/loadFilterPrefs().
export function saveActiveQuestion(filename, activeQuestion) {
  if (state.tempMode || !filename) return;
  if (!activeQuestion) { localStorage.removeItem(LS_ACTIVE_QUESTION_PREFIX + filename); return; }
  localStorage.setItem(LS_ACTIVE_QUESTION_PREFIX + filename, JSON.stringify(activeQuestion));
}

export function readActiveQuestion(filename) {
  if (!filename) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ACTIVE_QUESTION_PREFIX + filename));
    return (raw && raw.Subject) ? raw : null;
  } catch (e) {
    return null;
  }
}

export function clearAllStorage() {
  const list = getFileList();
  list.forEach(name => {
    localStorage.removeItem(LS_DATA_PREFIX + name);
    localStorage.removeItem(LS_FILTER_PREFIX + name);
    localStorage.removeItem(LS_EMPTY_PREFIX + name);
    localStorage.removeItem(LS_ACTIVE_QUESTION_PREFIX + name);
  });
  localStorage.removeItem(LS_FILE_LIST);
  localStorage.removeItem(LS_ACTIVE_FILE);
}

export function saveFilterPrefs() {
  if (state.tempMode || !state.currentFileName) return;
  localStorage.setItem(LS_FILTER_PREFIX + state.currentFileName, JSON.stringify({
    Subject: state.activeFilters.Subject, Topic: state.activeFilters.Topic,
    SubTopic: state.activeFilters.SubTopic, Status: state.activeFilters.Status
  }));
}

export function loadFilterPrefs(filename) {
  if (!filename) return null;
  try {
    return JSON.parse(localStorage.getItem(LS_FILTER_PREFIX + filename));
  } catch (e) {
    return null;
  }
}

export function setStatusMsg(text, isError) {
  const el = document.getElementById("statusMsg");
  el.textContent = text;
  el.style.color = isError ? "#c0392b" : "#6c757d";
}

export function loadCSV(file) {
  const filename = file.name;
  if (!checkDuplicateFile(filename)) return;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      processParsedResults(results, filename);
      document.getElementById("csvInput").value = ""; // Clear file input on success
    },
    error: function (err) {
      setStatusMsg("Failed to parse CSV file: " + err.message, true);
    }
  });
}

export function loadCSVFromString(stringData, filename) {
  if (!checkDuplicateFile(filename)) return;

  Papa.parse(stringData, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      processParsedResults(results, filename);
    },
    error: function (err) {
      setStatusMsg("Failed to parse CSV string: " + err.message, true);
    }
  });
}

export function checkDuplicateFile(filename) {
  if (!state.tempMode) {
    const existingList = getFileList();
    if (existingList.includes(filename)) {
      alert(`A CSV named "${filename}" is already loaded. Rename the file, switch to it from the dropdown, or Reset All Data first.`);
      if (document.getElementById("csvInput")) document.getElementById("csvInput").value = "";
      return false;
    }
  }
  return true;
}

export function processParsedResults(results, filename) {
  const rows = results.data;

  if (!results.meta.fields) {
    setStatusMsg("Invalid CSV format structure.", true);
    return;
  }

  const missing = REQUIRED_COLUMNS.filter(c => !results.meta.fields.includes(c));
  if (missing.length) {
    setStatusMsg("Missing columns: " + missing.join(", "), true);
    return;
  }

  const subjectOrderMap = new Map();          // subject -> order
  const topicOrderMap = new Map();             // "subject|topic" -> order
  const topicCounters = new Map();              // subject -> next topic order
  const subTopicOrderMap = new Map();              // "subject|topic|subTopic" -> order
  const subTopicCounters = new Map();               // "subject|topic" -> next subTopic order
  const numOr = (val, fallback) => (val !== undefined && val !== "" && !isNaN(Number(val))) ? Number(val) : fallback;

  const parsedRows = rows.map((r, i) => {
    const subject = (r.Subject || "").trim();
    const topic = (r.Topic || "").trim();
    const subTopic = (r.SubTopic || "").trim();

    if (!subjectOrderMap.has(subject)) subjectOrderMap.set(subject, subjectOrderMap.size);

    const topicKey = subject + "|" + topic;
    if (!topicOrderMap.has(topicKey)) {
      const c = topicCounters.get(subject) || 0;
      topicOrderMap.set(topicKey, c);
      topicCounters.set(subject, c + 1);
    }

    const subTopicKey = topicKey + "|" + subTopic;
    if (!subTopicOrderMap.has(subTopicKey)) {
      const c = subTopicCounters.get(topicKey) || 0;
      subTopicOrderMap.set(subTopicKey, c);
      subTopicCounters.set(topicKey, c + 1);
    }

    return {
      Subject: subject,
      Topic: topic,
      SubTopic: subTopic,
      Question: (r.Question || "").trim(),
      Answer: r.Answer || "",
      Done: toBool(r.Done),
      ReviewLater: toBool(r.ReviewLater),
      Duplicate: toBool(r.Duplicate),
      LessImportant: toBool(r.LessImportant),
      Starred: toBool(r.Starred),
      Order: numOr(r.Order, i),
      SubjectOrder: numOr(r.SubjectOrder, subjectOrderMap.get(subject)),
      TopicOrder: numOr(r.TopicOrder, topicOrderMap.get(topicKey)),
      SubTopicOrder: numOr(r.SubTopicOrder, subTopicOrderMap.get(subTopicKey)),
      _id: uid("q")
    };
  }).filter(r => r.Subject && r.Topic && r.SubTopic && r.Question);

  // Requirement: empty Subject/Topic/SubTopic headers survive a Progress CSV export/import
  // round-trip. downloadProgress() writes them as marker rows (real Subject, blank Question,
  // Topic/SubTopic blank for a shallower empty group) — pick those back out here instead of
  // silently dropping them along with genuinely blank/malformed rows.
  const emptyGroups = [];
  const seenEmpty = new Set();
  rows.forEach(r => {
    const subject = (r.Subject || "").trim();
    const topic = (r.Topic || "").trim();
    const subTopic = (r.SubTopic || "").trim();
    if (!subject || (r.Question || "").trim()) return;
    const key = subject + "" + topic + "" + subTopic;
    if (seenEmpty.has(key)) return;
    seenEmpty.add(key);
    emptyGroups.push({ Subject: subject, Topic: topic || null, SubTopic: subTopic || null });
  });

  if (!parsedRows.length && !emptyGroups.length) {
    setStatusMsg("No valid rows found in CSV.", true);
    return;
  }

  if (state.tempMode) {
    activateFile(filename, parsedRows, emptyGroups);
    setStatusMsg(parsedRows.length + " - from \"" + filename + "\" (test mode — not saved).");
    return;
  }

  const list = getFileList();
  list.push(filename);
  saveFileList(list);
  saveFileData(filename, parsedRows);
  saveEmptyGroups(filename, emptyGroups);
  setActiveFileName(filename);

  activateFile(filename, parsedRows, emptyGroups);
  setStatusMsg(parsedRows.length + " - from \"" + filename + "\".");
}

export function activateFile(filename, rows, emptyGroups) {
  state.currentFileName = filename;
  state.rawData = rows;
  state.emptyGroups = emptyGroups || [];
  state.grouped = groupData(state.rawData, state.emptyGroups);
  state.activeQuestion = readActiveQuestion(filename);
  populateFilterOptions();
  populateFileSwitcher();
  document.getElementById("downloadProgressBtn").disabled = false;
  document.getElementById("resetAllBtn").disabled = false;
  render();
}

export function switchCSV(filename) {
  if (!filename || filename === state.currentFileName) return;
  const rows = readFileData(filename);
  if (!rows) {
    setStatusMsg("Could not load \"" + filename + "\" from storage.", true);
    return;
  }
  setActiveFileName(filename);
  activateFile(filename, rows, readEmptyGroups(filename));
  setStatusMsg(rows.length + " - from \"" + filename + "\".");
}

export function populateFileSwitcher() {
  const select = document.getElementById("csvSwitcher");
  select.textContent = "";
  const list = getFileList();

  if (!list.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No CSV loaded";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  list.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === state.currentFileName) opt.selected = true;
    select.appendChild(opt);
  });
  select.disabled = false;
}

export function resetAllData() {
  const confirmed = confirm("This permanently deletes all uploaded CSVs and progress from this browser. This cannot be undone. Continue?");
  if (!confirmed) return;

  clearAllStorage();
  state.rawData = [];
  state.grouped = {};
  state.emptyGroups = [];
  state.activeQuestion = null;
  state.currentFileName = null;
  state.activeFilters = { Subject: [], Topic: [], SubTopic: [], Status: [] };

  document.getElementById("downloadProgressBtn").disabled = true;
  document.getElementById("resetAllBtn").disabled = true;
  populateFileSwitcher();
  setStatusMsg("All data reset.");
  render();
}

export function initApp() {
  const storedTemp = localStorage.getItem(LS_TEMP_MODE);
  state.tempMode = storedTemp === null ? true : storedTemp === "true";
  document.getElementById("tempModeToggle").checked = state.tempMode;
  state.flatGroupView = localStorage.getItem(LS_FLAT_GROUP_VIEW) === "true";

  const list = getFileList();
  const active = getActiveFileName();
  populateFileSwitcher();
  if (list.length) {
    document.getElementById("resetAllBtn").disabled = false;
  }
  if (active && list.includes(active)) {
    const rows = readFileData(active);
    const emptyGroups = readEmptyGroups(active);
    if (rows && (rows.length || emptyGroups.length)) {
      activateFile(active, rows, emptyGroups);
      setStatusMsg(rows.length + " - from \"" + active + "\" .");
      return;
    }
  }
  render();
}

// Requirement: raw CSV text (not a JS array run through Papa.unparse()) so updating the default
// sample is just pasting a new CSV export in directly, no per-cell quoting/array bookkeeping.
export function getDefaultSampleCSV() {
  return `Subject,Topic,SubTopic,Question,Answer,Done,ReviewLater,Duplicate,LessImportant
Java,Collections,Easy,What is the difference between ArrayList and LinkedList?,"<p><b>ArrayList</b> uses a dynamic array; <b>LinkedList</b> uses a doubly linked list. ArrayList has faster random access, LinkedList has faster insert/delete at ends.</p>",false,false,false,false
Java,Collections,Medium,How does HashMap handle collisions?,<p>HashMap uses <i>chaining</i> (linked list / red-black tree in Java 8+) within each bucket to handle collisions.</p>,false,false,false,false
Java,Multithreading,Hard,Explain the Java Memory Model and happens-before relationship.,"<p>The JMM defines rules for visibility and ordering of variable writes/reads across threads, formalized via the <b>happens-before</b> relationship.</p>",false,true,false,false
SQL,Joins,Easy,What is the difference between INNER JOIN and LEFT JOIN?,<p>INNER JOIN returns matching rows only; LEFT JOIN returns all rows from the left table plus matches from the right.</p>,true,false,false,false
SQL,Indexing,Medium,When should you avoid adding an index?,<ul><li>Small tables</li><li>Columns with low cardinality</li><li>Tables with heavy write load</li></ul>,false,false,false,true`;
}

export function downloadProgress() {
  if (!state.rawData.length && !state.emptyGroups.length) return;

  const exportRows = state.rawData
    .filter(r => !r.Duplicate) // duplicates are dropped from the exported progress file
    .map(r => ({
      Subject: r.Subject,
      Topic: r.Topic,
      SubTopic: r.SubTopic,
      Question: r.Question,
      Answer: r.Answer,
      Done: r.Done,
      ReviewLater: r.ReviewLater,
      LessImportant: !!r.LessImportant,
      Starred: !!r.Starred,
      Order: r.Order,
      SubjectOrder: r.SubjectOrder,
      TopicOrder: r.TopicOrder,
      SubTopicOrder: r.SubTopicOrder
    }));

  // Requirement: empty Subject/Topic/SubTopic headers (no questions under them) aren't stripped
  // from the exported Progress CSV — write one marker row per empty group (blank Question,
  // Topic/SubTopic left blank too for a shallower empty group); processParsedResults() picks
  // these back out on re-import instead of treating them as invalid rows.
  const emptyRows = state.emptyGroups.map(g => ({
    Subject: g.Subject,
    Topic: g.Topic || "",
    SubTopic: g.SubTopic || "",
    Question: "",
    Answer: "",
    Done: false,
    ReviewLater: false,
    LessImportant: false,
    Starred: false,
    Order: 0,
    SubjectOrder: "",
    TopicOrder: "",
    SubTopicOrder: ""
  }));

  const csv = Papa.unparse(exportRows.concat(emptyRows));

  // 1. Get current date formatted as MMMDD (e.g., "Jul30")
  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "short" });
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${month}${day}`;

  // 2. Strip off the .csv extension
  let base = (state.currentFileName || "interview_questions").replace(/\.csv$/i, "");

  // 3. Match any existing _<Month><Day>_v<number> suffix (e.g., _Jul30_v001)
  const pattern = new RegExp(`_${dateStr}_v(\\d+)$`, "i");
  const match = base.match(pattern);

  let version = 1;
  if (match) {
    version = parseInt(match[1], 10) + 1;
    // Strip the old timestamp tag (and also clean any older _progress_ tags if present)
    base = base.replace(pattern, "");
  } else {
    // If updating on a new day, strip previous date pattern to prevent stacking (e.g., _Jul29_v003)
    base = base.replace(/_[A-Za-z]{3}\d{2}_v\d+$/i, "").replace(/_progress_v\d+$/i, "");
  }

  // 4. Pad version number to 3 digits (e.g., 1 -> "001")
  const paddedVersion = String(version).padStart(3, "0");

  triggerDownload(csv, `${base}_${dateStr}_v${paddedVersion}.csv`);
}

export function triggerDownload(csvText, filename) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
