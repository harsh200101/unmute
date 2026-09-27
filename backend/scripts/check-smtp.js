'use strict';

// Standalone Gmail SMTP credential check.
//
// Verifies the SMTP handshake and authentication WITHOUT sending an email, so
// a bad password can be identified in seconds instead of by triggering a real
// registration and reading Render logs.
//
//   node scripts/check-smtp.js            # verify() only - no mail sent
//   node scripts/check-smtp.js --send     # also send a test message
//   node scripts/check-smtp.js --send someone@example.com
//
// Run it from the same machine that will run the app. Note that a pass here
// does NOT guarantee a pass on Render: the two environments differ in network
// egress (free Render instances block ports 25/465/587 entirely).
//
// Reads the same variables as the app, so the local .env is enough:
//
//   SMTP_USER=you@gmail.com
//   SMTP_PASS=<16-char App Password, spaces optional>
//
// Exit codes: 0 = authenticated, 1 = failed. The distinction between
// "wrong password" and "host cannot reach the port" is the whole point of
// this script, so failures are classified rather than dumped raw.

require('dotenv').config();

const HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const PORT = Number(process.env.SMTP_PORT || 587);
const USER = process.env.SMTP_USER || process.env.GMAIL_USER;
const PASS = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const FROM = process.env.EMAIL_FROM || USER;
const NAME = process.env.EMAIL_FROM_NAME || 'unmute';

const args = process.argv.slice(2);
const wantsSend = args.includes('--send');
const explicitTo = args.find((a) => !a.startsWith('--'));

function line(s = '') {
  console.log(s);
}

function mask(value) {
  if (!value) return '(empty)';
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-2)}`;
}

function classify(err) {
  const code = err?.code || '';
  const msg = err?.message || String(err);
  const inner = err?.cause?.code || err?.originalError?.code || '';
  const all = `${code} ${inner} ${msg}`;
  const response = err?.response || '';

  if (code === 'EAUTH' || /535|Invalid credentials|Username and Password not accepted/i.test(`${msg} ${response}`)) {
    return {
      verdict: 'AUTH REJECTED',
      detail:
        'Gmail received the connection and refused the credentials. The port is ' +
        'reachable and the network is fine, so this is purely a credential problem.',
      causes: [
        'SMTP_PASS is not an App Password (it must NOT be the Gmail account password).',
        'SMTP_PASS is an App Password, but for a DIFFERENT Google account than SMTP_USER. ' +
          'An app password only works for the account that generated it.',
        '2-Step Verification was toggled or the password was revoked after it was generated - ' +
          'regenerate it at https://myaccount.google.com/apppasswords.',
        'The app password was copied with trailing whitespace or a newline.',
        'The account has Advanced Protection or a Workspace policy that disables app passwords.',
      ],
    };
  }
  if (/ENETUNREACH|EHOSTUNREACH/.test(all)) {
    return {
      verdict: 'NO ROUTE',
      detail:
        'The host resolved the address but has no route to it. This was the IPv6 case: ' +
        'Node preferred the AAAA record on a network without IPv6. The app pins family: 4, ' +
        'but this script does not, so treat a failure here as inconclusive and test with --ipv4.',
      causes: ['Run with --ipv4 to force the IPv4 path used by the app.'],
    };
  }
  if (/ETIMEDOUT|ESOCKET|ECONNRESET/.test(all)) {
    return {
      verdict: 'TIMEOUT / BLOCKED',
      detail:
        'The TCP connection never completed. On Render this means a free instance: ' +
        'outbound ports 25/465/587 are blocked on the free tier (changelog, 26 Sep 2025). ' +
        'A paid instance allows 465 and 587.',
      causes: [
        'If testing on Render: the service must be on a paid instance type.',
        'If testing locally: a corporate or antivirus firewall is likely blocking the port.',
      ],
    };
  }
  if (/ECONNREFUSED/.test(all)) {
    return {
      verdict: 'REFUSED',
      detail: 'The host actively refused the connection on this port.',
      causes: ['Wrong port for the transport.', 'Or the same free-tier block, answered with RST instead of dropped.'],
    };
  }
  return { verdict: 'UNKNOWN', detail: msg, causes: ['Unrecognised failure; see the raw message above.'] };
}

async function main() {
  line('== Gmail SMTP credential check ==');
  line(`host      : ${HOST}:${PORT}`);
  line(`user      : ${USER || '(unset)'}`);
  line(`pass      : ${PASS ? `${mask(PASS)} (${PASS.length} chars)` : '(unset)'}`);
  line(`from      : ${NAME} <${FROM}>`);
  line('');

  if (!USER || !PASS) {
    line('FAIL: SMTP_USER and SMTP_PASS must both be set (GMAIL_USER/GMAIL_APP_PASSWORD also work).');
    process.exit(1);
  }

  if (PASS.length !== 16) {
    line(`WARN: app passwords are 16 characters; this is ${PASS.length}.`);
    line('      Google rejects account passwords and any password of the wrong length.');
    line('');
  }
  if (USER.toLowerCase() !== FROM.toLowerCase()) {
    line(`WARN: EMAIL_FROM (${FROM}) differs from SMTP_USER (${USER}).`);
    line('      Gmail rewrites the sender to the authenticated account, so mail will');
    line(`      arrive as ${USER}.`);
    line('');
  }

  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465,
    auth: { user: USER, pass: PASS },
    family: 4, // match the app: avoid the IPv6-with-no-route failure
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  line('-- connecting (no mail will be sent yet) --');
  try {
    await transport.verify();
    line('OK: connected and authenticated.');
    line('    The host, port and credentials are all valid.');
    line('');
  } catch (err) {
    const c = classify(err);
    line(`FAIL: ${c.verdict}`);
    line('');
    line(c.detail);
    line('');
    line('Likely causes:');
    for (const cause of c.causes) line(`  - ${cause}`);
    line('');
    line(`raw: ${err?.message || err}`);
    if (err?.response) line(`gmail: ${err.response}`);
    process.exit(1);
  }

  if (!wantsSend) {
    line('Verified without sending. Re-run with --send to deliver a test message.');
    transport.close();
    return;
  }

  const to = explicitTo || USER;
  line(`-- sending a test message to ${to} --`);
  try {
    const info = await transport.sendMail({
      from: { name: NAME, address: FROM },
      to,
      subject: 'unmute SMTP test',
      text: 'SMTP credentials verified. If you are reading this, sending works.',
    });
    line(`OK: sent. messageId=${info.messageId}`);
    line(`    response=${info.response}`);
    line(`    check spam if it does not appear within a minute.`);
  } catch (err) {
    const c = classify(err);
    line(`FAIL during send: ${c.verdict}`);
    line(`raw: ${err?.message || err}`);
    process.exit(1);
  } finally {
    transport.close();
  }
}

main().catch((err) => {
  console.error('unexpected failure:', err);
  process.exit(1);
});
