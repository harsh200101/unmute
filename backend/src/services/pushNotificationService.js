'use strict';

const { query } = require('../config/db');

let firebaseAdmin = null;
let isFirebaseInitialized = false;

function getFirebaseAdmin() {
  if (isFirebaseInitialized) return firebaseAdmin;
  isFirebaseInitialized = true;

  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!rawKey) {
      console.log('[pushNotificationService] FIREBASE_SERVICE_ACCOUNT_KEY not set; push notifications will run in mock/log mode.');
      return null;
    }

    const admin = require('firebase-admin');
    const serviceAccount = typeof rawKey === 'string' && rawKey.startsWith('{')
      ? JSON.parse(rawKey)
      : require(rawKey);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseAdmin = admin;
    console.log('[pushNotificationService] Firebase Admin initialized successfully.');
    return firebaseAdmin;
  } catch (err) {
    console.warn('[pushNotificationService] Failed to initialize Firebase Admin:', err.message);
    return null;
  }
}

async function registerDeviceToken({ user_id, token, platform = 'android' }) {
  await query(
    `INSERT INTO user_device_tokens (user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           updated_at = NOW()`,
    [user_id, token, platform]
  );
  return { success: true };
}

async function unregisterDeviceToken(token) {
  await query(`DELETE FROM user_device_tokens WHERE token = $1`, [token]);
}

async function sendPushToUser({ user_id, title, body, link_url, kind }) {
  try {
    const r = await query(
      `SELECT token, platform FROM user_device_tokens WHERE user_id = $1`,
      [user_id]
    );
    if (!r.rows.length) return;

    const tokens = r.rows.map(row => row.token);
    const admin = getFirebaseAdmin();

    if (!admin) {
      console.log(`[pushNotificationService Mock] Would send push to user ${user_id} (${tokens.length} devices): "${title}" - "${body}"`);
      return;
    }

    const payload = {
      notification: {
        title,
        body: body || ''
      },
      data: {
        link_url: link_url || '',
        kind: kind || 'general'
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default'
          }
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...payload
    });

    // Cleanup dead / invalid tokens
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errCode = resp.error?.code;
          if (
            errCode === 'messaging/registration-token-not-registered' ||
            errCode === 'messaging/invalid-registration-token'
          ) {
            unregisterDeviceToken(tokens[idx]).catch(() => {});
          }
        }
      });
    }
  } catch (err) {
    console.error('[pushNotificationService] Failed to dispatch push:', err.message);
  }
}

module.exports = {
  registerDeviceToken,
  unregisterDeviceToken,
  sendPushToUser,
};
