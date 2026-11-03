# Unmute v2 — New Feature Implementation Roadmap & Status

This document tracks the planning and implementation of critical features to transform Unmute into an empathetic, high-retention, anonymous philosophical mentorship platform.

---

## Master Task Board

| Task ID | Feature Name | Planning Agent | Implementation Agent | Status | Completed At |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **TASK-1** | **Remove Live Rupee Counter in MeetingRoom** | Completed (`fd99ba04`) | Completed (`d756ddab`) | **Done** | 2026-11-03 23:48 IST |
| **TASK-2** | **Incognito Mode for Mentees** | Completed (`457c6534`) | Completed (`171ce182`) | **Done** | 2026-11-04 00:32 IST |
| **TASK-3** | **Latest Availability on Find Mentors Page** | Completed (`b7613dba`) | Completed (`156e94bb`) | **Done** | 2026-11-04 00:18 IST |
| **TASK-4** | **Pre-Session Intent Card (Listen vs. Perspective vs. Action)** | Completed (`f82f7e7c`) | Completed (`99cbd6d8`) | **Done** | 2026-11-04 00:05 IST |
| **TASK-5** | **"Available to Talk Now" On-Demand Toggle** | Completed (`a4d52385`) | Completed (`bf7275db`) | **Done** | 2026-11-04 00:20 IST |
| **TASK-6** | **Async Voice Dilemmas (Audio Mentorship)** | Completed (`4321c1ab`) | Completed (`815dca26`) | **Done** | 2026-11-04 00:37 IST |
| **TASK-7** | **Crisis Support & Emergency Lifelines Modal** | Completed | Completed | **Done** | 2026-11-04 00:54 IST |

---

## Detailed Task Logs

### TASK-1: Remove Live Rupee Counter in MeetingRoom
* **Goal:** Eliminate financial anxiety during sensitive 1-on-1 mentorship calls by removing live ticking rupee amounts and per-minute rate tags from the in-call floating HUD, while preserving the backend 15-minute minimum charge.
* **Planning Agent ID:** `fd99ba04-cf16-4820-aae1-da98a1792caf`
* **Implementation Agent ID:** `d756ddab-6fbb-4bd6-b4a8-69a7bac4f6c2`
* **Status:** Done
* **Key Components:**
  1. `frontend/src/pages/MeetingRoom.jsx`: Removed `IndianRupee` and `formatINR` imports.
  2. In `HUDPills`, removed the live ticking Rupee pill and the `@ ₹X/min` rate tag; retained the elapsed session time pill and connection status.
  3. In session ending modal, clarified active talk duration and explicitly displayed the 15-minute minimum policy.
  4. Verified with `npm run build` in `frontend/`.

---

### TASK-2: Incognito Mode for Mentees
* **Goal:** Enable users to book sessions and join video calls completely anonymously without revealing real names or demographics to mentors.
* **Planning Agent ID:** `457c6534-ae2f-47ee-af50-8a0a9aafb52a`
* **Implementation Agent ID:** `171ce182-b3d7-488e-aa4c-50e28ec6cde2`
* **Status:** Done
* **Key Components:**
  1. Migration `010_bookings_incognito.sql`: Added `is_incognito BOOLEAN NOT NULL DEFAULT FALSE` with index on `bookings(is_incognito)`.
  2. Backend `bookingService.js`: `publicBooking(b, viewerRole)` masks mentee name to "Anonymous Mentee" and suppresses email, gender, dob, and city when viewed by mentor. `sendBookingConfirmationEmails` suppresses mentee email on mentor calendar invite.
  3. Backend `meetingService.js`: `issueCredentials` sets `counterpart_name = 'Anonymous Mentee'` and `counterpart_avatar = null` for mentor, sets `self_name = '${mentee_name} (Incognito)'` for mentee, and returns `is_incognito: true`.
  4. Frontend `Book.jsx`: Added Incognito Mode toggle checkbox with Shield icon and explanation before confirmation.
  5. Frontend `MeetingRoom.jsx`: Automatically starts camera off (`video.setEnabled(false)`, `setCamOff(true)`) for incognito mentees; adds purple `Incognito Active` HUD pill.
  6. Frontend `BookingDetail.jsx` & `MyBookings.jsx`: Displays Incognito pill and mentor privacy notice.
  7. Verified: `tests/incognito.test.js` passed 100%.

---

### TASK-3: Latest Availability on Find Mentors Page
* **Goal:** Display the earliest bookable slot directly on mentor cards in the mentor discovery directory and top quick-pick carousel so users don't have to click into individual profiles.
* **Planning Agent ID:** `b7613dba-a0bd-4a04-9357-a794080e00a9`
* **Implementation Agent ID:** `156e94bb-ec3f-4ba6-8f95-510ed61eb45a`
* **Status:** Done
* **Key Components:**
  1. Backend `availabilityService.js`: Implemented `batchGetNextAvailableSlots` using an optimized PostgreSQL CTE evaluating templates, overrides, and bookings in 1 single database round-trip.
  2. Backend `mentorService.js` & `mentors.routes.js`: Added `GET /api/mentors/upcoming-availability` returning mentors ordered by earliest slot.
  3. Frontend `UpcomingAvailability.jsx`: Horizontal carousel on `/mentors` showcasing mentors with earliest bookable slots.
  4. Frontend `MentorCard.jsx`: Added "Next: [Date/Time]" badge and direct "Book Slot" action with query param autofill.
  5. Verified: `tests/upcomingAvailability.test.js` passed 100%.

---

### TASK-4: Pre-Session Intent Card (Listen vs. Perspective vs. Action)
* **Goal:** Let mentees select their intention for the session ("Just Listen", "Perspective & Guidance", or "Action Plan") so Buddhist peer mentors deliver the exact guidance style expected.
* **Planning Agent ID:** `f82f7e7c-94ce-429d-a4d5-25530520e0fc`
* **Implementation Agent ID:** `99cbd6d8-784c-4244-876e-c5162574bda6`
* **Status:** Done
* **Key Components:**
  1. Migration `011_bookings_intent_type.sql`: Added `intent_type TEXT DEFAULT 'perspective' CHECK (intent_type IN ('just_listen', 'perspective', 'action_plan'))`.
  2. Backend `bookingService.js` & `meetingService.js`: Validated, persisted, and surfaced `intent_type` across bookings and Agora room credentials.
  3. Frontend `intentTypes.js`: Color-coded configuration with icons (Heart, Compass, Target).
  4. Frontend `Book.jsx`: 3-card interactive intent selector.
  5. Frontend `MeetingRoom.jsx`: Top intent guidance banner for mentors and comfort reassurance for mentees.
  6. Frontend `BookingDetail.jsx`: Session Intent & Focus Card with custom guidance.
  7. Verified: Unit and integration tests passing 100%.

---

### TASK-5: "Available to Talk Now" On-Demand Toggle & Instant Matching
* **Goal:** Enable mentors to toggle real-time availability with auto-expiration (e.g., 30m, 1h, 2h) so distressed/impulse mentees can connect immediately without calendar booking friction.
* **Planning Agent ID:** `a4d52385-fbfa-4416-92b8-d2b5b18c2791`
* **Implementation Agent ID:** `bf7275db-5773-4397-82a3-9882313cd438`
* **Status:** Done
* **Key Components:**
  1. Migration `012_mentor_available_now.sql`: Added `is_available_now` and `available_now_until` to `mentor_profiles` and `is_instant` to `bookings`.
  2. Backend `POST /api/availability/available-now`: Mentor live toggle endpoint with duration options.
  3. Backend `POST /api/bookings/instant`: Instant booking generation with slot window open immediately.
  4. Frontend `MentorAvailability.jsx`: "Go Live: Available to Talk Now" card with countdown ticker.
  5. Frontend `MentorList.jsx` & `MentorCard.jsx`: "Available Now" filter chip, pulsing green badge, and "⚡ Connect Now" CTA.
  6. Frontend `InstantConnectModal.jsx`: 1-click modal routing directly into `/meetings/:uuid`.
  7. Verified: `tests/availableNow.test.js` passed 100%.

---

### TASK-6: Async Voice Dilemmas (Audio Mentorship)
* **Goal:** Enable ₹99 async voice mentorship where mentees record audio dilemmas (up to 3 min) with optional anonymity and notes, and mentors record audio answers + written takeaways, earning 70% (₹69.30) payout.
* **Planning Agent ID:** `4321c1ab-3990-41e0-9771-09154ac5b204`
* **Implementation Agent ID:** `815dca26-1e9a-479b-b67d-a0b42cc9b23d`
* **Status:** Done
* **Key Components:**
  1. Migration `013_voice_dilemmas.sql`: Extended `wallet_transactions_reason_check` to include `'voice_dilemma_fee'`, `'voice_dilemma_payout'`, `'voice_dilemma_refund'`. Created `voice_dilemmas` table with audit timestamps and indexes.
  2. Backend `voiceDilemmaService.js` & `routes/voiceDilemmas.routes.js`: Transactional wallet debit (₹99) and mentor payout (₹69.30 [70%]), base64 audio disk persistence, HTML5 audio streaming endpoint `/api/voice-dilemmas/audio/:filename`.
  3. Frontend `VoiceDilemmaModal.jsx`: Browser `MediaRecorder` audio recording modal with live timer, preview player, category dropdown, anonymous toggle, and wallet balance check.
  4. Frontend `VoiceDilemmaCard.jsx`: Audio playback card with written takeaway and mentor recording panel.
  5. Frontend integration in `MentorCard.jsx`, `profile-card.jsx`, and `Dashboard.jsx`.
  6. Verified: `tests/voiceDilemmas.test.js` passed 100%.

---

### TASK-7: Crisis Support & Emergency Lifelines Button & Modal
* **Goal:** Provide immediate, non-stigmatizing, 1-tap access to 24/7 verified clinical crisis helplines (Tele-MANAS, KIRAN, Vandrevala Foundation, AASRA, 112) across meeting rooms, navigation, and booking flows, complete with mentor de-escalation protocols when self-harm or suicidal thoughts are mentioned.
* **Status:** Done
* **Key Components:**
  1. Component `CrisisSupportModal.jsx`: Contains 1-tap direct dial (`tel:14416`, `tel:9999666555`, etc.), hours, multi-lingual coverage, copy-to-clipboard actions, and a dedicated "Mentor Emergency Protocol" tab with empathetic de-escalation guidelines.
  2. Meeting Room `MeetingRoom.jsx`: Added top HUD "Crisis Support" button (`LifeBuoy` badge in rose tone) and bottom in-call control bar SOS button for immediate accessibility during active sessions.
  3. Global Navigation `Header.jsx`: Added discreet, reassuring "Crisis Help" button on desktop and in mobile drawer.
  4. Booking Flow `Book.jsx`: Added an empathetic crisis reminder and modal trigger below the billing disclaimer.
  5. Verified: `npm run build` compiled cleanly in 12.38s.
