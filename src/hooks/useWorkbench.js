import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildChecklist, summarizeChecklist, blockingReasons } from '../lib/status.js';
import { displayTitle, parseRequirements, sanitizeFileBase } from '../lib/requirements.js';
import { inspectPdf, sha256Hex, looksLikePdfName, fileHasPdfMagic, READ_ERROR } from '../lib/pdfRead.js';
import { suggestMatches } from '../lib/matchSuggestions.js';
import {
  SEAL_DEFAULT_SCOPE,
  SEAL_DEFAULT_WIDTH_MM,
  SEAL_MAX_BYTES,
  SEAL_MAX_MB,
  classifySealBytes,
  normalizeSealScope,
  normalizeSealWidth,
} from '../lib/sealImage.js';
import {
  loadSession,
  saveSession,
  clearSession,
  makeProjectPayload,
  matchesByHash,
  validateProjectPayload,
} from '../lib/projectStore.js';

export const LIMITS = {
  maxFiles: 30,
  maxBytes: 50 * 1024 * 1024,
  maxSizeMb: 50,
};

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

const EMPTY = {
  tender: null,
  requirements: [],
  deadlineValid: true,
  loadedAt: null,
  files: [],
  matches: {},
  expiryDates: {},
};

/**
 * All app state and the rules that change it.
 *
 * Statuses are never stored. They are derived from (requirements, matches,
 * expiry dates, deadline) with a pure function, so they can never fall out of
 * sync with what the user sees.
 */
export default function useWorkbench(lang, t, notify) {
  const [tender, setTender] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [deadlineValid, setDeadlineValid] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);
  const [files, setFiles] = useState([]);
  const [matches, setMatches] = useState({});
  const [expiryDates, setExpiryDates] = useState({});
  const [includeIndex, setIncludeIndex] = useState(true);
  // Optional company seal: { data, format, name, scope, widthMm }.
  // The bytes stay in memory for this session only, never in storage.
  const [seal, setSeal] = useState(null);
  const [restorable, setRestorable] = useState(null);
  // Non-PDF picks stay visible as a dismissible red alert (not just a toast).
  const [rejected, setRejected] = useState([]);

  const requirementsById = useMemo(() => {
    const map = {};
    for (const requirement of requirements) {
      map[requirement.id] = { ...requirement, displayTitle: displayTitle(requirement, lang) };
    }
    return map;
  }, [requirements, lang]);

  const orderedRequirements = useMemo(
    () => requirements.map((r) => requirementsById[r.id]),
    [requirements, requirementsById],
  );

  const filesById = useMemo(() => {
    const map = {};
    for (const file of files) map[file.id] = file;
    return map;
  }, [files]);

  const deadline = tender && tender.submission_deadline ? tender.submission_deadline : '';

  const checklist = useMemo(
    () =>
      buildChecklist({
        requirements: orderedRequirements,
        matches,
        filesById,
        expiryDates,
        deadline,
      }),
    [orderedRequirements, matches, filesById, expiryDates, deadline],
  );

  const summary = useMemo(() => summarizeChecklist(checklist), [checklist]);
  const reasons = useMemo(() => blockingReasons(checklist, t), [checklist, t]);

  /** Groups of file ids that share identical content. */
  const duplicates = useMemo(() => {
    const groups = new Map();
    for (const file of files) {
      if (!file.hash) continue;
      const key = file.hash;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(file.id);
    }
    return Array.from(groups.values());
  }, [files]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + (file.size || 0), 0), [files]);

  const hasTender = Boolean(tender);
  const anyMatched = summary.matched > 0;
  const ready = hasTender && anyMatched && summary.blocking === 0;

  /* ------------------------------------------------------------- loading */

  const applyParsed = useCallback((parsed, sourceLabel) => {
    if (!parsed.ok) return false;
    setTender(parsed.tender);
    setRequirements(parsed.requirements);
    setDeadlineValid(parsed.deadlineValid);
    setLoadedAt(sourceLabel || new Date().toISOString().slice(0, 10));
    setMatches({});
    setExpiryDates({});
    if (!parsed.deadlineValid) notify('warn', 'msg.noDeadline');
    return true;
  }, [notify]);

  const loadRequirementsText = useCallback(
    async (text, label) => {
      let raw;
      try {
        raw = JSON.parse(text);
      } catch (error) {
        notify('bad', 'msg.jsonInvalid', { detail: error.message });
        return false;
      }
      const parsed = parseRequirements(raw);
      if (!parsed.ok) {
        notify('bad', 'msg.jsonShape', { detail: parsed.error });
        return false;
      }
      return applyParsed(parsed, label);
    },
    [applyParsed, notify],
  );

  const loadRequirementsFile = useCallback(
    async (file) => {
      const text = await file.text();
      return loadRequirementsText(text, new Date().toISOString().slice(0, 10));
    },
    [loadRequirementsText],
  );

  /* --------------------------------------------------------------- files */

  // Restoring a saved session cannot restore PDF bytes, so matches are parked
  // by content hash and re-applied as the same files are added again.
  const pendingByHashRef = useRef(null);
  const reapplyPendingMatchesRef = useRef(() => {});

  const addFiles = useCallback(
    async (incoming) => {
      const list = Array.from(incoming || []);
      if (list.length === 0) return;

      const notPdf = [];
      const tooBig = [];
      const accepted = [];
      let runningTotal = totalSize;
      let overflowed = 0;

      for (const file of list) {
        if (!looksLikePdfName(file.name, file.type)) {
          notPdf.push(file.name);
          continue;
        }
        if (files.length + accepted.length >= LIMITS.maxFiles) {
          overflowed += 1;
          continue;
        }
        if (runningTotal + file.size > LIMITS.maxBytes) {
          tooBig.push(file.name);
          continue;
        }
        runningTotal += file.size;
        accepted.push(file);
      }

      if (tooBig.length) {
        notify('warn', 'msg.tooBig', {
          max: `${LIMITS.maxSizeMb} MB`,
          names: tooBig.join(', '),
        });
      }
      if (overflowed > 0) notify('warn', 'msg.tooMany', { max: LIMITS.maxFiles, count: overflowed });

      // The extension alone cannot be trusted: a PNG renamed to "license.pdf"
      // must be rejected as a non-PDF now, not listed as a "broken" file later.
      const headerResults = await Promise.all(accepted.map((file) => fileHasPdfMagic(file)));
      const realPdfs = [];
      for (let i = 0; i < accepted.length; i += 1) {
        if (headerResults[i]) realPdfs.push(accepted[i]);
        else notPdf.push(accepted[i].name);
      }
      if (notPdf.length) {
        notify('warn', 'msg.notPdf', { names: notPdf.join(', ') });
        const stamped = Date.now();
        setRejected((current) => [
          ...current,
          ...notPdf.map((name, i) => ({ id: `rejected-${stamped}-${i}`, name, kind: 'notpdf' })),
        ]);
      }
      accepted.length = 0;
      accepted.push(...realPdfs);

      const entries = accepted.map((file) => ({
        id: nextId('file'),
        file,
        name: file.name,
        size: file.size,
        data: null,
        readState: 'reading',
        pageCount: null,
        hash: null,
        readError: null,
      }));
      if (entries.length === 0) return;

      setFiles((current) => [...current, ...entries.map(({ file: _file, ...rest }) => rest)]);

      // Read each file: bytes -> SHA-256 -> page count. Independent per file.
      await Promise.all(
        entries.map(async (entry) => {
          const patch = { data: null, hash: null, readState: 'error', readError: READ_ERROR.UNKNOWN };
          try {
            const buffer = await entry.file.arrayBuffer();
            patch.data = new Uint8Array(buffer);
            const hash = await sha256Hex(buffer);
            patch.hash = hash;
            const inspection = await inspectPdf(patch.data);
            if (inspection.ok) {
              patch.readState = 'ready';
              patch.pageCount = inspection.pageCount;
              patch.firstPage = inspection.firstPage;
              patch.readError = null;
            } else {
              patch.readError = inspection.kind;
            }
          } catch (error) {
            patch.detail = String(error && error.message ? error.message : error);
          }
          // Damaged or password-protected files are never added: they are
          // surfaced as a clear red message naming the file instead.
          if (patch.readState === 'error') {
            setFiles((current) => current.filter((file) => file.id !== entry.id));
            const kind = patch.readError === READ_ERROR.ENCRYPTED ? 'encrypted' : 'broken';
            setRejected((current) => [
              ...current,
              { id: `rejected-${Date.now()}-${entry.id}`, name: entry.name, kind },
            ]);
            notify('bad', kind === 'encrypted' ? 'msg.pdfEncrypted' : 'msg.pdfBroken', {
              name: entry.name,
            });
            return;
          }
          setFiles((current) =>
            current.map((file) => (file.id === entry.id ? { ...file, ...patch } : file)),
          );
          if (patch.readState === 'ready' && patch.hash) {
            reapplyPendingMatchesRef.current(entry.id, patch.hash);
          }
        }),
      );
    },
    [files.length, totalSize, notify, t],
  );

  const removeFile = useCallback((fileId) => {
    setFiles((current) => current.filter((file) => file.id !== fileId));
    setMatches((current) => {
      if (!Object.values(current).includes(fileId)) return current;
      const next = {};
      for (const [requirementId, value] of Object.entries(current)) {
        if (value !== fileId) next[requirementId] = value;
      }
      return next;
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setMatches({});
  }, []);

  /* ------------------------------------------------------------- matching */

  const requirementOfFile = useCallback(
    (fileId) => Object.keys(matches).find((id) => matches[id] === fileId) || null,
    [matches],
  );

  /**
   * Rules for putting a file into a document:
   *  - the file must be readable
   *  - it must not already be in another document (one file, one document)
   *  - it must not be a content duplicate of a file sitting in another
   *    document, which is what keeps duplicates from being spread around
   * Swapping is not attempted: the user can undo and re-pick instead, and
   * `RequirementsList` disables the options that would be refused.
   */
  const canMatch = useCallback(
    (fileId, requirementId) => {
      const file = filesById[fileId];
      if (!file || file.readState !== 'ready') return false;
      const usedBy = requirementOfFile(fileId);
      if (usedBy && usedBy !== requirementId) return false;

      const group = duplicates.find((ids) => ids.includes(fileId));
      if (group && group.length > 1) {
        const twin = group.find(
          (id) => id !== fileId && requirementOfFile(id) && requirementOfFile(id) !== requirementId,
        );
        if (twin) {
          const twinFile = filesById[twin];
          notify('warn', 'msg.duplicateBlocked', {
            name: file.name,
            other: twinFile ? twinFile.name : '',
          });
          return false;
        }
      }
      return true;
    },
    [filesById, duplicates, requirementOfFile, notify],
  );

  const setMatch = useCallback(
    (requirementId, fileId) => {
      if (!fileId) {
        setMatches((current) => {
          if (!current[requirementId]) return current;
          const next = { ...current };
          delete next[requirementId];
          return next;
        });
        return;
      }
      if (!canMatch(fileId, requirementId)) return;
      setMatches((current) => {
        const next = { ...current };
        for (const [otherRequirementId, value] of Object.entries(current)) {
          if (value === fileId && otherRequirementId !== requirementId) {
            delete next[otherRequirementId];
          }
        }
        next[requirementId] = fileId;
        return next;
      });
    },
    [canMatch],
  );

  const setExpiry = useCallback((requirementId, value) => {
    setExpiryDates((current) => {
      const next = { ...current };
      if (!value) delete next[requirementId];
      else next[requirementId] = value;
      return next;
    });
  }, []);

  const applySuggestions = useCallback(() => {
    const suggestions = suggestMatches({ files, requirements: orderedRequirements });
    if (suggestions.length === 0) {
      notify('info', 'step3.autoMatchNone');
      return 0;
    }
    setMatches((current) => {
      const next = { ...current };
      const usedRequirements = new Set(Object.keys(next));
      const usedFiles = new Set(Object.values(next));
      for (const suggestion of suggestions) {
        if (usedFiles.has(suggestion.fileId) || usedRequirements.has(suggestion.requirementId)) continue;
        next[suggestion.requirementId] = suggestion.fileId;
        usedFiles.add(suggestion.fileId);
        usedRequirements.add(suggestion.requirementId);
      }
      return next;
    });
    notify('info', 'step3.autoMatchApplied', { count: suggestions.length });
    return suggestions.length;
  }, [files, orderedRequirements, notify]);

  /* ---------------------------------------------------------------- seal */

  const loadSeal = useCallback(
    async (file) => {
      if (!file) return false;
      if (file.size > SEAL_MAX_BYTES) {
        notify('bad', 'seal.tooBig', { name: file.name, max: `${SEAL_MAX_MB} MB` });
        return false;
      }
      let bytes;
      try {
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch {
        notify('bad', 'seal.readError', { name: file.name });
        return false;
      }
      const format = classifySealBytes(bytes);
      if (!format) {
        notify('bad', 'seal.unsupported', { name: file.name });
        return false;
      }
      setSeal({
        data: bytes,
        format,
        name: file.name,
        scope: SEAL_DEFAULT_SCOPE,
        widthMm: SEAL_DEFAULT_WIDTH_MM,
      });
      notify('info', 'seal.added', { name: file.name });
      return true;
    },
    [notify],
  );

  const clearSeal = useCallback(() => setSeal(null), []);

  const setSealScope = useCallback((scope) => {
    setSeal((current) => (current ? { ...current, scope: normalizeSealScope(scope) } : current));
  }, []);

  const setSealWidth = useCallback((widthMm) => {
    setSeal((current) => (current ? { ...current, widthMm: normalizeSealWidth(widthMm) } : current));
  }, []);

  /* -------------------------------------------------------------- session */

  useEffect(() => {
    const stored = loadSession();
    if (stored && stored.tender) setRestorable(stored);
  }, []);

  useEffect(() => {
    if (!tender) return;
    saveSession({
      tender,
      requirements,
      matches,
      expiryDates,
      hashMatches: matchesByHash({ matches, files }),
      includeIndex,
      savedAt: new Date().toISOString(),
    });
  }, [tender, requirements, matches, expiryDates, files, includeIndex]);

  const restoreSession = useCallback(
    (stored, { announce = true } = {}) => {
      const parsed = parseRequirements({
        tender: stored.tender,
        requirements: stored.requirements,
      });
      if (!parsed.ok) {
        notify('bad', 'msg.projectInvalid', { detail: parsed.error });
        return false;
      }
      setTender(parsed.tender);
      setRequirements(parsed.requirements);
      setDeadlineValid(parsed.deadlineValid);
      setLoadedAt(stored.savedAt ? stored.savedAt.slice(0, 10) : null);
      setMatches({});
      setExpiryDates({ ...(stored.expiryDates || {}) });
      setIncludeIndex(stored.includeIndex !== false);
      pendingByHashRef.current = { ...(stored.hashMatches || {}) };
      setRestorable(null);
      if (announce) notify('info', 'msg.restored');
      return true;
    },
    [notify],
  );

  /** Called after files finish reading: re-apply matches from a restored session. */
  const reapplyPendingMatches = useCallback(
    (fileId, hash) => {
      const pending = pendingByHashRef.current;
      if (!pending || !hash || !pending[hash]) return;
      const { requirementId } = pending[hash];
      if (!requirementsById[requirementId]) return;
      delete pending[hash];
      setMatches((current) => {
        if (Object.values(current).includes(fileId)) return current;
        if (current[requirementId]) return current;
        return { ...current, [requirementId]: fileId };
      });
    },
    [requirementsById],
  );

  // addFiles is defined before reapplyPendingMatches, so it reads the callback
  // through a ref instead of capturing a stale one.
  reapplyPendingMatchesRef.current = reapplyPendingMatches;

  const reset = useCallback(() => {
    setTender(null);
    setRequirements([]);
    setFiles([]);
    setMatches({});
    setExpiryDates({});
    setLoadedAt(null);
    setRestorable(null);
    setRejected([]);
    setSeal(null);
    pendingByHashRef.current = null;
    clearSession();
  }, []);

  const projectPayload = useCallback(
    () =>
      makeProjectPayload({
        tender,
        requirements,
        matches,
        expiryDates,
        files,
        includeIndex,
        lang,
      }),
    [tender, requirements, matches, expiryDates, files, includeIndex, lang],
  );

  const applyProject = useCallback(
    (payload) => {
      const check = validateProjectPayload(payload);
      if (!check.ok) {
        notify('bad', 'msg.projectInvalid', { detail: check.detail });
        return false;
      }
      // The caller reports "project loaded" itself, so stay quiet here.
      return restoreSession(
        {
          tender: payload.tender,
          requirements: payload.requirements,
          expiryDates: payload.expiryDates || {},
          hashMatches: matchesByHash({
            matches: payload.matches || {},
            files: (payload.files || []).map((file, index) => ({
              id: `saved-${index}`,
              hash: file.hash,
            })),
          }),
          includeIndex: payload.includeIndex,
          savedAt: payload.savedAt,
        },
        { announce: false },
      );
    },
    [notify, restoreSession],
  );

  const downloadBaseName = sanitizeFileBase(tender ? tender.tender_id : 'tender');

  const dismissRejected = useCallback((id) => {
    setRejected((current) => (id ? current.filter((item) => item.id !== id) : []));
  }, []);

  return {
    tender,
    requirements: orderedRequirements,
    requirementsById,
    deadline,
    deadlineValid,
    loadedAt,
    files,
    filesById,
    matches,
    expiryDates,
    duplicates,
    checklist,
    summary,
    reasons,
    totalSize,
    hasTender,
    anyMatched,
    ready,
    includeIndex,
    setIncludeIndex,
    seal,
    loadSeal,
    clearSeal,
    setSealScope,
    setSealWidth,
    limits: LIMITS,
    restorable,
    rejected,
    dismissRejected,
    loadRequirementsText,
    loadRequirementsFile,
    addFiles,
    removeFile,
    clearFiles,
    setMatch,
    canMatch,
    setExpiry,
    applySuggestions,
    restoreSession,
    reapplyPendingMatches,
    reset,
    projectPayload,
    applyProject,
    downloadBaseName,
  };
}