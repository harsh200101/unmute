/* -------------------------------------------------------------------------- */
/* Booking status display + classification helpers.                            */
/*                                                                             */
/* Two layers of "status":                                                     */
/*   1. RAW status — comes from the backend (scheduled, in_call, completed,    */
/*      no_show, cancelled_* ...).                                             */
/*   2. DISPLAY status — what we render in the UI. Sometimes the raw status    */
/*      is stale (e.g. a "scheduled" booking whose slot_end_at has already     */
/*      passed because the backend hasn't run its sweep yet). Showing          */
/*      "Scheduled" then is misleading; we render "Past · pending wrap-up"     */
/*      until the backend resolves it.                                         */
/*                                                                             */
/* Importing `STATUS_META` directly gives consumers a stable label/tone/icon   */
/* map. Importing `getDisplayStatus(booking, now)` returns the entry that      */
/* should actually be shown for a given booking at a given instant.            */
/* -------------------------------------------------------------------------- */

import {
  CalendarDays, CheckCircle2, AlertCircle, X as XIcon,
  PhoneOff, Clock as ClockIcon,
} from 'lucide-react';

// Canonical entries — keyed by raw backend status plus one synthetic key
// (`past_pending`) for the stale-scheduled case described above.
export const STATUS_META = {
  scheduled:           { label: 'Scheduled',          tone: 'bg-primary/10 text-primary border-primary/20',                                       icon: CalendarDays },
  in_call:             { label: 'In call',            tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',     icon: PhoneOff },
  completed:           { label: 'Completed',          tone: 'bg-muted text-foreground border-border',                                             icon: CheckCircle2 },
  no_show:             { label: 'No show',            tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',             icon: AlertCircle },
  cancelled_by_mentee: { label: 'Cancelled by mentee',tone: 'bg-destructive/10 text-destructive border-destructive/30',                           icon: XIcon },
  cancelled_by_mentor: { label: 'Cancelled (mentor)', tone: 'bg-destructive/10 text-destructive border-destructive/30',                           icon: XIcon },
  cancelled_admin:     { label: 'Cancelled (admin)',  tone: 'bg-destructive/10 text-destructive border-destructive/30',                           icon: XIcon },
  // SYNTHETIC — used when a `scheduled`/`in_call` booking is past its end time.
  past_pending:        { label: 'Past · pending wrap-up', tone: 'bg-muted text-muted-foreground border-border',                                   icon: ClockIcon },
};

// Statuses we treat as "live" (the call hasn't conceptually happened yet).
// If the booking's slot_end_at is past, "scheduled"/"in_call" become stale.
const LIVE_STATUSES = new Set(['scheduled', 'in_call']);

/**
 * True if the booking's raw status is `scheduled` or `in_call` but the slot
 * already ended in the past. These are the rows that need a synthetic label.
 *
 * @param {{ status: string, slot_end_at: string }} booking
 * @param {number} [now] - milliseconds since epoch (default: Date.now())
 * @returns {boolean}
 */
export function isStaleScheduled(booking, now = Date.now()) {
  if (!booking || !booking.slot_end_at) return false;
  if (!LIVE_STATUSES.has(booking.status)) return false;
  return new Date(booking.slot_end_at).getTime() <= now;
}

/**
 * Pick the right STATUS_META entry for this booking. If the booking is stale
 * (scheduled/in_call past slot_end_at), returns the synthetic `past_pending`
 * entry. Otherwise returns the entry for the raw status, falling back to a
 * generic muted entry if the backend ever invents a new status we don't know.
 *
 * @param {{ status: string, slot_end_at?: string }} booking
 * @param {number} [now]
 * @returns {{ key: string, label: string, tone: string, icon: Function }}
 */
export function getDisplayStatus(booking, now = Date.now()) {
  if (isStaleScheduled(booking, now)) {
    return { key: 'past_pending', ...STATUS_META.past_pending };
  }
  const meta = STATUS_META[booking.status];
  if (meta) return { key: booking.status, ...meta };
  return {
    key: booking.status,
    label: String(booking.status || 'Unknown').replaceAll('_', ' '),
    tone: 'bg-muted text-foreground border-border',
    icon: CalendarDays,
  };
}

/**
 * Action gate: can this booking be cancelled by the mentee?
 * Must be raw status `scheduled` AND the slot is still in the future
 * (you can't cancel a session that's already happened).
 *
 * @param {{ status: string, slot_end_at?: string }} booking
 * @param {number} [now]
 * @returns {boolean}
 */
export function isCancellable(booking, now = Date.now()) {
  if (!booking) return false;
  if (booking.status !== 'scheduled') return false;
  if (!booking.slot_end_at) return false;
  return new Date(booking.slot_end_at).getTime() > now;
}
