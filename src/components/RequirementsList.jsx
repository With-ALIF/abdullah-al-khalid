import MatchSelect from './MatchSelect.jsx';
import StatusBadge from './StatusBadge.jsx';
import { formatISODateForDisplay, isValidISODate } from '../lib/dates.js';

/**
 * One row per required document: match dropdown, expiry date, status.
 * Everything the user can change sits in the same row so the status next to it
 * is obviously the result of that control.
 */
export default function RequirementsList({
  rows,
  files,
  matches,
  filesById,
  duplicates,
  requirementsById,
  deadline,
  lang,
  onMatch,
  onExpiryChange,
  onSuggest,
  t,
}) {
  if (rows.length === 0) {
    return (
      <section className="panel" aria-labelledby="req-heading">
        <h2 id="req-heading" className="panel__title">{t('step3.title')}</h2>
        <p className="muted">{t('step3.noRequirements')}</p>
      </section>
    );
  }

  const duplicateIdsInUse = new Set();
  for (const group of duplicates) {
    if (group.length > 1 && group.some((id) => Object.values(matches).includes(id))) {
      for (const id of group) duplicateIdsInUse.add(id);
    }
  }

  return (
    <section className="panel" aria-labelledby="req-heading">
      <div className="panel__head">
        <h2 id="req-heading" className="panel__title">{t('step3.title')}</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onSuggest}>
          {t('step3.autoMatch')}
        </button>
      </div>
      <p className="panel__help">{t('step3.help')}</p>

      <ul className="reqlist">
        {rows.map((row) => {
          const requirement = row.requirement;
          const currentFileId = matches[requirement.id] || '';
          const options = files.map((file) => {
            const usedBy = Object.keys(matches).find(
              (id) => matches[id] === file.id && id !== requirement.id,
            );
            const isDuplicateOfUsedFile =
              duplicateIdsInUse.has(file.id) &&
              (duplicateIdsInUse.size > 0) &&
              !currentFileId;
            const disabled = Boolean(usedBy) || (isDuplicateOfUsedFile && !usedBy);
            let label = `${file.name} — ${t('step2.pages', { count: file.pageCount })}`;
            if (usedBy) {
              label += ` (${t('step3.takenByOther', { title: requirementsById[usedBy]?.displayTitle || '' })})`;
            } else if (isDuplicateOfUsedFile && !currentFileId) {
              label += ` (${t('step3.duplicateBlocked')})`;
            }
            return { value: file.id, label, disabled };
          });

          const showExpiry = Boolean(row.file) && requirement.has_expiry;
          const expiryInvalid = showExpiry && row.expiryDate && !isValidISODate(row.expiryDate);

          return (
            <li
              key={requirement.id}
              className={`req${row.blocking ? ' req--blocking' : ''}`}
            >
              <div className="req__head">
                <span className="req__order" aria-hidden="true">{requirement.order}</span>
                <div className="req__titles">
                  <p className="req__title">{requirement.displayTitle}</p>
                  {lang === 'bn' ? (
                    <p className="req__title-alt">{requirement.title_en}</p>
                  ) : requirement.title_bn ? (
                    <p className="req__title-alt">{requirement.title_bn}</p>
                  ) : null}
                </div>
                <StatusBadge status={row.status} t={t} />
              </div>

              <div className="req__flags">
                <span className={`tag ${requirement.mandatory ? 'tag--required' : 'tag--optional'}`}>
                  {requirement.mandatory ? t('step3.mandatory') : t('step3.optional')}
                </span>
                <span className={`tag ${requirement.has_expiry ? 'tag--expiry' : ''}`}>
                  {requirement.has_expiry ? t('step3.hasExpiry') : t('step3.noExpiry')}
                </span>
                {row.file ? (
                  <span className="tag">
                    {t('step2.pages', { count: row.file.pageCount })}
                  </span>
                ) : null}
              </div>

              <div className="req__controls">
                <MatchSelect
                  label={{ id: requirement.id, text: t('step3.matchLabel', { title: requirement.displayTitle }) }}
                  value={currentFileId}
                  options={options}
                  onChange={(fileId) => onMatch(requirement.id, fileId)}
                  onUnmatch={() => onMatch(requirement.id, null)}
                  placeholder={t('step3.selectFile')}
                  noneLabel={t('step3.none')}
                  unmatchLabel={t('step3.unmatch')}
                  emptyLabel={t('step2.empty')}
                />

                {showExpiry ? (
                  <div className="expiry">
                    <label className="expiry__label" htmlFor={`expiry-${requirement.id}`}>
                      {t('step3.expiryLabel')}
                    </label>
                    <input
                      id={`expiry-${requirement.id}`}
                      className={`input input--date${expiryInvalid ? ' input--invalid' : ''}`}
                      type="date"
                      value={isValidISODate(row.expiryDate) ? row.expiryDate : ''}
                      onChange={(event) => onExpiryChange(requirement.id, event.target.value)}
                      aria-describedby={`expiry-hint-${requirement.id}`}
                    />
                    <p id={`expiry-hint-${requirement.id}`} className="expiry__hint">
                      {t('step3.expiryHint')}
                      {deadline ? ` · ${t('tender.deadline')}: ${formatISODateForDisplay(deadline, lang)}` : ''}
                      {row.expiryDate && !expiryInvalid ? ` · ${formatISODateForDisplay(row.expiryDate, lang)}` : ''}
                    </p>
                  </div>
                ) : null}
              </div>

              </li>
          );
        })}
      </ul>
    </section>
  );
}