---
name: capacitor-mobile-app
description: "End-to-end guide for converting modern web apps (React, Vite, Vue, Angular) into cross-platform iOS and Android mobile applications using Capacitor, including native permissions, Agora RTC/WebRTC compatibility, and safe-area UI adaptation."
category: mobile-development
risk: safe
tags: [capacitor, mobile, ios, android, vite, react, hybrid-apps]
---

# Capacitor Mobile App Skill

## Purpose
Convert a web application (specifically Vite / React / HTML5) into production-ready Android and iOS mobile applications with native device access, camera/microphone permissions, and deep hardware integration.

---

## Workflow & Steps

### 1. Pre-requisites & Dependencies
In the web application directory (e.g. `frontend/`):
```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android @capacitor/ios
```

### 2. Initialization & Configuration
Initialize Capacitor:
```bash
npx cap init "unmute" "com.unmute.app" --web-dir dist
```
Verify `capacitor.config.ts`:
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unmute.app',
  appName: 'unmute',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
```

### 3. Build & Platform Addition
Always ensure the web app is built before syncing:
```bash
npm run build
npx cap add android
npx cap add ios
```

### 4. Permissions for Video/Audio (WebRTC / Agora RTC)
In `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

In `ios/App/App/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>Unmute needs camera access for live video sessions.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Unmute needs microphone access for live audio calls.</string>
```

### 5. UI & Viewport Adaptations
- Ensure `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">` in `index.html`.
- Add safe area insets support in Tailwind / CSS:
  `padding-top: env(safe-area-inset-top);`
  `padding-bottom: env(safe-area-inset-bottom);`
