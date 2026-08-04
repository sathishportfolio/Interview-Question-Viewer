/* Cross-device sync via JSONBin.io — automatic push, with one manual Pull button (#pullSyncBtn)
 * for an on-demand refresh.
 *
 * - ensureSyncSetup() (called first thing in app.js, before any other startup code): on a device
 *   that has never provided both a Master Key and Bin ID, opens jsonbin.io/app/bins in a new tab
 *   and blocks (synchronous prompt() loop) until both are entered — sync is mandatory, not
 *   skippable. Returns immediately, no tab/prompt, once both are already stored locally.
 * - autoSyncOnLoad() (called once from app.js on startup, after ensureSyncSetup() has already
 *   guaranteed both values exist): silently pulls the latest cloud state and applies + reloads
 *   ONLY if it actually differs from what's already local (skips a pointless reload otherwise).
 * - installAutoPushWatcher() intercepts every localStorage.setItem/removeItem call for an
 *   "iqv_"-prefixed key — i.e. every piece of state this app persists (CSV data, filters, active
 *   question, temp mode, edit mode, flat-view, drag-drop-on, timer, file list) — and schedules a
 *   debounced (3s of quiet) background push. Catches this generically, from one place, instead
 *   of threading an explicit sync call through every mutating function across
 *   api.js/tree.js/stats.js/timer.js — current AND future persisted keys alike.
 * - Background pushes never prompt: prompt()/alert() are blocking modals that would otherwise
 *   steal focus mid-edit, so missing credentials at push time are silently skipped (logged to
 *   console) rather than interrupting. The one deliberate exception: the very first successful
 *   push, when no Bin ID exists yet, auto-creates the bin and DOES alert once with the new id —
 *   that's the one piece of information you have to manually carry to your other device, so it
 *   can't be silent.
 * - Every push/pull logs the compressed payload size against JSONBin's 100kb free-tier cap
 *   (logSyncSize()) — "<usedKB>KB / 100KB (<pct>% of cap used)" — so it's easy to see at a
 *   glance how much headroom is left before a future export might not fit even compressed. The
 *   same percentage also drives a small round badge (#syncUsageBadge, index.html, next to
 *   #pullSyncBtn — updateUsageBadge()): green under 90%, red at/above it. refreshUsageBadge()
 *   additionally computes it from local data alone (no network round trip) once on every
 *   autoSyncOnLoad(), so the badge has something to show immediately, not just after the first
 *   push/pull of the session.
 * - manualPull() (#pullSyncBtn, index.html, right after #copyProgressCsvBtn) is the one
 *   deliberately non-automatic action left — unlike the paths above it CAN prompt for missing
 *   credentials and always confirms before overwriting, since it's an explicit click, not a
 *   background/on-load trigger.
 *
 * History: tried npoint.io as a keyless alternative — its bins turned out read-only for new
 * accounts. Back to JSONBin.io, whose free-tier 100kb-per-bin cap is worked around by gzip-
 * compressing the JSON payload (native CompressionStream, no library) before base64-encoding it
 * into the bin — a ~190KB export measured at ~13KB compressed in testing.
 *
 * Security note (explicitly out of scope per user request — personal use only): the Master Key
 * lives only in this browser's own localStorage, under a key OUTSIDE the "iqv_" namespace (so it
 * never gets swept into the synced payload, and never gets written to source/version control —
 * this repo is public on GitHub). Sent only to api.jsonbin.io, over HTTPS.
 */

const LS_SYNC_KEY = "jbsync_masterkey";
const LS_SYNC_BIN = "jbsync_binid";
const IQV_PREFIX = "iqv_";
const JSONBIN_BINS_URL = "https://jsonbin.io/app/bins";
const API_BASE = "https://api.jsonbin.io/v3/b";
const PUSH_DEBOUNCE_MS = 3000;

// Captured before installAutoPushWatcher() ever patches localStorage.setItem/removeItem, so
// applySyncPayload() (after a Pull) and the prompt-storing helpers below can always write
// directly without re-triggering the auto-push watcher on themselves.
const rawSetItem = localStorage.setItem.bind(localStorage);
const rawRemoveItem = localStorage.removeItem.bind(localStorage);

// JSONBin's free-tier per-bin cap (see file header — this whole gzip step exists because of it).
const JSONBIN_CAP_KB = 100;

// `bodyLength` is the actual byte count of the JSON body sent/received for the bin's stored
// value (the `{ gz: "<base64>" }` envelope), not just the base64 string alone.
function logSyncSize(direction, bodyLength) {
  const usedKb = bodyLength / 1024;
  const pct = usedKb / JSONBIN_CAP_KB * 100;
  console.log("[sync] " + direction + ": " + usedKb.toFixed(1) + "KB / " + JSONBIN_CAP_KB + "KB (" + pct.toFixed(1) + "% of JSONBin free-tier cap used)");
  updateUsageBadge(pct);
}

// Requirement: small round badge next to #pullSyncBtn (index.html) showing this percentage at a
// glance — green under 90%, red at/above it. Every push/pull already runs through logSyncSize()
// above, so hooking the badge update in there covers both automatically; refreshUsageBadge()
// below additionally computes it from local data alone (no network round trip) so the badge has
// something to show immediately on load, before any push/pull has happened yet this session.
function updateUsageBadge(pct) {
  const badge = document.getElementById("syncUsageBadge");
  if (!badge) return;
  const rounded = Math.round(pct);
  badge.textContent = rounded + "%";
  badge.classList.toggle("usage-high", pct >= 90);
  badge.title = "JSONBin free-tier usage: " + pct.toFixed(1) + "% of " + JSONBIN_CAP_KB + "KB cap";
  badge.style.display = "inline-flex";
}

async function refreshUsageBadge() {
  try {
    const gz = await gzipToBase64(JSON.stringify(collectSyncPayload()));
    logSyncSize("local", JSON.stringify({ gz }).length);
  } catch (err) {
    // Compression unsupported or failed — badge just stays hidden, nothing else depends on it.
    console.error("[sync] usage badge: couldn't compute local size —", err.message);
  }
}

function getMasterKey() {
  return localStorage.getItem(LS_SYNC_KEY) || "";
}

function ensureMasterKey() {
  let key = getMasterKey();
  if (key) return key;
  key = (prompt(
    "Enter your JSONBin.io Master Key to enable automatic cross-device sync (leave blank to skip sync entirely — you won't be asked again).\n\n" +
    "Stored only in this browser's localStorage — never written to any file in this project, " +
    "and only ever sent to api.jsonbin.io."
  ) || "").trim();
  if (key) rawSetItem(LS_SYNC_KEY, key);
  return key;
}

function getBinId() {
  return localStorage.getItem(LS_SYNC_BIN) || "";
}

function ensureBinId() {
  let id = getBinId();
  if (id) return id;
  id = (prompt(
    "Enter the sync Bin ID (shown after your first successful sync from another device) — " +
    "leave blank if this is the very first device you're setting up sync on:"
  ) || "").trim();
  if (id) rawSetItem(LS_SYNC_BIN, id);
  return id;
}

// Requirement: sync ALL localStorage keys this app uses — every key happens to share the
// "iqv_" prefix (see LS_* constants, state.js), so a generic prefix scan covers every current
// AND future such key without needing to enumerate them by hand (per-file keys especially,
// since the file list is open-ended).
function collectSyncPayload() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(IQV_PREFIX)) out[k] = localStorage.getItem(k);
  }
  return out;
}

// Same flat-object shape both sides always produce (localStorage values are always strings), so
// a sorted-key JSON.stringify is enough for a reliable "did anything actually change" comparison
// — object key ENUMERATION order can differ between two independently-built payloads even when
// their contents are identical, which would otherwise make a plain JSON.stringify() comparison
// false-positive as "different".
function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

// Requirement: full-state sync, not a merge — replaces every "iqv_" key with exactly what's in
// `payload`, including REMOVING local-only keys that aren't in it (e.g. a CSV loaded only on
// this device, never pushed), so both devices converge to the identical environment rather than
// accumulating a union of the two.
function applySyncPayload(payload) {
  const existingKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(IQV_PREFIX)) existingKeys.push(k);
  }
  existingKeys.forEach(k => { if (!(k in payload)) rawRemoveItem(k); });
  Object.keys(payload).forEach(k => rawSetItem(k, payload[k]));
}

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000; // avoid a giant argument list to String.fromCharCode on large payloads
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Requirement: shrink the payload well below JSONBin's 100kb free-tier cap — gzip via the
// browser's native CompressionStream (no external library), then base64-encode the compressed
// bytes into a tiny JSON envelope `{ gz: "<base64>" }`, since JSONBin's API only accepts JSON
// bodies (raw binary isn't an option). Standard gzip (RFC 1952) — same format Node's zlib and
// every other gzip implementation produces/consumes, verified against api.jsonbin.io directly.
async function gzipToBase64(str) {
  if (typeof CompressionStream === "undefined") {
    throw new Error("This browser doesn't support compression (CompressionStream) — try a recent Chrome, Edge, or Firefox.");
  }
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return arrayBufferToBase64(buf);
}

async function gunzipFromBase64(b64) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser doesn't support decompression (DecompressionStream) — try a recent Chrome, Edge, or Firefox.");
  }
  const buf = base64ToArrayBuffer(b64);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function jsonBinRequest(method, url, masterKey, body) {
  const res = await fetch(url, {
    method,
    headers: Object.assign(
      { "X-Master-Key": masterKey },
      body ? { "Content-Type": "application/json" } : {}
    ),
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).message || ""; } catch (e) { /* ignore */ }
    throw new Error(res.status + (detail ? ": " + detail : ""));
  }
  return res.json();
}

let pushTimer = null;

function scheduleAutoPush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(backgroundPush, PUSH_DEBOUNCE_MS);
}

// Requirement: never prompt from here — this fires from a debounced background timer, possibly
// while the user is mid-edit elsewhere, and prompt()/alert() would steal focus. Missing
// credentials just mean sync hasn't been set up (or was declined) — skip quietly.
async function backgroundPush() {
  const masterKey = getMasterKey();
  if (!masterKey) return;

  const rawJson = JSON.stringify(collectSyncPayload());
  let gz;
  try {
    gz = await gzipToBase64(rawJson);
  } catch (err) {
    console.error("[sync] push: compression failed —", err.message);
    return;
  }
  const envelope = { gz };
  logSyncSize("push", JSON.stringify(envelope).length);

  const binId = getBinId();
  try {
    if (!binId) {
      const data = await jsonBinRequest("POST", API_BASE, masterKey, envelope);
      rawSetItem(LS_SYNC_BIN, data.metadata.id);
      alert(
        "Cross-device sync is set up — created your sync bin and pushed this device's data.\n\n" +
        "Bin ID (enter this on your other device the first time it starts sync there):\n" + data.metadata.id
      );
    } else {
      await jsonBinRequest("PUT", API_BASE + "/" + binId, masterKey, envelope);
    }
  } catch (err) {
    console.error("[sync] push failed —", err.message);
  }
}

// Fetches + decompresses + applies the cloud state if it differs from local. Returns true if it
// applied a change (caller should reload), false if already up to date. Shared by silentPull()
// (autoSyncOnLoad, no confirm) and manualPull() (#pullSyncBtn, confirms first) below.
async function doPull(masterKey, binId) {
  const data = await jsonBinRequest("GET", API_BASE + "/" + binId + "/latest", masterKey);
  const record = data.record;
  if (!record || typeof record.gz !== "string") throw new Error("bin doesn't contain the expected compressed payload");
  logSyncSize("pull", JSON.stringify({ gz: record.gz }).length);
  const payload = JSON.parse(await gunzipFromBase64(record.gz));
  if (stableStringify(payload) === stableStringify(collectSyncPayload())) return false; // already current
  applySyncPayload(payload);
  return true;
}

async function silentPull(masterKey, binId) {
  try {
    // Requirement: a full reload, not just an in-memory re-render — every module's already-read
    // copies of localStorage-backed flags (state.tempMode, state.editModeOn, etc., all read once
    // at initApp()) need to re-initialize from the just-overwritten localStorage, which a reload
    // guarantees far more simply/reliably than re-running each module's init logic by hand.
    if (await doPull(masterKey, binId)) location.reload();
  } catch (err) {
    alert("Auto-sync: couldn't pull from the cloud (" + err.message + "). Your local data was NOT changed.");
  }
}

// Requirement: #pullSyncBtn (index.html, right after #copyProgressCsvBtn) — a manual, on-demand
// Pull for when you don't want to wait for autoSyncOnLoad()'s once-per-device check, or just want
// to force a refresh right now. Unlike the fully-silent automatic paths (see file header), this
// is a deliberate user-initiated action, so it's allowed to prompt for missing credentials and
// shows a confirm before overwriting local data, plus explicit feedback either way (changed vs.
// already up to date) since a silent no-op would otherwise look like the button did nothing.
export async function manualPull() {
  const masterKey = ensureMasterKey();
  if (!masterKey) return;
  const binId = ensureBinId();
  if (!binId) return;

  if (!confirm(
    "Pull the latest data from the cloud now?\n\nThis will OVERWRITE all local data on this " +
    "device — every CSV file, its progress, filters, and app settings — with whatever is " +
    "currently in the sync bin. This cannot be undone."
  )) return;

  try {
    if (await doPull(masterKey, binId)) {
      location.reload();
    } else {
      alert("Already up to date — no changes from the cloud.");
    }
  } catch (err) {
    alert("Pull failed (" + err.message + "). Your local data was NOT changed.");
  }
}

// Requirement: catch every current AND future "iqv_" localStorage write app-wide from one place
// — intercepts the two built-in methods directly rather than threading a sync call through every
// mutating function scattered across api.js/tree.js/stats.js/timer.js.
function installAutoPushWatcher() {
  localStorage.setItem = function (key, value) {
    rawSetItem(key, value);
    if (key.startsWith(IQV_PREFIX)) scheduleAutoPush();
  };
  localStorage.removeItem = function (key) {
    rawRemoveItem(key);
    if (key.startsWith(IQV_PREFIX)) scheduleAutoPush();
  };
}

// Requirement: sync is now mandatory, not opt-in — on a device that has never provided both a
// Master Key and Bin ID, block all further app startup behind a blocking prompt() loop (prompt()
// is synchronous, so this halts the rest of app.js's top-to-bottom module execution until both
// values are in hand) instead of the old "prompt once, skip forever if left blank" flow. Opens
// jsonbin.io/app/bins in a new tab first so the user has somewhere to find/create their Master
// Key and bin without leaving this page. A device that already has both stored (every load after
// the first) returns immediately — no tab, no prompt.
export function ensureSyncSetup() {
  let masterKey = getMasterKey();
  let binId = getBinId();
  if (masterKey && binId) return;

  window.open(JSONBIN_BINS_URL, "_blank", "noopener");

  while (!masterKey) {
    masterKey = (prompt(
      "Setup required before you can use this app: enter your JSONBin.io Master Key.\n\n" +
      "A new tab was opened to jsonbin.io/app/bins — sign in (or create a free account) and " +
      "copy your Master Key from there.\n\n" +
      "Stored only in this browser's localStorage; only ever sent to api.jsonbin.io."
    ) || "").trim();
  }
  rawSetItem(LS_SYNC_KEY, masterKey);

  while (!binId) {
    binId = (prompt(
      "Now enter your sync Bin ID.\n\n" +
      "First device ever? Create a new bin at the jsonbin.io/app/bins tab just opened and paste " +
      "its Bin ID here. Adding another device to existing sync? Enter that same Bin ID."
    ) || "").trim();
  }
  rawSetItem(LS_SYNC_BIN, binId);
}

export async function autoSyncOnLoad() {
  installAutoPushWatcher();

  // ensureSyncSetup() (called earlier, at the very top of app.js) guarantees both are already
  // present by the time this runs — this re-read (rather than trusting a passed-in value) just
  // stays consistent with how every other getter here works.
  const masterKey = getMasterKey();
  const binId = getBinId();
  if (masterKey && binId) await silentPull(masterKey, binId);

  // Requirement: the usage badge (#syncUsageBadge, index.html) should show something as soon as
  // the app loads, not just after the first push/pull of this session. If silentPull() just
  // triggered a reload above, this becomes a no-op (the page is already navigating away) — no
  // separate guard needed for that.
  await refreshUsageBadge();
}
