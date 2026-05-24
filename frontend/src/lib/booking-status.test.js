import { describe, it, expect } from 'vitest';
import {
  STATUS_META,
  isStaleScheduled,
  getDisplayStatus,
  isCancellable,
} from './booking-status.js';

// A fixed "now" so every test is deterministic regardless of when it runs.
const NOW = new Date('2026-05-24T10:00:00Z').getTime();
// 14 hours before NOW — matches the regression case the user reported:
// "24 May 2026, 2:53 am — 3:53 am · 14 hr ago, still says scheduled".
const PAST_END   = new Date('2026-05-23T20:00:00Z').toISOString();
const FUTURE_END = new Date('2026-05-24T11:00:00Z').toISOString();

describe('isStaleScheduled', () => {
  it('returns true for a scheduled booking whose slot_end_at is in the past', () => {
    expect(isStaleScheduled({ status: 'scheduled', slot_end_at: PAST_END }, NOW)).toBe(true);
  });

  it('returns true for an in_call booking whose slot_end_at is in the past', () => {
    expect(isStaleScheduled({ status: 'in_call', slot_end_at: PAST_END }, NOW)).toBe(true);
  });

  it('returns false for a scheduled booking whose slot_end_at is in the future', () => {
    expect(isStaleScheduled({ status: 'scheduled', slot_end_at: FUTURE_END }, NOW)).toBe(false);
  });

  it('returns false for a completed booking even if slot_end_at is in the past', () => {
    expect(isStaleScheduled({ status: 'completed', slot_end_at: PAST_END }, NOW)).toBe(false);
  });

  it('returns false for a cancelled booking even if slot_end_at is in the past', () => {
    expect(isStaleScheduled({ status: 'cancelled_by_mentee', slot_end_at: PAST_END }, NOW)).toBe(false);
  });

  it('handles missing booking / slot_end_at safely', () => {
    expect(isStaleScheduled(null, NOW)).toBe(false);
    expect(isStaleScheduled({ status: 'scheduled' }, NOW)).toBe(false);
  });
});

describe('getDisplayStatus', () => {
  // ---- The bug the user reported ----
  it('regression: stale "scheduled" booking is shown as "Past · pending wrap-up", NOT "Scheduled"', () => {
    const stale = { status: 'scheduled', slot_end_at: PAST_END };
    const display = getDisplayStatus(stale, NOW);
    expect(display.key).toBe('past_pending');
    expect(display.label).toBe('Past · pending wrap-up');
    // And we never want the raw "Scheduled" label here.
    expect(display.label).not.toBe('Scheduled');
  });

  it('returns the matching STATUS_META entry for a healthy scheduled booking', () => {
    const live = { status: 'scheduled', slot_end_at: FUTURE_END };
    const display = getDisplayStatus(live, NOW);
    expect(display.key).toBe('scheduled');
    expect(display.label).toBe(STATUS_META.scheduled.label);
  });

  it('returns the matching STATUS_META entry for a completed booking', () => {
    const done = { status: 'completed', slot_end_at: PAST_END };
    expect(getDisplayStatus(done, NOW).key).toBe('completed');
  });

  it('returns a generic entry for an unknown status', () => {
    const weird = { status: 'underwater_basket_weaving', slot_end_at: PAST_END };
    const display = getDisplayStatus(weird, NOW);
    expect(display.key).toBe('underwater_basket_weaving');
    expect(display.label).toBe('underwater basket weaving');
  });
});

describe('isCancellable', () => {
  it('allows cancelling a scheduled booking whose slot is still in the future', () => {
    expect(isCancellable({ status: 'scheduled', slot_end_at: FUTURE_END }, NOW)).toBe(true);
  });

  it('does NOT allow cancelling a stale scheduled booking (the bug case)', () => {
    expect(isCancellable({ status: 'scheduled', slot_end_at: PAST_END }, NOW)).toBe(false);
  });

  it('does not allow cancelling a completed booking', () => {
    expect(isCancellable({ status: 'completed', slot_end_at: FUTURE_END }, NOW)).toBe(false);
  });

  it('does not allow cancelling an in_call booking (handled by mentor, not mentee)', () => {
    expect(isCancellable({ status: 'in_call', slot_end_at: FUTURE_END }, NOW)).toBe(false);
  });
});
