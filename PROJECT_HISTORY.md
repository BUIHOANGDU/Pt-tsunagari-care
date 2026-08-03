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

# 2026-07-31 Dashboard Vietnamese/Japanese i18n Audit

## Scope

- Frontend only: `tsunagari-care/index.html`,
  `tsunagari-care/src/js/i18n.js`, and
  `tsunagari-care/src/js/dashboard.js`.
- Backend, nested backend, firmware, Firebase config, and server routes were not
  changed.

## Changes

- Expanded the centralized `ja`/`vi` dictionary for dashboard headers, robot
  states, smart-home labels, medicine reminder labels, health history, care
  logs, caregiver notifications, fall response flow, alert center, validation
  messages, demo source labels, and camera/fall alert metadata.
- Removed hardcoded UI status labels such as `No response`, `Confirmed`,
  `Sent`, and mixed Japanese/Vietnamese fallback headings from dashboard render
  paths.
- Added frontend mappers for legacy demo data so saved Vietnamese system
  messages and demo names display in the currently selected language without
  changing user-entered medicine names, device names, device IDs, event IDs, or
  technical values.
- Re-rendered dynamic panels on language change: robot status, alerts, care
  logs, caregiver notifications, reminders, smart-home devices, health history,
  fall response timeline, and fall alert history.
- Kept the language switcher behavior local-only with `localStorage` key
  `tsunagariCareLanguage`; default language remains Japanese.

## Checks

- `node --check tsunagari-care/src/js/dashboard.js`
- `node --check tsunagari-care/src/js/i18n.js`
- `node --check tsunagari-care/src/js/firebase-service.js`
- i18n key coverage check for `uiText(...)` and `data-i18n*` references
- hardcoded mixed-language audit for requested dashboard strings
- `git diff HEAD --check`

## Manual Tests To Run

- Switch `日本語` to `Tiếng Việt` and back without reload.
- Verify smart-home demo names, medicine reminders, care logs, alert badges,
  caregiver notifications, robot status, and fall timeline all switch language.
- Confirm Japanese mode does not show Vietnamese/English system labels, except
  user data, names, device IDs, event IDs, endpoints, and technical values.
- Confirm Vietnamese mode does not show Japanese/English system labels, except
  user data, names, device IDs, event IDs, endpoints, and technical values.

No secrets were recorded.

# 2026-08-03 Date, Time & Environment Widget

## Goal

- Add a compact dashboard block for current date, realtime clock, outdoor
  weather, and room environment.
- Keep dashboard bilingual in Japanese and Vietnamese.
- Use `Asia/Tokyo` for date/time formatting regardless of the client machine
  timezone.

## Backend Weather Provider

- Added `GET /api/weather/current` on the root production backend.
- Provider: Open-Meteo forecast API, called server-side only and without API
  secrets.
- Endpoint returns normalized location and weather fields:
  `temperatureC`, `apparentTemperatureC`, `humidityPercent`, `weatherCode`, and
  `observedAt`.
- Weather request timeout is 7 seconds.
- RAM cache defaults to 10 minutes.
- Cache config is validated with min 5 minutes and max 60 minutes.
- If upstream fails and cache exists, the endpoint returns the stale cached
  weather with `stale: true`.
- If upstream fails and no cache exists, the endpoint returns `ok: false`
  without crashing the server.

## Location Config

- Added optional env variables:
  - `WEATHER_LOCATION_NAME=Tokyo`
  - `WEATHER_LATITUDE=35.6762`
  - `WEATHER_LONGITUDE=139.6503`
  - `WEATHER_TIMEZONE=Asia/Tokyo`
  - `WEATHER_CACHE_MINUTES=10`
- Invalid latitude, longitude, timezone, or cache values fall back safely.
- No browser geolocation and no client-side weather secret are used.

## Frontend Widget

- Widget is placed after the top signal strip and before overview stats.
- Desktop layout uses four compact tiles: date, current time, outdoor
  temperature, and room temperature.
- Mobile layout keeps the environment widget as a compact 2x2 grid.
- Date/time uses `Intl.DateTimeFormat` with `timeZone: "Asia/Tokyo"`.
- Clock updates every second and clears intervals on page hide/unload lifecycle.
- Outdoor weather fetches on page load, refreshes every 10 minutes, skips
  refresh while the tab is hidden, and refreshes when visible again if stale.
- Weather code mapping is centralized for clear, partly cloudy, cloudy, fog,
  drizzle, rain, heavy rain, snow, thunderstorm, and unknown.
- Weather UI has loading, success, stale, and unavailable states.

## Room Demo Environment

- Room environment uses a session-stable demo adapter:

```json
{
  "temperatureC": 25,
  "humidityPercent": 50,
  "source": "demo",
  "updatedAt": "...",
  "online": true
}
```

- The UI clearly shows `デモ` / `Mô phỏng` until a real sensor is connected.
- Future sensor schema is expected at `rooms/chami_001/environment`:

```json
{
  "temperatureC": 24.8,
  "humidityPercent": 53,
  "sensorType": "BME280",
  "deviceId": "room_sensor_001",
  "updatedAt": 1785740400000,
  "online": true
}
```

The current frontend component already consumes a shared room environment model,
so replacing the demo provider with Firebase sensor data should not require a
UI rewrite.

## Files Changed

- `.env.example`
- `server/index.js`
- `server/routes/weather.js`
- `server/lib/weatherService.js`
- `server/lib/weatherService.test.js`
- `tsunagari-care/index.html`
- `tsunagari-care/src/css/style.css`
- `tsunagari-care/src/js/dashboard.js`
- `tsunagari-care/src/js/i18n.js`
- `PROJECT_HISTORY.md`

## Checks

- `node --check server/lib/weatherService.js`
- `node --check server/lib/weatherService.test.js`
- `node --check server/routes/weather.js`
- `node --check server/index.js`
- `node --check tsunagari-care/src/js/dashboard.js`
- `node --check tsunagari-care/src/js/i18n.js`
- `node --check tsunagari-care/src/js/firebase-service.js`
- `node server/lib/weatherService.test.js`
- i18n key coverage check
- `git diff HEAD --check`

## Live Tests Not Run

- Render production endpoint smoke test was not run in this coding pass.
- Browser visual tests for desktop/mobile were not run in a live dashboard.
- Real upstream Open-Meteo request was not run by the local test; unit tests use
  mocked provider responses and failures.

No secrets were recorded.

# 2026-07-31 Dashboard Command Toast Notifications

## Scope

- Frontend only: `tsunagari-care/index.html`,
  `tsunagari-care/src/css/style.css`, `tsunagari-care/src/js/dashboard.js`,
  and `tsunagari-care/src/js/i18n.js`.
- Backend, firmware, Firebase config, nested server, and command schema were not
  changed.

## Changes

- Removed the fixed Command Queue panel from the dashboard layout so lower cards
  naturally move up.
- Added a fixed top-right toast container with `aria-live="polite"` and
  `aria-atomic="true"`.
- Added command toast cards with icon, title, description, status badge, close
  button, and progress bar.
- Toast durations:
  - success/completed: 4 seconds
  - pending: 6 seconds
  - processing: 6 seconds
  - warning: 6 seconds
  - failed: 8 seconds
  - cancelled: 6 seconds
- Toasts are capped at 3 visible items; the oldest toast is removed when a
  fourth arrives.
- Dashboard command actions now show non-blocking toast notifications instead
  of modal `alert()` calls.
- Firebase command snapshots now trigger toasts for new command/status pairs:
  `pending`, `processing`, `completed`, `failed`, and `cancelled`.
- Duplicate suppression uses a `commandId + status` seen set plus a short-lived
  status/description fingerprint for locally created dashboard commands.
- Command descriptions are mapped to user-friendly Japanese/Vietnamese labels
  for living-room light, air conditioner, fan, and medicine reminder actions.
- Existing toasts re-render on language change when still visible.

## Checks

- `node --check tsunagari-care/src/js/dashboard.js`
- `node --check tsunagari-care/src/js/i18n.js`
- `node --check tsunagari-care/src/js/firebase-service.js`
- command queue removal audit for `commands-list`, `btn-refresh-commands`,
  `Command Queue`, `Hàng đợi lệnh`, and `PENDING`
- i18n key coverage check
- `git diff HEAD --check`

## Manual Tests To Run

- Send a dashboard command and verify a toast appears in the top-right corner.
- Change a command to `completed` and verify a success toast.
- Change a command to `failed` and verify a non-glaring failed toast with
  `role="alert"`.
- Verify auto-hide durations and the close button.
- Verify at most 3 toasts remain visible.
- Verify duplicate `commandId + status` snapshots do not create repeated toasts.
- Switch Japanese/Vietnamese and confirm new toasts use the selected language.
- Verify mobile width does not overflow.
- Verify the old Command Queue panel is gone and the grid closes the gap.

No secrets were recorded.

# 2026-07-31 00:00:00 +09:00 - Dashboard Japanese/Vietnamese UI language switcher

## Goal

- Add dashboard UI language mode for:
  - Japanese: `ja`
  - Vietnamese: `vi`
- Default language is Japanese for the Japan demo.
- User can switch to Vietnamese without page reload.
- Do not write language preference to Firebase.
- Do not affect LINE notification language or policy.

## I18n Architecture

- Added centralized dictionary:
  - `tsunagari-care/src/js/i18n.js`
- Exposed helpers:
  - `t(key)`
  - `setLanguage(language)`
  - `getCurrentLanguage()`
  - `applyTranslations()`
- Preference is stored in `localStorage` key:
  - `tsunagariCareLanguage`
- Valid values:
  - `ja`
  - `vi`
- Missing key fallback:
  - current language -> Japanese -> key
- The dashboard updates `document.documentElement.lang` to `ja` or `vi`.

## UI Switcher

- Added compact language switcher in the topbar near `Live demo` and
  `Care team`.
- Switcher labels:
  - `日本語`
  - `Tiếng Việt`
- Uses `aria-label` and updates active state without page reload.

## Translated Areas

- Topbar, hero, overview cards, robot labels, alert center, caregiver
  notifications, fall response panel, camera/fall panels, smart-home labels,
  medicine reminder panel/dialog, health history, care log panel, command queue,
  demo buttons, empty states, basic success/failure labels, and accessibility
  labels were moved to dictionary-driven text.
- Some technical data remains untranslated by design:
  - deviceId
  - eventId
  - endpoint/source names
  - user-entered medicine names
  - server-provided technical messages without a dictionary mapping

## Health History Translation

- Symptom labels now depend on current UI language:
  - Japanese labels such as `胸の痛み`
  - Vietnamese labels such as `Đau ngực`
- Health card message is generated from `symptom` and current language:
  - Japanese: `会話中に胸の痛みを訴えました。`
  - Vietnamese: `Người dùng cho biết đang bị đau ngực.`
- If a health message mapping is missing, dashboard falls back to sanitized
  backend `message`, then generic health fallback.
- Severity/status labels are translated:
  - `info`, `warning`, `danger`
  - `resolved`, `unresolved`
  - `pending`, `sent`, `failed`
- Colors do not change when switching language.

## Data and LINE

- No Firebase schema change for dashboard i18n.
- Firebase continues storing canonical data:
  - `symptom`
  - `level`
  - `language`
  - `message`
  - timestamps
- No duplicate Japanese/Vietnamese messages are written to Firebase for UI.
- LINE remains Japanese-first and independent from dashboard localStorage.

## Retention Reminder

- Retention behavior from the previous change remains:
  - each history collection keeps at most 30 records
  - dashboard defaults to 5 health records
  - user can expand to at most 30

## Checks

- `node --check tsunagari-care/src/js/i18n.js`
- `node --check tsunagari-care/src/js/dashboard.js`
- Run full dashboard JS checks and `git diff HEAD --check` before handoff.

## Manual Tests To Run

- First open defaults to Japanese.
- Switch to Vietnamese; static text changes immediately without reload.
- Refresh keeps Vietnamese.
- Switch back to Japanese and refresh keeps Japanese.
- Health `chest_pain` shows `胸の痛み` in Japanese and `Đau ngực` in Vietnamese.
- `danger` shows `緊急` in Japanese and `Khẩn cấp` in Vietnamese.
- Empty state uses the selected language.
- Missing translation key does not crash and falls back.
- Mobile topbar keeps the language switcher usable.

No secrets, tokens, LINE IDs, or Firebase private values were recorded.

# 2026-07-31 00:00:00 +09:00 - Health History UI and RTDB retention

## UI Health History Redesign

- Redesigned dashboard panel `健康状態の履歴` in the nested frontend app.
- Health cards now use a compact layout:
  - one-line header with health dot, Japanese symptom label, and severity badge
  - two-line clamped Japanese message
  - footer with timestamp, language, deviceId, and resolved status
  - `対応済み` action only for unresolved records
- Default dashboard display is 5 health records.
- `すべて表示` expands to at most 30 records.
- `閉じる` collapses back to 5 records.
- Empty state is `健康に関する履歴はありません。`.
- Resolve button disables while saving, shows `保存中...`, then changes to a
  `対応済み` badge without deleting the record or sending LINE again.

## Japanese Symptom Labels and Message Normalization

- Dashboard no longer shows raw symptom IDs such as `chest_pain`.
- Symptom IDs are mapped to Japanese labels.
- Dashboard message text is normalized to Japanese templates such as
  `会話中に胸の痛みを訴えました。`.
- The UI avoids diagnosis wording and does not show transcript by default.

## Backend Retention

- Added reusable root backend helper:
  - `server/lib/rtdbRetentionService.js`
- Default history max records:
  - `RTDB_HISTORY_MAX_RECORDS=30`
  - min 10
  - max 100
  - invalid values fallback to 30
- New history records add `createdAtMs: Date.now()` while keeping existing
  `createdAt` / `receivedAt` fields for backward compatibility.
- Retention runs after successful backend writes and is scheduled without
  awaiting the main request response.
- Retention errors are caught and logged; they do not fail the original request.
- Log format:
  - `[Retention] prune start path=<path> max=<n>`
  - `[Retention] current count=<n> path=<path>`
  - `[Retention] deleted count=<n> path=<path>`
  - `[Retention] skipped count=<n> path=<path>`
  - `[Retention] failed path=<path> error=<safe-message>`

## Collections Applied

- `alerts`
- `health_concerns`
- `care_logs`
- `care_events`
- `caregiver_notifications`

Root backend currently writes `alerts`, `health_concerns`, `care_logs`, and
`caregiver_notifications`. No root backend writer for `care_events` was found,
but the retention scheduler includes the path when history writes occur.

## Collections Not Auto-Deleted

- `devices`
- `robots`
- `settings`
- `reminders`
- `commands` with pending work
- `health_concern_dedup`
- `line_notification_dedup`
- `care_event_dedup`

Commands are not pruned in this phase because pending commands must never be
deleted by a generic history retention rule.

## Oldest Record Logic

Retention sorts oldest first by:

1. `createdAtMs`
2. `createdAt`
3. `receivedAt`
4. decoded Firebase push key timestamp
5. Firebase key lexical order as a stable final tie-breaker

This prevents random deletion when timestamps are missing or equal.

## Frontend Query Limit

- `listenHealthConcerns` queries at most 30 records with
  `orderByChild("createdAtMs").limitToLast(30)`.
- Medicine care log listener is capped at 30 records.
- UI still renders a smaller default subset.
- Reminder active logic was not changed.

## Checks

- `node --check server/routes/chami.js`
- `node --check server/lib/caregiverNotificationService.js`
- `node --check server/lib/medicineReminderScheduler.js`
- `node --check server/lib/rtdbRetentionService.js`
- `node --check server/lib/rtdbRetentionService.test.js`
- `node --check tsunagari-care/src/js/firebase-service.js`
- `node --check tsunagari-care/src/js/dashboard.js`
- `node server/lib/rtdbRetentionService.test.js`
- `git diff HEAD --check`

## Manual UI Tests To Run

- 0 health records.
- 1 info record.
- 1 warning record.
- 1 danger unresolved record.
- 1 danger resolved record.
- 5 health records.
- 30 health records.
- long message text.
- mobile width.
- desktop width.

## Limitations and Next Steps

- Frontend syntax was checked, but no live browser console session was opened in
  this coding pass.
- RTDB retention test uses a local fake database; Render production should be
  smoke-tested after deploy with real Admin SDK credentials.
- Firebase rules should keep:

```json
"health_concerns": {
  ".read": true,
  ".write": false
}
```

No secrets, tokens, LINE IDs, or Firebase private values were recorded.
