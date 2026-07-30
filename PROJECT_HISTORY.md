# 2026-07-27 02:11:00 +09:00 - Port Health Conversation Monitoring to Render root backend

## Context

- Render production uses repository root:
  - Root Directory: empty
  - Build Command: `npm install`
  - Start Command: `npm run bridge`
- Root `package.json` has `bridge: node server/index.js`.
- Root `server/index.js` mounts root `server/routes/chami.js` at `/api/chami`.
- The previous Health Conversation Monitoring backend work was implemented in
  `tsunagari-care/server`, which is not the Render production backend.

## Root Backend Changes

- Ported `health_concern` handling into root `server/routes/chami.js`.
- `POST /api/chami/alert` now routes `type=health_concern` to a dedicated
  handler before legacy alert handling.
- Added strict payload validation:
  - required fields: `type`, `status`, `level`, `category`, `symptom`,
    `message`, `language`, `eventId`
  - `status=detected`
  - `level=info|warning|danger`
  - `category=health`
  - `language=ja|vi|unknown`
  - symptom whitelist for firmware health detector output
  - `eventId` string trim max 128, hashed before use as RTDB dedupe key
  - `message` max 300
  - optional `confidence` number 0..1
  - optional `transcript` max 160, stored only when
    `HEALTH_CONCERN_STORE_TRANSCRIPT=true`
  - nested object/array fields are rejected
- Backend creates server timestamps and does not trust client timestamps.
- Writes RTDB:
  - `health_concerns/{healthConcernId}`
  - `health_concern_dedup/{sha256(eventId)}`
  - `alerts/{alertId}` for old dashboard/firmware compatibility
- Duplicate `eventId` returns `{ ok:true, duplicate:true, eventId }` and does
  not create new history, alert, or LINE notification.
- Added `POST /api/chami/health-concerns/:healthConcernId/resolve`:
  - updates `resolved=true`
  - sets `resolvedAt` and `updatedAt` with server timestamp
  - sets `resolvedBy=dashboard`

## LINE Policy

- Root `server/lib/caregiverNotificationService.js` now understands
  `health_concern`.
- LINE is eligible only when:
  - `type=health_concern`
  - `status=detected`
  - `level=danger`
  - `HEALTH_CONCERN_LINE_ENABLED` is not set to `false`
- `info` and `warning` are stored but do not send LINE.
- Duplicate backend events do not call LINE.
- The caregiver notification record keeps backward-compatible fields and adds:
  - `sourceEventType`
  - `sourceEventId`
  - `healthConcernId`
  - `level`
  - `symptom`
  - `completedAt`
- The LINE message is Japanese-first and avoids diagnosis or certainty claims.

## Preserved Root Behavior

- Medicine follow-up and medicine scheduler are not replaced.
- Reminder handling, smart-home routes, fall detection alerts, device auth,
  Chami state route, command polling/completion, heartbeat/API compatibility,
  existing LINE retry/dedupe, and `/api/chami/line-test` remain in the root
  backend.
- `server/lib/lineMessagingService.js` was checked and did not need a blind
  copy from the nested backend.

## Frontend Location

- Dashboard/frontend remains in the nested app:
  - `tsunagari-care/index.html`
  - `tsunagari-care/src/js/firebase-service.js`
  - `tsunagari-care/src/js/dashboard.js`
  - `tsunagari-care/src/css/style.css`

## Checks

- `node --check server/routes/chami.js`
- `node --check server/lib/caregiverNotificationService.js`
- `node --check server/lib/lineMessagingService.js`
- `node --check server/index.js`
- `node --check tsunagari-care/src/js/firebase-service.js`
- `node --check tsunagari-care/src/js/dashboard.js`
- `git diff HEAD --check`

## Manual Render Test

- Deploy root backend to Render.
- POST valid `health_concern` with `level=info`: expect history and alert, no LINE.
- POST valid `health_concern` with `level=warning`: expect history and alert, no LINE.
- POST valid `health_concern` with `level=danger`: expect history, alert, and LINE
  eligible unless `HEALTH_CONCERN_LINE_ENABLED=false`.
- Repeat the same `eventId`: expect duplicate response and no new record/LINE.
- Resolve from dashboard: expect `health_concerns/{id}/resolved=true`.

No secrets, tokens, LINE IDs, or Firebase private values were recorded.
