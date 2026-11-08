'use strict';

const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');

let firebaseAdmin = null;
let isFirebaseInitialized = false;

function getFirebaseAdmin() {
  if (isFirebaseInitialized) return firebaseAdmin;
  isFirebaseInitialized = true;

  try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    const admin = require('firebase-admin');
    let serviceAccount = null;

    if (rawKey) {
      const trimmed = rawKey.trim();
      if (trimmed.startsWith('{')) {
        // Raw JSON string
        try {
          serviceAccount = JSON.parse(trimmed);
        } catch (_) {
          try {
            serviceAccount = JSON.parse(trimmed.replace(/\r?\n/g, '\\n'));
          } catch (e2) {
            console.error('[pushNotificationService] JSON parse error on FIREBASE_SERVICE_ACCOUNT_KEY:', e2.message);
          }
        }
      } else if (trimmed.startsWith('ey') || trimmed.length > 100 && !trimmed.includes('{')) {
        // Base64 encoded JSON string
        try {
          const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
          serviceAccount = JSON.parse(decoded);
        } catch (_) {
          try {
            serviceAccount = require(path.resolve(trimmed));
          } catch (e3) {
            console.error('[pushNotificationService] Base64/file error on FIREBASE_SERVICE_ACCOUNT_KEY:', e3.message);
          }
        }
      } else if (fs.existsSync(trimmed)) {
        // Direct file path
        serviceAccount = JSON.parse(fs.readFileSync(trimmed, 'utf8'));
      } else if (fs.existsSync(path.resolve(process.cwd(), trimmed))) {
        serviceAccount = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), trimmed), 'utf8'));
      }
    } else {
      // Check default fallback file locations in backend/
      const defaultPaths = [
        path.resolve(process.cwd(), 'firebase-service-account.json'),
        path.resolve(__dirname, '../../firebase-service-account.json'),
        path.resolve(process.cwd(), 'serviceAccountKey.json'),
      ];
      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
          console.log(`[pushNotificationService] Loaded Firebase service account from ${p}`);
          break;
        }
      }
    }

    if (!serviceAccount) {
      console.log('[pushNotificationService] Firebase service account not configured. Push notifications will run in mock/log mode.');
      return null;
    }

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
