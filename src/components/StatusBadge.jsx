import {
  CheckCircle2,
  XCircle,
  CalendarClock,
  CalendarX,
  MinusCircle,
  Copy,
} from 'lucide-react';
import { STATUS } from '../lib/status.js';

const CONFIG = {
  [STATUS.OK]: {
    Icon: CheckCircle2,
    classes: 'bg-green-50 text-green-700 border-green-200',
  },
  [STATUS.MISSING]: {
    Icon: XCircle,
    classes: 'bg-red-50 text-red-700 border-red-200',
  },
  [STATUS.EXPIRY_NEEDED]: {
    Icon: CalendarClock,
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  [STATUS.EXPIRED]: {
    Icon: CalendarX,
    classes: 'bg-red-50 text-red-700 border-red-200',
  },
  [STATUS.NOT_PROVIDED]: {
    Icon: MinusCircle,
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  duplicate: {
    Icon: Copy,
    classes: 'bg-orange-50 text-orange-700 border-orange-200',
  },
};

/**
 * Rounded pill: icon + text + color, never color alone.
 * The blocking hint is exposed to screen readers via title.
 */
export default function StatusBadge({ status, t, variant = null }) {
  const key = variant === 'duplicate' ? 'duplicate' : status;
  const config = CONFIG[key] || CONFIG[STATUS.NOT_PROVIDED];
  const { Icon, classes } = config;
  const label = variant === 'duplicate' ? t('step2.duplicate') : t(`status.${status}`);
  const blockHint =
    status === 'ok' || status === 'not_provided'
      ? t('status.doesNotBlock')
      : t('status.blocks');
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold whitespace-nowrap ${classes}`}
      title={variant === 'duplicate' ? undefined : blockHint}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <span>{label}</span>
      <span className="sr-only">
        {variant === 'duplicate' ? '' : ` — ${blockHint}`}
      </span>
    </span>
  );
}
