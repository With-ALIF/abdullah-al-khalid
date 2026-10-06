import { STATUS } from '../lib/status.js';

const TONE = {
  [STATUS.OK]: 'ok',
  [STATUS.MISSING]: 'bad',
  [STATUS.EXPIRY_NEEDED]: 'warn',
  [STATUS.EXPIRED]: 'bad',
  [STATUS.NOT_PROVIDED]: 'neutral',
};

/**
 * Status is shown with a word, an icon and a colour, never colour alone.
 * Screen readers get the plain label; the icon is decorative.
 */
export default function StatusBadge({ status, t, compact = false }) {
  const tone = TONE[status] || 'neutral';
  return (
    <span className={`badge badge--${tone}${compact ? ' badge--compact' : ''}`}>
      <span className="badge__icon" aria-hidden="true">
        {t(`status.icon.${status}`)}
      </span>
      <span className="badge__text">{t(`status.${status}`)}</span>
      <span className="badge__block">
        {status === 'ok' || status === 'not_provided'
          ? t('status.doesNotBlock')
          : t('status.blocks')}
      </span>
    </span>
  );
}