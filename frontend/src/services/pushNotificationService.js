import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import api from '../api/client';

let isInitialized = false;

// Safe internal routing helper â€” never escapes to Chrome or loads full web URL
function handleNotificationNavigation(rawUrl) {
  if (!rawUrl) return;
  // If a full URL was passed (e.g. https://unmute-frontend.onrender.com/mentors), strip origin
  const relativePath = rawUrl.replace(/^https?:\/\/[^/]+/, '');
  if (window.__unmuteNavigate && typeof window.__unmuteNavigate === 'function') {
    window.__unmuteNavigate(relativePath);
  } else {
    window.location.pathname = relativePath;
  }
}

export async function initPushNotifications(onNotificationClick) {
  // Only execute on native iOS/Android devices
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (isInitialized) {
    return;
  }

  try {
    // 1. Setup Android Notification Channels with high importance (heads-up notification + sound + vibrate)
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: 'default',
          name: 'General',
          description: 'General Unmute alerts and notifications',
          importance: 5, // High priority (heads-up banner in status bar)
          visibility: 1, // Public on lockscreen
          sound: 'default',
          vibration: true,
          lights: true,
        });
      } catch (err) {
        console.warn('[PushNotifications] createChannel Push error:', err);
      }

      try {
        await LocalNotifications.createChannel({
          id: 'default',
          name: 'General',
          description: 'General Unmute alerts and notifications',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          lights: true,
        });
      } catch (err) {
        console.warn('[LocalNotifications] createChannel Local error:', err);
      }
    }

    // 2. Request runtime permissions (Android 13+ & iOS)
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    try {
      const localPerm = await LocalNotifications.checkPermissions();
      if (localPerm.display === 'prompt') {
        await LocalNotifications.requestPermissions();
      }
    } catch (_) {}

    if (permStatus.receive !== 'granted') {
      console.warn('[PushNotifications] Push permission not granted:', permStatus.receive);
      return;
    }

    // 3. Register with FCM / APNs
    await PushNotifications.register();
    isInitialized = true;

    // 4. Token registration listener
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[PushNotifications] Device token registered:', token.value);
      try {
        await api.post('/notifications/device-token', {
          token: token.value,
          platform: Capacitor.getPlatform()
        });
        console.log('[PushNotifications] Token uploaded to backend successfully.');
      } catch (err) {
        console.error('[PushNotifications] Failed to upload token to backend:', err.message);
      }
    });

    // 5. Registration errors
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[PushNotifications] Error on registration:', error);
    });

    // 6. Foreground Push Notifications:
    // When the app is open in foreground, FCM does NOT post to the Android tray automatically.
    // We schedule a local notification so it immediately pops up in the phone notification tray!
    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[PushNotifications] Foreground push notification received:', notification);
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Math.random() * 1000000) + 1,
              title: notification.title || 'Unmute',
              body: notification.body || '',
              channelId: 'default',
              smallIcon: 'ic_launcher',
              extra: notification.data || {},
            }
          ]
        });
      } catch (err) {
        console.error('[LocalNotifications] Foreground schedule error:', err);
      }
    });

    // 7. Handle user tapping notification in system tray (Local Notifications)
    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      console.log('[LocalNotifications] System tray notification tapped:', action);
      const data = action.notification.extra || {};
      if (onNotificationClick && typeof onNotificationClick === 'function') {
        onNotificationClick(data);
      } else {
        handleNotificationNavigation(data.link_url || data.url);
      }
    });

    // 8. Handle user tapping notification in system tray (Background Push Notifications)
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[PushNotifications] Push notification tapped:', action);
      const data = action.notification.data || {};
      if (onNotificationClick && typeof onNotificationClick === 'function') {
        onNotificationClick(data);
      } else {
        handleNotificationNavigation(data.link_url || data.url);
      }
    });

  } catch (error) {
    console.error('[PushNotifications] Initialization error:', error);
  }
}

/**
 * Display a notification directly into the phone's native notification tray
 * Works on Android and iOS devices.
 */
export async function showNotificationInTray({ id, title, body, link_url }) {
  if (!Capacitor.isNativePlatform()) {
    console.log('[showNotificationInTray] (Browser mock):', { title, body, link_url });
    return;
  }
  try {
    const notifId = id ? (Number(id) || Math.floor(Math.random() * 1000000)) : Math.floor(Math.random() * 1000000) + 1;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notifId,
          title: title || 'Unmute',
          body: body || '',
          channelId: 'default',
          smallIcon: 'ic_launcher',
          extra: { link_url: link_url || '/me/notifications' },
        }
      ]
    });
    console.log('[showNotificationInTray] Posted to system tray with ID:', notifId);
  } catch (err) {
    console.error('[showNotificationInTray] Error:', err);
  }
}
