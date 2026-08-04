/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */
import { state } from './state.js';

export function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 10);
}

export function toBool(val) {
  if (typeof val === "boolean") return val;
  if (val === undefined || val === null) return false;
  return String(val).trim().toLowerCase() === "true" || String(val).trim() === "1";
}

export function formatTimestamp(d) {
  const pad = n => String(n).padStart(2, "0");
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

export function groupData(rows, emptyGroups) {
  emptyGroups = emptyGroups || [];

  // Requirement: an empty-group marker is only meaningful until real rows cover it (its first
  // question gets added, or one gets dragged/moved in) — prune those here, in the one place
  // every render/rebuild passes through, so callers never have to remember to do it themselves.
  for (let i = emptyGroups.length - 1; i >= 0; i--) {
    const g = emptyGroups[i];
    const covered = rows.some(r =>
      r.Subject === g.Subject &&
      (g.Topic == null || r.Topic === g.Topic) &&
      (g.SubTopic == null || r.SubTopic === g.SubTopic)
    );
    if (covered) emptyGroups.splice(i, 1);
  }

  const bucket = {};
  rows.forEach(row => {
    if (!bucket[row.Subject]) bucket[row.Subject] = { order: row.SubjectOrder ?? 0, topics: {} };
    if (row.SubjectOrder !== undefined) bucket[row.Subject].order = row.SubjectOrder;

    const topics = bucket[row.Subject].topics;
    if (!topics[row.Topic]) topics[row.Topic] = { order: row.TopicOrder ?? 0, subTopics: {} };
    if (row.TopicOrder !== undefined) topics[row.Topic].order = row.TopicOrder;

    const subTopics = topics[row.Topic].subTopics;
    if (!subTopics[row.SubTopic]) subTopics[row.SubTopic] = { order: row.SubTopicOrder ?? 0, questions: [] };
    if (row.SubTopicOrder !== undefined) subTopics[row.SubTopic].order = row.SubTopicOrder;

    subTopics[row.SubTopic].questions.push(row);
  });

  // Requirement: empty Subject/Topic/SubTopic headers persist even with zero questions beneath
  // them (created via the independent "+ Add New ..." flow, or left behind after their last
  // question was deleted/moved away). Merge them in after real rows — a group that already has
  // real data always wins — with a large-but-*distinct* order (base + its position in
  // emptyGroups, which is itself append-order/creation-order) so the sort below both (a) always
  // pushes empty groups after every populated sibling, and (b) keeps multiple empty groups —
  // e.g. several bulk-added at once — in the order they were created, appended at the bottom in
  // that order. A single shared `order: Infinity` for all of them would leave their relative
  // order to fall back on Object.keys() insertion-order as a sort tiebreak, which (a) is an
  // indirect thing to depend on and (b) actively breaks if a name looks like an array index
  // ("1", "2", ...) — those sort numerically first in JS object key order regardless of when
  // they were inserted. Distinct numeric orders sidestep both problems.
  const EMPTY_GROUP_ORDER_BASE = 1e9;
  emptyGroups.forEach((g, idx) => {
    const order = EMPTY_GROUP_ORDER_BASE + idx;
    if (!bucket[g.Subject]) bucket[g.Subject] = { order, topics: {} };
    if (!g.Topic) return;

    const topics = bucket[g.Subject].topics;
    if (!topics[g.Topic]) topics[g.Topic] = { order, subTopics: {} };
    if (!g.SubTopic) return;

    const subTopics = topics[g.Topic].subTopics;
    if (!subTopics[g.SubTopic]) subTopics[g.SubTopic] = { order, questions: [] };
  });

  const result = {};
  Object.keys(bucket)
    .sort((a, b) => bucket[a].order - bucket[b].order)
    .forEach(subject => {
      result[subject] = {};
      const topics = bucket[subject].topics;
      Object.keys(topics)
        .sort((a, b) => topics[a].order - topics[b].order)
        .forEach(topic => {
          const subTopics = topics[topic].subTopics;
          result[subject][topic] = {};
          Object.keys(subTopics)
            .sort((a, b) => subTopics[a].order - subTopics[b].order)
            .forEach(subTopic => {
              const questions = subTopics[subTopic].questions;
              // Requirement: within each SubTopic, Starred questions always float to the top and
              // LessImportant questions always sink to the bottom, with everything else in the
              // middle; ties within a tier fall back to the persisted drag order. Since this
              // sort re-runs every time state.grouped is rebuilt (load, reload, CSV import), the
              // hierarchy survives a reload without needing to rewrite Order.
              const tier = q => q.Starred ? 0 : (q.LessImportant ? 2 : 1);
              questions.sort((a, b) => {
                const tierDiff = tier(a) - tier(b);
                if (tierDiff) return tierDiff;
                return (a.Order ?? 0) - (b.Order ?? 0);
              });
              result[subject][topic][subTopic] = questions;
            });
        });
    });
  return result;
}

export function flattenQuestions(node) {
  if (Array.isArray(node)) return node;
  let all = [];
  Object.values(node).forEach(child => { all = all.concat(flattenQuestions(child)); });
  return all;
}

export function computeStats(questions) {
  return {
    total: questions.length,
    done: questions.filter(q => q.Done).length,
    review: questions.filter(q => q.ReviewLater).length
  };
}

export function idsWithInsertAfter(ids, targetId, referenceId) {
  const others = ids.filter(id => id !== targetId);
  const idx = others.indexOf(referenceId);
  if (idx === -1) return [...others, targetId];
  return [...others.slice(0, idx + 1), targetId, ...others.slice(idx + 1)];
}

// Requirement: register a Subject/Topic/SubTopic as an empty group (either freshly created via
// the independent "+ Add New ..." flow with nothing under it yet, or left behind after its last
// question was deleted/dragged away). Pass null for Topic/SubTopic to mark a shallower group
// (e.g. a brand-new Subject with no Topic yet). No-ops if the group actually still has rows, or
// already has a marker — and a deeper marker supersedes any now-redundant shallower one for the
// same ancestor (e.g. adding a SubTopic drops a stale "empty Topic" marker for its parent Topic).
export function markGroupEmpty(subject, topic, subTopic) {
  topic = topic || null;
  subTopic = subTopic || null;

  const hasRows = state.rawData.some(r =>
    r.Subject === subject &&
    (topic == null || r.Topic === topic) &&
    (subTopic == null || r.SubTopic === subTopic)
  );
  if (hasRows) return;

  state.emptyGroups = state.emptyGroups.filter(g => {
    if (g.Subject !== subject) return true;
    if (topic != null && g.Topic === null) return false;
    if (subTopic != null && g.Topic === topic && g.SubTopic === null) return false;
    return true;
  });

  const exists = state.emptyGroups.some(g => g.Subject === subject && g.Topic === topic && g.SubTopic === subTopic);
  if (!exists) state.emptyGroups.push({ Subject: subject, Topic: topic, SubTopic: subTopic });
}

export function getExistingOrder(subject, topic, subTopic) {
  const subjRow = state.rawData.find(r => r.Subject === subject);
  const subjectOrder = subjRow ? subjRow.SubjectOrder : new Set(state.rawData.map(r => r.Subject)).size;

  const topicRow = state.rawData.find(r => r.Subject === subject && r.Topic === topic);
  const topicOrder = topicRow ? topicRow.TopicOrder : new Set(state.rawData.filter(r => r.Subject === subject).map(r => r.Topic)).size;

  const subTopicRow = state.rawData.find(r => r.Subject === subject && r.Topic === topic && r.SubTopic === subTopic);
  const subTopicOrder = subTopicRow ? subTopicRow.SubTopicOrder : new Set(state.rawData.filter(r => r.Subject === subject && r.Topic === topic).map(r => r.SubTopic)).size;

  return { subjectOrder, topicOrder, subTopicOrder };
}

// Requirement: a newly added question always lands at the bottom of its SubTopic's list —
// computed from state.rawData (the authoritative source) rather than trusting a caller-supplied
// question array's .length, since that array can be a Status-filtered subset (filterGroupedData())
// that's shorter than the SubTopic's real question count. Using its .length as the next Order
// would collide with/undercut real, hidden siblings' Order values instead of landing after them.
export function nextQuestionOrder(subject, topic, subTopic) {
  const orders = state.rawData
    .filter(r => r.Subject === subject && r.Topic === topic && r.SubTopic === subTopic)
    .map(r => r.Order ?? -1);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function mergeReorder(allNames, newOrderNames) {
  const visible = new Set(newOrderNames);
  const queue = newOrderNames.slice();
  return allNames.map(name => visible.has(name) ? queue.shift() : name);
}

export function questionExistsIn(questions, text) {
  const norm = t => (t || "").trim().toLowerCase();
  const target = norm(text);
  return questions.some(q => norm(q.Question) === target);
}

export function significantWords(text) {
  return (text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(w => w.length > 5);
}

export function buildTreeCopyText(node, kind, label) {
  if (kind === "subTopic") {
    const qs = node;
    return { text: qs.map(q => q.Question).join("\n"), count: qs.length };
  }
  const lines = [label];
  let count = 0;
  if (kind === "subject") {
    Object.keys(node).forEach(topic => {
      lines.push("\t" + topic);
      Object.keys(node[topic]).forEach(subTopic => {
        lines.push("\t\t" + subTopic);
        node[topic][subTopic].forEach(q => { lines.push("\t\t\t" + q.Question); count++; });
      });
    });
  } else if (kind === "topic") {
    Object.keys(node).forEach(subTopic => {
      lines.push("\t" + subTopic);
      node[subTopic].forEach(q => { lines.push("\t\t" + q.Question); count++; });
    });
  }
  return { text: lines.join("\n"), count };
}

// Requirement: a "hierarchy only" copy — Subject/Topic/SubTopic *names*, tab-indented, with no
// Question text at all. Mirrors buildTreeCopyText()'s shape/kinds ("subject"/"topic"/"subTopic")
// so the two stay easy to compare, but a SubTopic has nothing beneath it except questions (which
// this intentionally excludes) — so its own "hierarchy" is just its own name, one line.
export function buildHierarchyOnlyCopyText(node, kind, label) {
  if (kind === "subTopic") {
    return { text: label || "", count: label ? 1 : 0 };
  }
  const lines = [label];
  let count = 0;
  if (kind === "subject") {
    Object.keys(node).forEach(topic => {
      lines.push("\t" + topic);
      count++;
      Object.keys(node[topic]).forEach(subTopic => {
        lines.push("\t\t" + subTopic);
        count++;
      });
    });
  } else if (kind === "topic") {
    Object.keys(node).forEach(subTopic => {
      lines.push("\t" + subTopic);
      count++;
    });
  }
  return { text: lines.join("\n"), count };
}

// Requirement: two more copy modes alongside buildTreeCopyText()/buildHierarchyOnlyCopyText() —
// each row carries this node's own name plus its descendants' names (Topic/SubTopic/Question),
// tab-separated instead of indented, so a spreadsheet paste lines up in columns. Like the other
// tree-copy-btn builders, this is scoped to the node itself — a Topic's copy must NOT prepend its
// parent Subject, a SubTopic's must NOT prepend Subject/Topic — `label` is just this node's own
// name (subject/topic/subTopic, matching buildTreeCopyText()'s `label` param), not a full path.
export function buildStructureWithAnswerCopyText(node, kind, label) {
  const lines = [];
  if (kind === "subTopic") {
    node.forEach(q => lines.push([label, q.Question].join("\t")));
  } else if (kind === "subject") {
    Object.keys(node).forEach(topic => {
      Object.keys(node[topic]).forEach(subTopic => {
        node[topic][subTopic].forEach(q => {
          lines.push([label, topic, subTopic, q.Question].join("\t"));
        });
      });
    });
  } else if (kind === "topic") {
    Object.keys(node).forEach(subTopic => {
      node[subTopic].forEach(q => {
        lines.push([label, subTopic, q.Question].join("\t"));
      });
    });
  }
  return { text: lines.join("\n"), count: lines.length };
}

export function buildStructureOnlyCopyText(node, kind, label) {
  if (kind === "subTopic") {
    return { text: label + "\t" || "", count: label ? 1 : 0 };
  }
  const lines = [label];
  let count = 0;
  if (kind === "subject") {
    Object.keys(node).forEach(topic => {
      lines.push([label, topic, "\t"].join("\t"));
      count++;
      Object.keys(node[topic]).forEach(subTopic => {
        lines.push([label, topic, subTopic, "\t"].join("\t"));
        count++;
      });
    });
  } else if (kind === "topic") {
    Object.keys(node).forEach(subTopic => {
      lines.push([label, subTopic, "\t"].join("\t"));
      count++;
    });
  }
  return { text: lines.join("\n"), count };
}

export function formatTimer(totalSeconds) {
  const pad = n => String(n).padStart(2, "0");
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}
