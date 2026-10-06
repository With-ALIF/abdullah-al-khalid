/**
 * Suggest which file belongs to which requirement, using file names only.
 * Deliberately conservative: it only proposes a match when the name clearly
 * points at one requirement and the pairing is not ambiguous.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'for', 'to', 'in', 'on', 'copy', 'final',
  'new', 'doc', 'document', 'file', 'pdf', 'scan', 'page', 'pages', 'updated',
  'draft', 'final2', 'attached', 'attachment',
]);

export function normalizeName(value) {
  return String(value || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/[^a-z0-9\u0980-\u09FF ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(value) {
  return normalizeName(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Keywords a file name would use for a given requirement. */
function requirementTokens(requirement) {
  const sources = [requirement.title_en, requirement.title_bn, requirement.id];
  const tokens = new Set();
  for (const source of sources) {
    for (const token of tokenize(source)) tokens.add(token);
  }
  // Also index the longest words of the English title, which carry the meaning
  // ("trade", "license", "municipality").
  const english = tokenize(requirement.title_en);
  english
    .filter((token) => token.length >= 5)
    .forEach((token) => {
      tokens.add(token);
      tokens.add(token.slice(0, Math.max(4, token.length - 2)));
    });
  return tokens;
}

function scoreFile(tokens, fileTokens, requirementTokenSet) {
  if (fileTokens.length === 0) return 0;
  let score = 0;
  for (const token of fileTokens) {
    if (requirementTokenSet.has(token)) {
      score += 3;
      continue;
    }
    // Partial credit for a file name that contains the requirement keyword,
    // e.g. "trade_license_2024.pdf" against "Trade License".
    for (const candidate of requirementTokenSet) {
      if (candidate.length >= 4 && (token.includes(candidate) || candidate.includes(token))) {
        score += 2;
        break;
      }
    }
  }
  return score;
}

/**
 * Returns [{ fileId, requirementId }]. Only unambiguous pairings are returned,
 * and each file / requirement appears at most once.
 */
export function suggestMatches({ files, requirements }) {
  const tokenSets = new Map(requirements.map((r) => [r.id, requirementTokens(r)]));
  const fileTokens = new Map(
    files
      .filter((file) => file.readState === 'ready')
      .map((file) => [file.id, tokenize(file.name)]),
  );

  const candidates = [];
  for (const file of files) {
    if (file.readState !== 'ready') continue;
    const tokens = fileTokens.get(file.id);
    for (const requirement of requirements) {
      const score = scoreFile(tokens, tokens, tokenSets.get(requirement.id));
      if (score >= 3) candidates.push({ fileId: file.id, requirementId: requirement.id, score });
    }
  }

  // Best score per file and per requirement; drop anything contested.
  const bestForFile = new Map();
  const bestForRequirement = new Map();
  for (const candidate of candidates) {
    const currentFile = bestForFile.get(candidate.fileId);
    if (!currentFile || candidate.score > currentFile.score) bestForFile.set(candidate.fileId, candidate);
    const currentReq = bestForRequirement.get(candidate.requirementId);
    if (!currentReq || candidate.score > currentReq.score) bestForRequirement.set(candidate.requirementId, candidate);
  }

  const suggestions = [];
  for (const [fileId, candidate] of bestForFile) {
    const reverse = bestForRequirement.get(candidate.requirementId);
    if (reverse && reverse.fileId === fileId && reverse.score === candidate.score) {
      suggestions.push({ fileId, requirementId: candidate.requirementId, score: candidate.score });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.map(({ fileId, requirementId }) => ({ fileId, requirementId }));
}