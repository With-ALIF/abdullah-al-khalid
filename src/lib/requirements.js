import { parseISODate } from './dates.js';

/**
 * Validate and normalise a parsed requirements.json payload.
 * Returns { ok, error, tender, requirements, deadlineValid, warnings }.
 */
export function parseRequirements(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'The file must contain a JSON object.' };
  }
  const tenderRaw = raw.tender;
  if (!tenderRaw || typeof tenderRaw !== 'object') {
    return { ok: false, error: 'The "tender" object is missing.' };
  }
  if (!Array.isArray(raw.requirements)) {
    return { ok: false, error: 'The "requirements" array is missing.' };
  }

  const tender = {
    tender_id: str(tenderRaw.tender_id),
    title: str(tenderRaw.title),
    procuring_entity: str(tenderRaw.procuring_entity),
    bidder: str(tenderRaw.bidder),
    submission_deadline: str(tenderRaw.submission_deadline),
  };

  const seenIds = new Set();
  const requirements = [];
  for (let i = 0; i < raw.requirements.length; i += 1) {
    const item = raw.requirements[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Requirement ${i + 1} is not an object.` };
    }
    let id = str(item.id);
    if (!id) id = `REQ-${i + 1}`;
    if (seenIds.has(id)) id = `${id}-${i + 1}`;
    seenIds.add(id);

    const order = Number.isFinite(Number(item.order)) ? Number(item.order) : i + 1;
    const titleEn = str(item.title_en);
    const titleBn = str(item.title_bn);
    if (!titleEn && !titleBn) {
      return { ok: false, error: `Requirement "${id}" has no title_en or title_bn.` };
    }

    requirements.push({
      id,
      order,
      title_en: titleEn || titleBn,
      title_bn: titleBn || titleEn,
      mandatory: Boolean(item.mandatory),
      has_expiry: Boolean(item.has_expiry),
      originalIndex: i,
    });
  }

  requirements.sort((a, b) => a.order - b.order || a.originalIndex - b.originalIndex);

  const deadlineValid = parseISODate(tender.submission_deadline) !== null;
  const warnings = [];
  if (!deadlineValid) {
    warnings.push('submission_deadline');
  }

  return {
    ok: true,
    tender,
    requirements,
    deadlineValid,
    warnings,
    deadline: deadlineValid ? tender.submission_deadline : '',
  };
}

function str(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

/** Display title in the chosen language, falling back to the other language. */
export function displayTitle(requirement, lang) {
  if (lang === 'bn') return requirement.title_bn || requirement.title_en || requirement.id;
  return requirement.title_en || requirement.title_bn || requirement.id;
}

export function sanitizeFileBase(value) {
  const cleaned = String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'tender';
}