---
name: capacitor-push-notifications
description: "End-to-end implementation guide for native Push Notifications in Capacitor apps using Firebase Cloud Messaging (FCM) and APNs, including permission handling, token registration, foreground/background notification handlers, and backend notification dispatching."
category: push-notifications
risk: safe
tags: [capacitor, push-notifications, fcm, firebase, notifications, apns, mobile]
---

# Capacitor Push Notifications Skill

## Purpose
Setup, configure, and handle push notifications end-to-end on Android and iOS in a Capacitor application using `@capacitor/push-notifications` and Firebase Cloud Messaging (FCM).

---

## 1. Installation
In the frontend project:
```bash
npm install @capacitor/push-notifications
npx cap sync
```

---

## 2. Platform Setup

### Android Setup
1. Create a project in [Firebase Console](https://console.firebase.google.com/).
2. Add an Android app with matching `appId` (e.g. `com.unmute.app`).
3. Download `google-services.json` and place it in:
   `android/app/google-services.json`
4. In `android/build.gradle` (project level):
   ```groovy
   dependencies {
       classpath 'com.google.gms:google-services:4.4.1'
   }
   ```
5. In `android/app/build.gradle` (app level):
   ```groovy
   apply plugin: 'com.google.gms.google-services'
   ```
6. Android 13+ Notification Permission in `AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
   ```

### iOS Setup
1. Add iOS app in Firebase Console, download `GoogleService-Info.plist` into `ios/App/App/`.
2. Enable **Push Notifications** and **Background Modes (Remote notifications)** in Xcode Signing & Capabilities.
3. In `ios/App/App/AppDelegate.swift`:
   ```swift
   import Capacitor

   func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
       NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
   }

   func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
       NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
   }
   ```

---

## 3. Client Implementation (React / TypeScript)

Create a dedicated notification service `src/services/pushNotificationService.ts`:

```typescript
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import axios from 'axios';

export const initPushNotifications = async (backendApiUrl: string, authToken?: string) => {
  // Only execute on native platforms (iOS / Android)
  if (!Capacitor.isNativePlatform()) {
    console.log('Push notifications are only available on native devices.');
    return;
  }

  // Request permissions
  let permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== 'granted') {
    console.warn('User denied push notification permissions.');
    return;
  }

  // Register with FCM/APNs
  await PushNotifications.register();

  // Listeners
  await PushNotifications.addListener('registration', async (token: Token) => {
    console.log('Push Registration Token:', token.value);
    // Send token to backend
    try {
      await axios.post(`${backendApiUrl}/api/notifications/register-token`, {
        token: token.value,
        platform: Capacitor.getPlatform()
      }, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
    } catch (err) {
      console.error('Failed to send token to backend:', err);
    }
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.error('Push Registration Error:', err.error);
  });

  await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
    console.log('Notification Received in Foreground:', notification);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
    console.log('Notification Action Performed:', notification.actionId, notification.notification);
    // Handle navigation/deep link if present
  });
};
```

---

## 4. Backend Dispatching (Node.js / Express)

Using `firebase-admin`:
```bash
npm install firebase-admin
```

In `backend/src/services/notificationService.js`:
```javascript
const admin = require('firebase-admin');

// Initialize with service account key or environment credentials
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
  });
}

async function sendPushNotification(fcmToken, { title, body, data = {} }) {
  const message = {
    token: fcmToken,
    notification: {
      title,
      body
    },
    data,
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

  return admin.messaging().send(message);
}

module.exports = { sendPushNotification };
```
