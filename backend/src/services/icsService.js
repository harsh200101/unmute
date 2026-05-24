'use strict';

// Minimal .ics (iCalendar) generator for booking invites.
// Spec: RFC 5545. Most calendar clients are forgiving.

function pad(n) { return String(n).padStart(2, '0'); }
function formatICSDate(d) {
  // YYYYMMDDTHHMMSSZ
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    'T',
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
    'Z',
  ].join('');
}

// RFC 5545 §3.3.11 — TEXT: backslash, semicolon, comma, newline must be escaped
function escapeText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Folds long lines per RFC 5545 §3.1 (75 octets max).
function fold(line) {
  if (line.length <= 75) return line;
  const out = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
}

function buildICS({
  uid,
  start_at,           // Date or ISO string
  end_at,             // Date or ISO string
  summary,
  description,
  organizer_email,
  attendee_emails = [],
  status = 'CONFIRMED',   // CONFIRMED | CANCELLED | TENTATIVE
  method = 'REQUEST',     // REQUEST (new/update) | CANCEL
  sequence = 0,
}) {
  const start = start_at instanceof Date ? start_at : new Date(start_at);
  const end = end_at instanceof Date ? end_at : new Date(end_at);
  const now = new Date();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//unmute//v2//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(now)}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    organizer_email ? `ORGANIZER:mailto:${organizer_email}` : null,
    ...attendee_emails.map(
      (e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${e}`
    ),
    `STATUS:${status}`,
    `SEQUENCE:${sequence}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { buildICS };
