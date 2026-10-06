/**
 * Session persistence.
 *
 * Two levels:
 *  - localStorage keeps the requirements, matches and expiry dates so a refresh
 *    does not lose your work. PDF bytes are never stored.
 *  - a project JSON file can be exported/imported to move work between
 *    machines. It stores file names and hashes, so re-adding the same PDFs
 *    restores the matches automatically.
 */

const SESSION_KEY = 'tdpb.session.v1';
const PROJECT_VERSION = 1;

function safeLocalStorage() {
  try {
    const probe = '__tdpb_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSession() {
  const store = safeLocalStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(payload) {
  const store = safeLocalStorage();
  if (!store) return false;
  try {
    store.setItem(SESSION_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearSession() {
  const store = safeLocalStorage();
  if (!store) return;
  try {
    store.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Serializable snapshot: no file bytes, only names/hashes for re-linking. */
export function makeProjectPayload({ tender, requirements, matches, expiryDates, files, lang, includeIndex }) {
  return {
    app: 'tender-document-package-builder',
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    lang,
    includeIndex,
    tender,
    requirements,
    matches,
    expiryDates,
    files: files.map((file) => ({
      name: file.name,
      size: file.size,
      hash: file.hash || null,
      pageCount: file.pageCount || null,
      readState: file.readState,
    })),
  };
}

/** Matches keyed by content hash, so re-adding identical files restores them. */
export function matchesByHash({ matches, files }) {
  const byId = new Map(files.map((file) => [file.id, file]));
  const out = {};
  for (const [requirementId, fileId] of Object.entries(matches || {})) {
    const file = byId.get(fileId);
    if (file && file.hash) {
      out[file.hash] = { requirementId, expiryDate: null };
    }
  }
  return out;
}

export function validateProjectPayload(value) {
  if (!value || typeof value !== 'object') return { ok: false, detail: 'not an object' };
  if (value.app !== 'tender-document-package-builder') return { ok: false, detail: 'unrecognised file' };
  if (!value.tender || typeof value.tender !== 'object') return { ok: false, detail: 'no tender section' };
  if (!Array.isArray(value.requirements)) return { ok: false, detail: 'no requirements list' };
  return { ok: true };
}