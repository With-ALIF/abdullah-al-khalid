import { formatISODateForDisplay } from '../lib/dates.js';

function Field({ label, value, mono }) {
  return (
    <div className="field">
      <dt className="field__label">{label}</dt>
      <dd className={`field__value${mono ? ' field__value--mono' : ''}`}>{value || '—'}</dd>
    </div>
  );
}

export default function TenderHeader({ tender, documentCount, t, lang, loadedAt }) {
  if (!tender) {
    return (
      <section className="panel" aria-labelledby="tender-heading">
        <h2 id="tender-heading" className="panel__title">
          {t('tender.tenderId')}
        </h2>
        <p className="muted">{t('tender.notLoaded')}</p>
      </section>
    );
  }

  return (
    <section className="panel panel--tender" aria-labelledby="tender-heading">
      <div className="panel__head">
        <h2 id="tender-heading" className="panel__title">
          {tender.title || tender.tender_id}
        </h2>
        <span className="chip">{t('tender.documentCount', { count: documentCount })}</span>
      </div>
      <dl className="fields">
        <Field label={t('tender.tenderId')} value={tender.tender_id} mono />
        <Field label={t('tender.entity')} value={tender.procuring_entity} />
        <Field label={t('tender.bidder')} value={tender.bidder} />
        <Field
          label={t('tender.deadline')}
          value={
            tender.submission_deadline
              ? `${formatISODateForDisplay(tender.submission_deadline, lang)} (${tender.submission_deadline})`
              : ''
          }
          mono
        />
      </dl>
      {loadedAt ? (
        <p className="muted panel__note">
          {t('tender.loadedOn')} {formatISODateForDisplay(loadedAt, lang)}
        </p>
      ) : null}
    </section>
  );
}