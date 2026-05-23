'use strict';

// Mints Agora RTC tokens for the meeting room.
//
// Real mode (AGORA_APP_ID + AGORA_APP_CERTIFICATE set) uses agora-token to
// sign a short-lived token bound to the channel + uid + role + expiry.
//
// Stub mode (env vars unset, e.g. tests / dev without an Agora project)
// returns a deterministic mock token so the rest of the system flows
// end-to-end. The frontend won't actually connect to Agora in that case.

const env = require('../config/env');

let agoraToken = null;
try {
  // eslint-disable-next-line global-require
  agoraToken = require('agora-token');
} catch (_) {
  // dependency missing; stub mode only
}

const TOKEN_TTL_SECONDS = 60 * 60; // 1h — matches max slot length

function isConfigured() {
  return !!(env.AGORA_APP_ID && env.AGORA_APP_CERTIFICATE && agoraToken);
}

// Agora needs a deterministic numeric uid <= uint32. user.id is a BIGINT
// but in practice well within range. We mask just in case.
function deriveUid(user_id) {
  const n = Number(user_id);
  return Number.isFinite(n) ? (n >>> 0) || 1 : 1;
}

function channelName(booking_uuid) {
  // Agora channel names: ≤ 64 chars, restricted character set.
  // The booking UUID (32 hex + 4 hyphens) fits cleanly.
  return `unmute-${booking_uuid}`;
}

function buildToken({ booking_uuid, user_id, role = 'publisher', ttl_seconds = TOKEN_TTL_SECONDS }) {
  const uid = deriveUid(user_id);
  const channel = channelName(booking_uuid);
  const expires_at = Math.floor(Date.now() / 1000) + ttl_seconds;

  if (!isConfigured()) {
    // Deterministic mock token. Format: "stub-<channel>-<uid>-<exp>"
    return {
      provider: 'stub',
      app_id: env.AGORA_APP_ID || 'STUB_APP_ID',
      channel,
      uid,
      token: `stub-${channel}-${uid}-${expires_at}`,
      expires_at,
    };
  }

  const { RtcTokenBuilder, RtcRole } = agoraToken;
  const agoraRole = role === 'audience' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const token = RtcTokenBuilder.buildTokenWithUid(
    env.AGORA_APP_ID,
    env.AGORA_APP_CERTIFICATE,
    channel,
    uid,
    agoraRole,
    expires_at,
    expires_at
  );
  return {
    provider: 'agora',
    app_id: env.AGORA_APP_ID,
    channel,
    uid,
    token,
    expires_at,
  };
}

module.exports = { isConfigured, channelName, buildToken, deriveUid };
