/* Auto-generated module split from InterviewQuestionViewer_v24.html — verify in a browser before trusting this. */

export function initPersistedToggle(checkboxId, storageKey, applyFn) {
  const checkbox = document.getElementById(checkboxId);
  const checked = localStorage.getItem(storageKey) === "true"; // missing key -> false (unchecked)
  checkbox.checked = checked;
  applyFn(checked);
  checkbox.addEventListener("change", e => {
    localStorage.setItem(storageKey, String(e.target.checked));
    applyFn(e.target.checked);
  });
}
