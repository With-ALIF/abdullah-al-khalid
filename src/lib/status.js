import { isBefore } from './dates.js';

export const STATUS = {
  MISSING: 'missing',
  EXPIRY_NEEDED: 'expiry_needed',
  EXPIRED: 'expired',
  NOT_PROVIDED: 'not_provided',
  OK: 'ok',
};

export const BLOCKING_STATUSES = new Set([STATUS.MISSING, STATUS.EXPIRY_NEEDED, STATUS.EXPIRED]);

export function isBlocking(status) {
  return BLOCKING_STATUSES.has(status);
}

/**
 * The single source of truth for a requirement's status.
 *
 * Rules, in priority order:
 *  - no file matched  -> Missing (mandatory) / Not provided (optional)
 *  - file matched, needs expiry, no date -> Expiry date needed
 *  - file matched, expiry before the submission deadline -> Expired
 *  - otherwise -> OK. An expiry exactly on the deadline day is still OK.
 *
 * Pure: same inputs always give the same output, so the UI can recompute on
 * every change without any stored status drifting out of sync.
 */
export function computeStatus({ requirement, file, expiryDate, deadline }) {
  if (!file) {
    return requirement.mandatory ? STATUS.MISSING : STATUS.NOT_PROVIDED;
  }
  if (requirement.has_expiry) {
    if (!expiryDate) return STATUS.EXPIRY_NEEDED;
    if (isBefore(expiryDate, deadline)) return STATUS.EXPIRED;
  }
  return STATUS.OK;
}

/**
 * Build the full per-requirement view model. Pure.
 * `matches` maps requirementId -> fileId, `filesById` maps fileId -> file.
 */
export function buildChecklist({ requirements, matches, filesById, expiryDates, deadline }) {
  return requirements.map((requirement) => {
    const fileId = matches[requirement.id];
    const file = fileId ? filesById[fileId] : undefined;
    const expiryDate = expiryDates[requirement.id] || '';
    const status = computeStatus({ requirement, file, expiryDate, deadline });
    return {
      requirement,
      file,
      fileId,
      expiryDate,
      status,
      blocking: isBlocking(status),
      included: Boolean(file),
    };
  });
}

export function summarizeChecklist(checklist) {
  const summary = {
    total: checklist.length,
    matched: 0,
    ok: 0,
    missing: 0,
    expiryNeeded: 0,
    expired: 0,
    notProvided: 0,
    blocking: 0,
  };
  for (const row of checklist) {
    if (row.file) summary.matched += 1;
    if (row.blocking) summary.blocking += 1;
    if (row.status === STATUS.OK) summary.ok += 1;
    else if (row.status === STATUS.MISSING) summary.missing += 1;
    else if (row.status === STATUS.EXPIRY_NEEDED) summary.expiryNeeded += 1;
    else if (row.status === STATUS.EXPIRED) summary.expired += 1;
    else if (row.status === STATUS.NOT_PROVIDED) summary.notProvided += 1;
  }
  return summary;
}

/** Human-readable blocking reasons, in requirement order. */
export function blockingReasons(checklist, t) {
  return checklist
    .filter((row) => row.blocking)
    .map((row) => ({
      id: row.requirement.id,
      status: row.status,
      text: `${row.requirement.displayTitle}: ${t(`status.${row.status}`)}`,
    }));
}