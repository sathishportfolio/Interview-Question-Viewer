/**
 * Centralized application state (single mutable object) and the localStorage-key /
 * validation constants used throughout the app. Other modules do:
 *   import { state } from './state.js';
 *   state.rawData = [...];
 * Mutating properties on the shared `state` object is how state changes propagate —
 * there is no event bus / pub-sub; modules call render() (components/tree.js) directly
 * after mutating state to reflect changes in the DOM.
 */

export const state = {
  rawData: [],              // array of row objects as parsed from CSV
  grouped: {},               // Subject -> Topic -> SubTopic -> [questions]
  activeFilters: { Subject: [], Topic: [], SubTopic: [], Status: [] },
  flatGroupView: false,     // when true, render() shows a flat Subject/Topic/SubTopic-path
                              // list of question accordions (renderFlatGroupedView(), tree.js)
                              // instead of the nested Subject > Topic > SubTopic accordion tree
  timerSeconds: 0,
  timerInterval: null,
  timerShouldPersist: false, // true from Start until Reset; controls whether we write to storage
  currentFileName: null,
  tempMode: true,
  expandDirection: "first",  // "first" normally, "last" when tempMode is on
  scrollTargetEl: null,
  pendingFocusQid: null,     // set before render() to auto-expand + scroll to a specific question's accordion chain
  editModeOn: false,         // mirrors editModeToggle; while true, render() skips first/last auto-expand
  dragDropOn: true,          // mirrors #dragDropToggleBtn (stats.js); independent of editModeOn —
                              // while false, body.drag-drop-off (style.css) hides every .drag-handle,
                              // which also prevents Sortable from starting a drag (handle-based gating,
                              // same mechanism editModeOn used to use for drag handles)
  searchableQuestions: [],   // the current filtered question list, for the live search box
  badgeRefs: {},             // key -> { holder: <span>, node: topics|subTopics|questions[] } for live badge sync
  emptyGroups: [],           // [{Subject, Topic, SubTopic}] — Subject/Topic/SubTopic headers kept
                              // alive with zero real rows beneath them (Topic/SubTopic null for a
                              // shallower empty group). See groupData()/markGroupEmpty() in utils.js.
  activeQuestion: null       // {Subject, Topic, SubTopic, Question} identifying the single globally
                              // "flagged" question (at most one at a time), or null. Identified by
                              // content, not _id, since _id is regenerated every load/switch
                              // (see readFileData()/processParsedResults() in api.js) and so can't
                              // survive a reload. See setActiveQuestion()/clearActiveQuestion() in
                              // js/components/tree.js.
};

export const LS_TEMP_MODE = "iqv_temp_mode";
export const LS_TIMER = "iqv_timer_seconds";
export const LS_EDIT_MODE_ON = "iqv_edit_mode_on";
export const LS_FLAT_GROUP_VIEW = "iqv_flat_group_view";
export const LS_DRAG_DROP_ON = "iqv_drag_drop_on";
export const LS_FILE_LIST = "iqv_files";
export const LS_ACTIVE_FILE = "iqv_active";
export const LS_DATA_PREFIX = "iqv_data_";
export const LS_FILTER_PREFIX = "iqv_filters_";
export const LS_EMPTY_PREFIX = "iqv_empty_";
export const LS_ACTIVE_QUESTION_PREFIX = "iqv_active_question_";

export const REQUIRED_COLUMNS = ["Subject", "Topic", "SubTopic", "Question", "Answer", "Done", "ReviewLater"];

/** Duration (ms) the shared flash-highlight overlay stays visible before auto-fading. */
export const FLASH_DURATION_MS = 10000;
