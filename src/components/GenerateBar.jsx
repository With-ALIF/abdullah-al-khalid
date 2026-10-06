import { useState } from 'react';

/**
 * Summary + blocking reasons + the Generate button.
 * The button is a real `disabled` button, so keyboard and screen reader users
 * get the same answer as everyone else.
 */
export default function GenerateBar({
  summary,
  reasons,
  ready,
  includeIndex,
  onToggleIndex,
  onGenerate,
  onExportCsv,
  onSaveProject,
  onLoadProject,
  progress,
  result,
  downloadName,
  hasTender,
  hasMatchedFiles,
  t,
}) {
  const [showIndexNote, setShowIndexNote] = useState(false);

  return (
    <section className="panel panel--generate" aria-labelledby="generate-heading">
      <h2 id="generate-heading" className="panel__title">{t('step4.title')}</h2>

      {hasTender ? (
        <>
          <p className={ready ? 'summary summary--ok' : 'summary summary--pending'}>
            <span aria-hidden="true">{ready ? '✓' : '⋯'}</span>{' '}
            {t('step4.progress', { ok: summary.ok, total: summary.total })}
            {' '}
            <span className="muted">
              ({t('summary.ok')}: {summary.ok} · {t('summary.missing')}: {summary.missing} ·{' '}
              {t('summary.expiryNeeded')}: {summary.expiryNeeded} · {t('summary.expired')}: {summary.expired} ·{' '}
              {t('summary.notProvided')}: {summary.notProvided})
            </span>
          </p>

          {reasons.length > 0 ? (
            <>
              <p className="notice notice--bad" role="alert">
                {t('step4.blocked')}
              </p>
              <ul className="reasons">
                {reasons.map((reason) => (
                  <li key={reason.id} className="reasons__item">
                    <span aria-hidden="true">✕</span> {reason.text}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="notice notice--ok" role="status">
              {t('step4.ready')}
            </p>
          )}

          <div className="options">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={includeIndex}
                onChange={(event) => {
                  onToggleIndex(event.target.checked);
                  setShowIndexNote(event.target.checked);
                }}
                onBlur={() => setShowIndexNote(false)}
              />
              <span>{t('step4.includeIndex')}</span>
            </label>
            {showIndexNote ? <span className="muted">{t('step4.indexNote')}</span> : null}
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              disabled={!ready}
              onClick={onGenerate}
            >
              {t('step4.generate')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onExportCsv}
              disabled={!hasTender}
            >
              {t('step4.exportCsv')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onSaveProject}>
              {t('msg.saveProject')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onLoadProject}>
              {t('msg.loadProject')}
            </button>
          </div>

          {summary.matched === 0 ? <p className="muted">{t('step4.noFiles')}</p> : null}
        </>
      ) : (
        <p className="muted">{t('step4.noRequirements')}</p>
      )}

      {progress ? (
        <p className="progress" role="status" aria-live="polite">
          {t(`step4.stage.${progress.stage}`)} {progress.percent}%
        </p>
      ) : null}

      {result ? (
        <div className="result" role="status" aria-live="polite">
          <p className="notice notice--ok">
            {t('step4.downloadReady', { name: result.name, pages: result.pageCount })}
          </p>
          <a className="btn btn--primary" href={result.url} download={downloadName}>
            {t('step4.download')}
          </a>
        </div>
      ) : null}
    </section>
  );
}