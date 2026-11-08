import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api from '../api/client';

let isInitialized = false;

export async function initPushNotifications(onNotificationClick) {
  // Only execute on native iOS/Android devices
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  if (isInitialized) {
    return;
  }

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[PushNotifications] Permission not granted:', permStatus.receive);
      return;
    }

    // Register with Apple / Firebase
    await PushNotifications.register();
    isInitialized = true;

    // Listen for device registration token
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[PushNotifications] Device registered. Token:', token.value);
      try {
        await api.post('/notifications/device-token', {
          token: token.value,
          platform: Capacitor.getPlatform()
        });
        console.log('[PushNotifications] Token registered with backend successfully.');
      } catch (err) {
        console.error('[PushNotifications] Failed to send token to backend:', err.message);
      }
    });

    // Listen for registration errors
    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[PushNotifications] Error on registration:', error);
    });

    // Handle notification received while app is open in foreground
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[PushNotifications] Foreground notification received:', notification);
    });

    // Handle user tapping on a notification
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[PushNotifications] Action performed:', action);
      const data = action.notification.data;
      if (onNotificationClick && typeof onNotificationClick === 'function') {
        onNotificationClick(data);
      } else if (data?.link_url) {
        window.location.href = data.link_url;
      }
    });

  } catch (error) {
    console.error('[PushNotifications] Initialization error:', error);
  }
}
