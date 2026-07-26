# Project History

## 2026-07-25 01:31:20 +09:00

### Muc tieu

Hoan thien Medication Follow-up end-to-end tu event that cua Chami qua backend,
RTDB alert/care log va dashboard, khong suy dien `medicine_taken` tu scheduler.

### File da sua

- `server/routes/chami.js`
- `src/js/firebase-service.js`
- `src/js/dashboard.js`
- `index.html`
- `src/css/style.css`
- `PROJECT_HISTORY.md`

### Backend payload va validation

- Nguyen nhan metadata cu bi mat: route `/api/chami/alert` chi lay
  `source/type/level/message`, bo attempt/attempts/medicine metadata va hard-code
  `status=new`.
- Them nhanh rieng cho `medicine_taken` va `medicine_no_response`; alert cu van
  dung cung URL va schema tuong thich.
- Whitelist/sanitize type, source, level, status, message, attempt/attempts,
  medicineName, reminderId va createdAt. Khong ghi raw payload, client id hoac
  client server timestamp.
- `medicine_taken` bat buoc attempt integer 1..3, status normalized confirmed,
  level mac dinh info.
- `medicine_no_response` attempts integer 1..3 (mac dinh 3), status
  no_response, level mac dinh warning.
- medicineName trim/gioi han 100 ky tu, fallback tu
  `reminders/{reminderId}/medicineName`, sau do fallback `Thuoc`.
- reminderId mac dinh `medicine_morning`, chi nhan ky tu an toan.
- createdAt chap nhan number, numeric string, ISO va Timestamp-like object;
  thieu timestamp thi luu Firebase server timestamp. receivedAt luon server
  timestamp.
- Payload medicine khong hop le tra HTTP 400 va khong ghi RTDB.

### Alert, care log va dedupe

- Event hop le ghi cung metadata bang mot RTDB multipath update vao:
  `alerts/{alertId}` va `care_logs/{careLogId}`.
- Care log co `category=medicine`; alert khong them category de giu schema cu.
- Dedupe transaction tai `care_event_dedup/{dedupeKey}`.
- Uu tien eventId hop le; neu khong co thi SHA-256 cua
  type/source/reminderId/attempt-or-attempts/createdAt normalized.
- Firmware hien tai co the khong gui createdAt; fallback dedupe theo ngay UTC
  nhan event. Cach nay chan retry trong ngay cho reminder daily, nhung eventId
  van la lua chon chinh xac nhat neu sau nay firmware bo sung.
- Duplicate tra `{ ok: true, duplicate: true }`, khong tao alert/care log moi.
- Neu multipath write loi sau lock, backend rollback dedupe marker va log loi.
- Dedupe records can chinh sach retention/cleanup trong mot buoc sau.

### FirebaseService va dashboard

- Them `normalizeTimestamp()` cho number, numeric string, ISO,
  Firebase Timestamp-like object va server timestamp da resolve.
- Them `listenMedicineCareLogs(callback, limit=50)` voi RTDB query gioi han theo
  prefix type `medicine_`, sort moi nhat truoc.
- `createCareLog` va `createAlert` giu medicine metadata cho demo.
- Care timeline toi da 3 dong, render:
  Sent / `Da gui loi nhac uong thuoc`;
  Confirmed / `Da uong thuoc` va attempt;
  No response / so lan nhac.
- Card `Lan nhac gan nhat` dung event medicine moi nhat de hien sent/taken/no
  response, khong sua reminder schedule data.
- Alert Center render medicine_taken bang success/info va
  medicine_no_response bang warning; emergency/fall logic khong bi doi.
- Demo `Da uong thuoc` va `Khong phan hoi` tao care log + alert source demo,
  khong tao command, khong goi firmware va khong cap nhat lastTriggeredDate.
- Loai bo legacy binder tung ghi de nut demo thanh command `remind_medicine`.

### Backward compatibility

- Khong sua firmware, scheduler timing/schema command, Firebase config/rules,
  server index hoac route URL.
- Alert legacy fallback status new va van ghi alerts.
- Khong sua emergency_check, fall timeline, smart-home, robot status, command
  queue hoac nut `Nhac ngay` trong card lich.

### Checks va test

- `node --check server/routes/chami.js`: pass.
- `node --check src/js/firebase-service.js`: pass.
- `node --check src/js/dashboard.js`: pass.
- `node --check server/index.js`: pass.
- `git diff --check`: pass; chi co canh bao LF/CRLF working copy.
- Project khong co test script ngoai `bridge`; local node_modules khong ton tai,
  nen khong khoi dong Express/Firebase Admin integration test tai may nay.
- Chua test end-to-end voi Render, RTDB production va firmware that.

### Test thu cong va next steps

1. Deploy lai Render vi route backend da thay doi.
2. Gui medicine_taken hop le va xac nhan alert + care log cung metadata,
   dashboard hien confirmed attempt.
3. Gui medicine_no_response va xac nhan warning, khong co medicine_taken.
4. Retry cung event hai lan; lan hai phai duplicate=true va khong tang record.
5. Gui medicine_taken thieu attempt; phai HTTP 400, khong ghi.
6. Gui emergency_response cu; Alert Center va fall timeline phai van dung.
7. Bam hai nut demo; xac nhan source demo va commands khong thay doi.
8. Khong can flash firmware lai cho thay doi backend/dashboard nay.
- Khong ghi secret, token, API key hoac service account.

## 2026-07-24 01:09:47 +09:00

### Muc tieu

Sua loi Medication Reminder Scheduler abort duplicate-lock transaction voi
`reason=invalid_type` tren Render.

### Nguyen nhan

- Scheduler da doc va validate reminder hop le, xac dinh reminder due va pending
  command la false.
- Code cu transaction tren toan record `reminders/{reminderId}` va validate lai
  `current` trong callback.
- Firebase Realtime Database co the goi transaction callback lan dau voi
  `current=null` khi local cache chua co record. `getInvalidReason(null)` tra
  `invalid_type`, callback return `undefined` va transaction bi abort.

### File da sua

- `server/lib/medicineReminderScheduler.js`
- `PROJECT_HISTORY.md`

### Cach sua

- Giu validation reminder snapshot truoc transaction: type, enabled, repeat,
  dinh dang time, target, gio due va last-triggered date.
- Chuyen duplicate lock sang transaction child path
  `reminders/{reminderId}/lastTriggeredDate`.
- Callback chap nhan `currentDate=null` va return ngay Tokyo hien tai de commit.
  Callback chi return `undefined` khi child da bang ngay hom nay; khong return
  `null` va khong transaction/xoa toan reminder record.
- Sau commit, update `lastTriggeredAt` va `updatedAt` bang Firebase server
  timestamp, sau do tao `remind_medicine` command va care log.
- Neu timestamp, command hoac care log loi, rollback `lastTriggeredDate` va
  `lastTriggeredAt` ve gia tri snapshot truoc do; log ro thanh cong/that bai.
- Them log path transaction, current date (ke ca null), committed date,
  timestamps updated va ly do already-triggered.

### Kiem tra va ket qua

- `node --check server/lib/medicineReminderScheduler.js`: pass.
- `node --check server/index.js`: pass.
- `git diff --check`: pass; chi co canh bao LF/CRLF cua working copy.
- Can deploy lai Render va test end-to-end de xac nhan command, care log va
  Chami. Dat reminder Tokyo hien tai +3 phut, xoa marker cua hom nay truoc test,
  va theo doi transaction `currentDate=null` commit thanh cong.
- Khong ghi secret, token, API key hoac service account.

## 2026-07-24 00:26:42 +09:00

### Muc tieu

Debug Medication Reminder Scheduler tren Render bang code va log, bo sung log
co kiem soat de xac dinh startup, RTDB, timezone, due check, transaction,
pending command, command creation va care log.

### File da sua

- `server/index.js`
- `server/lib/medicineReminderScheduler.js`
- `PROJECT_HISTORY.md`

### Ket qua dieu tra

- `server/index.js` da import va goi `startMedicineReminderScheduler()` trong
  callback `app.listen`; module-level guard dam bao scheduler chi start mot lan.
- Code cu chi dung `setInterval(..., 60000)`, nen tick dau tien phai cho toi da
  60 giay.
- Helper timezone cu khong normalize ket qua hour `24` cua mot so Node/ICU
  builds. Truong hop nay co the lam reminder `00:11` bi so sanh voi `24:11` va
  khong duoc coi la due.
- Log Render cu co Bridge API startup nhung khong co dong
  `Medicine reminder scheduler started`, du code trong commit local co dong do.
  Vi vay log cu chua chung minh process Render da chay dung source/commit nay.
  Transaction va pending check chua the la nguyen nhan cua lan test do neu
  scheduler chua co tick/due log.
- Firebase Admin scheduler dung chung `getDb()` tu `server/firebaseAdmin.js`;
  database duoc chon boi `FIREBASE_DATABASE_URL`. Code khong hard-code database
  URL va khong log credential. Log moi chi hien database id an toan va can xac
  nhan tren Render la `tsunagari-care-2026-default-rtdb`.

### Sua loi va debug log

- Them prefix `[MedicineScheduler]` cho log startup va moi tick.
- Them initial tick ngay sau startup, co `catch` rieng de khong crash Bridge API.
- Them log start requested, started interval, already-running guard va initial
  tick scheduled.
- Them log RTDB initialized, database id, reminder count va read failure.
- Them log Tokyo date/time dang `YYYY-MM-DD HH:mm`; normalize `24:xx` thanh
  `00:xx`.
- Them log ngan gon cho tung medicine reminder va ly do skip:
  disabled, invalid_time, invalid_repeat, invalid_target, time_not_due,
  already_triggered_today va pending_command_exists.
- Pending check chi chap nhan command co cung target, action
  `remind_medicine` va status chinh xac `pending`; command khac va command done
  khong chan.
- Transaction kiem tra lai reminder hien tai va gio due truoc khi commit marker.
  Log ro transaction start, committed, not committed va rollback.
- Them command/care-log ids vao log sau khi ghi thanh cong; khong log payload,
  secret, token, API key hay service account.

### Lenh kiem tra va ket qua

- `node --check server/index.js`: pass.
- `node --check server/lib/medicineReminderScheduler.js`: pass.
- `git diff --check`: pass; chi co canh bao LF/CRLF cua working copy.
- Test formatter voi `2026-07-23T15:11:00.000Z`: tra
  `2026-07-24 00:11` tai `Asia/Tokyo`.
- Khong chay duoc helper bang `require()` trong workspace vi local
  `node_modules/firebase-admin` chua ton tai. Khong co test Firebase production
  hoac Chami trong buoc static check.

### Gioi han van hanh

- Render free instance co the sleep; scheduler chi chay khi Node process dang
  thuc.
- Scheduler khong nhac bu. Neu process thuc luc `00:12` cho reminder `00:11`,
  reminder khong trigger. Can dat gio test sau khi service da live.
- Can deploy commit moi va doc log de xac nhan RTDB, transaction, command,
  care log va Chami end-to-end.

## 2026-07-23 23:50:57 +09:00

### Muc tieu lan sua

Phat trien Medication Reminder MVP cho TsunagariCare: dashboard quan ly lich nhac thuoc hang ngay, server scheduler tao command dung gio cho Chami, va ghi care log that khi da gui loi nhac.

### File da sua

- `index.html`
- `src/css/style.css`
- `src/js/firebase-service.js`
- `src/js/dashboard.js`
- `server/index.js`
- `server/lib/medicineReminderScheduler.js`
- `PROJECT_HISTORY.md`

### Data path

- Reminder chinh: `reminders/medicine_morning`
- Command queue: `commands`
- Care log: `care_logs`

### Reminder schema

- `type: "medicine"`
- `medicineName: "Thuoc huyet ap"` mac dinh tren UI
- `time: "08:00"` theo dinh dang `HH:mm`
- `timezone: "Asia/Tokyo"`
- `repeat: "daily"`
- `enabled: true`
- `targetDeviceId: "chami_001"`
- `lastTriggeredDate: null` hoac `YYYY-MM-DD` theo Asia/Tokyo
- `lastTriggeredAt: null` hoac timestamp
- `createdAt`, `updatedAt`

### UI da them

- Card `Lich nhac uong thuoc` gan khu vuc Care Logs / Command Queue.
- Field ten thuoc, gio uong, lap lai hang ngay, timezone Asia/Tokyo, toggle trang thai, lan nhac gan nhat.
- Nut `Luu lich` va `Nhac ngay`.
- Trang thai UI cho save, reminder disabled, pending command, va loi tao command.

### FirebaseService

- Them helper:
  - `getMedicineReminder(reminderId = "medicine_morning")`
  - `listenMedicineReminder(callback, reminderId = "medicine_morning")`
  - `saveMedicineReminder(data, reminderId = "medicine_morning")`
  - `setMedicineReminderEnabled(enabled, reminderId = "medicine_morning")`
  - `createMedicineReminderCommand(...)`
  - `hasPendingMedicineReminderCommand(target)`
- `saveMedicineReminder()` validate ten thuoc va gio `HH:mm`, giu `createdAt` cu neu record da ton tai, cap nhat `updatedAt`, khong ghi `undefined`.
- Nut `Nhac ngay` kiem tra pending command truoc khi tao va khong cap nhat `lastTriggeredDate`.

### Server scheduler

- Scheduler khoi tao trong `server/index.js` khi server listen thanh cong.
- Logic nam trong `server/lib/medicineReminderScheduler.js`.
- Chay moi 60 giay bang `setInterval`, co guard module-level `medicineReminderSchedulerStarted`.
- Dung `Intl.DateTimeFormat` voi timezone mac dinh `Asia/Tokyo`, fallback Asia/Tokyo neu timezone khong hop le.
- Moi tick doc `reminders`, loc reminder medicine daily enabled, so sanh `HH:mm` theo timezone cua reminder.
- Dung transaction tren reminder record de set `lastTriggeredDate` va `lastTriggeredAt`, tranh trigger trung trong cung ngay.
- Kiem tra pending command `target === targetDeviceId`, `action === "remind_medicine"`, `status === "pending"` truoc khi tao command.
- Sau transaction thanh cong moi tao command:
  - `source: "medicine_scheduler"`
  - `target: "chami_001"`
  - `type: "robot_action"`
  - `action: "remind_medicine"`
  - `text: "Da den gio uong thuoc: <medicineName>"`
  - `status: "pending"`
- Sau khi tao command thanh cong moi ghi care log:
  - `type: "medicine_reminder_sent"`
  - `source: "medicine_scheduler"`
  - `target: "chami_001"`
  - `message: "Da gui loi nhac uong thuoc"`
  - `status: "sent"`
- Khong tu ghi `Da uong thuoc`.
- Neu command/care log loi sau transaction, scheduler log loi va rollback marker ve gia tri truoc tick neu co the.

### Logging

- Co cac log chinh:
  - `Medicine reminder scheduler started`
  - `Medicine reminder scheduler tick`
  - `Medicine reminder due: <reminderId>`
  - `Medicine reminder skipped: disabled`
  - `Medicine reminder skipped: invalid time`
  - `Medicine reminder skipped: already triggered today`
  - `Medicine reminder command created`
  - `Medicine reminder care log created`
  - `Medicine reminder scheduler error`
  - `Medicine reminder command already pending`

### Lenh kiem tra da chay

- `node --check src/js/dashboard.js`
- `node --check src/js/firebase-service.js`
- `node --check server/index.js`
- `node --check server/lib/medicineReminderScheduler.js`
- `git diff --check`
- `Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"`
- `npm run` (bi PowerShell execution policy chan qua `npm.ps1`)
- `npm.cmd run`

### Ket qua kiem tra

- Tat ca lenh `node --check` o tren: pass.
- `git diff --check`: pass, chi co canh bao LF/CRLF cua Git tren Windows.
- `package.json` chi co script `bridge`, khong co build/test script rieng.
- `npm.cmd run`: pass va xac nhan chi co script `bridge`.
- Chua test thu cong voi RTDB/Chami that tu terminal nay.

### Viec con lai

- Test thu cong tren dashboard voi Firebase Realtime Database that:
  - luu lich `reminders/medicine_morning`
  - bam `Nhac ngay`
  - dat gio hien tai Tokyo + 1 phut va quan sat scheduler
  - kiem tra duplicate prevention khi co pending command
  - kiem tra disabled schedule khong tao command
- Khong ghi secret/token/API key/service account.

## 2026-07-06 01:00:47 +09:00

### Muc tieu lan sua

Noi Fall Detection Camera voi Chami `emergency_check` de khi camera confirm fall thi tu tao command cho robot qua Firebase Realtime Database.

### File da sua

- `fall-camera.html`
- `fall-camera.css`
- `fall-camera.js`
- `PROJECT_HISTORY.md`

### Logic moi

- Diem confirm fall nam trong `fall-camera.js` tai nhanh:
  - `lyingDuration >= CONFIRMED_FALL_MS`
  - `fallEventActive === true`
  - `currentFallAlertId` da co
  - `confirmedUpdateSent === false`
- Khi camera confirm fall:
  - log `Fall confirmed by camera`
  - giu nguyen flow Firestore `fallAlerts`
  - kiem tra pending command trong path `commands` voi:
    - `target === "chami_001"`
    - `action === "emergency_check"`
    - `status === "pending"`
  - neu da co pending command:
    - log `Emergency_check command already pending for Chami`
    - khong tao them command
  - neu chua co pending command:
    - kiem tra cooldown `FALL_EMERGENCY_COOLDOWN_MS = 30000`
    - neu con cooldown:
      - log `Fall emergency_check skipped by cooldown`
      - khong tao them command
    - neu hop le:
      - log `Creating Chami emergency_check command from fall camera`
      - tao command moi qua `FirebaseService.createRobotActionCommand(...)`
      - payload tao ra dung schema:
        - `source: "fall_camera"`
        - `target: "chami_001"`
        - `type: "robot_action"`
        - `action: "emergency_check"`
        - `text: "Camera phát hiện nguy cơ té ngã. Chami kiểm tra tình trạng người dùng."`
        - `status: "pending"`
      - log `Created Chami emergency_check command from fall camera`
- UI fall camera them status text nho de hien:
  - gui command thanh cong
  - skip do cooldown
  - skip do pending command
  - loi Firebase / command dispatch
- Trang `fall-camera.html` duoc nap them:
  - `firebase-database-compat.js`
  - `src/js/firebase-service.js`
  de tai su dung RTDB wrapper hien co cua project

### Lenh kiem tra da chay

- `Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'`
- `Get-Content package.json`
- `Get-Content fall-camera.js`
- `Get-Content fall-camera.html`
- `Get-Content fall-camera.css`
- `Get-Content src/js/firebase-service.js`
- `node --check fall-camera.js`
- `git status --short`

### Ket qua kiem tra

- `node --check fall-camera.js`: pass
- `package.json` hien khong co `build` script, nen khong co `npm run build` de chay cho repo static nay.
- Chua chay test webcam/Firebase that trong trinh duyet tu terminal nay.

### Cach test thu cong

1. Mo dashboard.
2. Mo `fall-camera.html`.
3. Bat webcam.
4. Tao tinh huong `Confirmed Fall`.
5. Kiem tra console co:
   - `Fall confirmed by camera`
   - `Creating Chami emergency_check command from fall camera`
   - `Created Chami emergency_check command from fall camera`
6. Kiem tra Firebase Realtime Database path `commands` co command:
   - `source: "fall_camera"`
   - `target: "chami_001"`
   - `action: "emergency_check"`
   - `status: "pending"`
7. Kiem tra UI fall camera hien:
   - `Đã yêu cầu Chami kiểm tra người dùng`
8. Trigger lai trong 30 giay:
   - neu da co pending command, phai hien `Chami đã có yêu cầu kiểm tra đang chờ xử lý`
   - neu khong co pending nhung van trong cooldown, phai hien `Đã phát hiện ngã, đang trong thời gian chờ chống spam`

### Viec con lai

- Test that trong browser voi webcam va Firebase that.
- Xac nhan command vua tao duoc robot Chami nhan va xu ly end-to-end trong demo.
- Neu can, bo sung UI debug/test hook rieng cho `Confirmed Fall` de demo nhanh hon ma khong can nam xuong that.

## 2026-07-06 01:14:21 +09:00

### Muc tieu lan sua

Sua nut `Test Fall Alert` de no goi truc tiep flow `emergency_check` cua Chami thay vi chi gui fall alert demo cu.

### File da sua

- `fall-camera.js`
- `PROJECT_HISTORY.md`

### Thay doi chinh

- Doi handler cua nut `Test Fall Alert` sang `handleManualTestFallAlert()`.
- Khi bam nut:
  - log `Manual demo fall confirmed`
  - cap nhat `fallStatus` sang `Confirmed Fall`
  - goi lai dung flow `handleFallConfirmed()`
- Vi dung lai `handleFallConfirmed()`, nut test nay tu dong ke thua:
  - cooldown `30 giay`
  - pending command check
  - log `Fall confirmed by camera`
  - log `Creating Chami emergency_check command from fall camera`
  - log `Created Chami emergency_check command from fall camera`
  - tao command Realtime Database `target=chami_001`, `action=emergency_check`
- Khong con dung log cu:
  - `Test fall alert sent: ...`

### Lenh kiem tra da chay

- `Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'`
- `Get-Content fall-camera.js`
- `node --check fall-camera.js`

### Ket qua kiem tra

- `node --check fall-camera.js`: pass

### Cach test thu cong

1. Mo `fall-camera.html`.
2. Bam `Test Fall Alert`.
3. Kiem tra Chrome Console co:
   - `Manual demo fall confirmed`
   - `Fall confirmed by camera`
   - `Creating Chami emergency_check command from fall camera`
   - `Created Chami emergency_check command from fall camera`
4. Kiem tra Firebase Realtime Database path `commands` co command:
   - `source: "fall_camera"`
   - `target: "chami_001"`
   - `action: "emergency_check"`
   - `status: "pending"`
5. Kiem tra UI hien:
   - `Đã yêu cầu Chami kiểm tra người dùng`

### Viec con lai

- Test that voi Firebase that va monitor ESP-IDF de xac nhan `hasCommand:true`, `action=emergency_check`.

## 2026-07-06 01:23:12 +09:00

### Muc tieu lan sua

Sua fallback cua Fall Camera de van tao duoc `emergency_check` cho Chami khi `FirebaseService` wrapper khong available tren `window`.

### File da sua

- `fall-camera.js`
- `PROJECT_HISTORY.md`

### Thay doi chinh

- Doi helper cu `getFirebaseServiceOrThrow()` thanh:
  - `getFirebaseService()`
  - `getRealtimeDatabaseOrThrow()`
- Thu tu uu tien moi:
  - neu co `FirebaseService` thi dung wrapper
  - neu wrapper khong available nhung `firebase.database()` co san thi fallback sang Realtime Database truc tiep
  - chi throw loi khi ca hai cach deu khong dung duoc
- Pending command check da hoat dong cho ca 2 truong hop:
  - wrapper `FirebaseService.listCommands()`
  - fallback `firebase.database().ref("commands").once("value")`
- Tao command da hoat dong cho ca 2 truong hop:
  - wrapper `FirebaseService.createRobotActionCommand(...)`
  - fallback `firebase.database().ref("commands").push(...)`
- Them log bat buoc:
  - `Using FirebaseService wrapper for Chami emergency command`
  - `Using firebase.database fallback for Chami emergency command`
  - `Creating Chami emergency_check command from fall camera`
  - `Created Chami emergency_check command from fall camera`

### Lenh kiem tra da chay

- `Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'`
- `Get-Content fall-camera.js`
- `Get-Content package.json | Select-String '"build"'`
- `node --check fall-camera.js`

### Ket qua kiem tra

- `node --check fall-camera.js`: pass
- `package.json` hien van khong co `build` script cho repo static nay.

### Cach test thu cong

1. Refresh `fall-camera.html` bang `Ctrl+F5`.
2. Bam `Test Fall Alert`.
3. Kiem tra console co:
   - `Manual demo fall confirmed`
   - `Fall confirmed by camera`
   - `Using firebase.database fallback for Chami emergency command`
   - `Created Chami emergency_check command from fall camera`
4. Kiem tra Realtime Database path `commands` co command moi:
   - `source: "fall_camera"`
   - `target: "chami_001"`
   - `action: "emergency_check"`
   - `status: "pending"`
5. Kiem tra UI hien:
   - `Đã yêu cầu Chami kiểm tra người dùng`

### Viec con lai

- Test that voi Firebase that va monitor ESP-IDF de xac nhan `hasCommand:true`, `action=emergency_check`, `TsunagariCare emergency check received`.

## 2026-07-07 00:52:12 +09:00

### Muc tieu lan sua

Sua loi real camera `Confirmed Fall` da hien tren UI nhung khong goi Chami `emergency_check`.

### File da sua

- `fall-camera.js`
- `PROJECT_HISTORY.md`

### Thay doi chinh

- Them `FALL_RESET_GRACE_MS = 1500` de khong reset fall event qua som chi vi vai frame hut `Lying`.
- Them guard `currentFallEventConfirmed` de moi fall event chi confirm mot lan.
- Tao ham duy nhat `confirmFallFromCamera()` cho nhanh real detection:
  - log `FallCamera: confirmed fall threshold reached`
  - log `FallCamera: real camera confirmed fall`
  - set `Fall Status = Confirmed Fall`
  - goi `handleFallConfirmed()`
- Bo sung log debug:
  - `FallCamera: lying duration ms=...`
- Real detection khong con phu thuoc cung luc vao `currentFallAlertId` moi duoc goi Chami:
  - neu command cho Chami duoc tao truoc, Firestore `fallAlerts` co the update confirmed sau khi `alertId` ve
  - neu `alertId` da co roi thi `markCurrentFallAlertConfirmedIfNeeded()` cap nhat confirmed nhu cu
- `updatePoseStatus()` khong con ep `fallStatus = Normal` ngay khi mat person trong mot frame; viec reset duoc de cho `handleFallDetection()` xu ly theo grace period.
- Neu user van dang `Lying`, code khong con reset event ngay va khong nen spam `Fall event ended`.

### Lenh kiem tra da chay

- `Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'`
- `Get-Content fall-camera.js`
- `node --check fall-camera.js`

### Ket qua kiem tra

- `node --check fall-camera.js`: pass

### Cach test thu cong

1. `Ctrl+F5` trang `fall-camera.html`.
2. Bam `Start Camera`.
3. Nam/nga that truoc webcam den khi UI hien `Confirmed Fall`.
4. Kiem tra console co:
   - `FallCamera: lying duration ms=...`
   - `FallCamera: confirmed fall threshold reached`
   - `FallCamera: real camera confirmed fall`
   - `Fall confirmed by camera`
   - `Creating Chami emergency_check command from fall camera`
   - `Created Chami emergency_check command from fall camera`
5. Kiem tra monitor ESP-IDF co:
   - `hasCommand:true`
   - `action=emergency_check`
   - `TsunagariCare emergency check received`

### Viec con lai

- Xac nhan that trong browser voi webcam va Firebase that.
- Neu van thay `Fall event ended` khi `Posture Status` van la `Lying`, can thu thap log moi quanh `lying duration` va `grace` de tinh chinh them.

## 2026-07-21 01:10:03 +09:00

### Muc tieu lan sua

Nang cap Fall Detection Camera V2 de state machine ro rang hon, UI de demo hon, giam bao gia va giu on dinh flow `emergency_check` cua Chami.

### File da sua

- `fall-camera.html`
- `fall-camera.css`
- `fall-camera.js`
- `PROJECT_HISTORY.md`

### Logic moi

- Chuan hoa state machine fall:
  - `normal`
  - `suspected_fall`
  - `confirmed_fall`
  - `chami_check_sent`
  - `cooldown`
- Them UI moi:
  - `Detection Stage`
  - `Lying Duration`
  - `Fall Confidence`
  - `Cooldown`
  - `Last Chami Command`
- Them nut `Reset Fall State`:
  - reset state demo hien tai
  - khong xoa Firebase alert/command
  - log `FallCamera: manual fall state reset`
- Them favicon inline:
  - `<link rel="icon" href="data:,">`
- Dieu chinh threshold demo:
  - `CONFIRMED_FALL_MS = 3000`
  - `FALL_RESET_GRACE_MS = 1500`
  - `FALL_EMERGENCY_COOLDOWN_MS = 30000`
- Logic moi cho lying/fall:
  - vao `Lying` thi log `FallCamera: lying candidate started`
  - log `FallCamera: lying duration ms=...` theo chu ky `1000 ms`
  - vao stage `suspected_fall`
  - du `CONFIRMED_FALL_MS` thi log:
    - `FallCamera: confirmed fall threshold reached`
    - `FallCamera: real camera confirmed fall`
  - goi flow `handleFallConfirmed()`
- Sau khi tao command cho Chami thanh cong:
  - vao stage `chami_check_sent`
  - hien `Đã yêu cầu Chami kiểm tra người dùng`
  - cap nhat `Last Chami Command`
- Sau khi nguoi dung roi khoi tu the nam qua grace period:
  - reset fall event
  - log `FallCamera: fall event reset after recovery`
  - neu dang cooldown thi UI hien countdown va log `FallCamera: fall emergency cooldown active`
- Van giu nguyen:
  - payload command `emergency_check`
  - uu tien `FirebaseService`, fallback `firebase.database()`
  - pending command check
  - nut `Test Fall Alert`

### Lenh kiem tra

- `Get-Content package.json`
- `Get-Content fall-camera.html`
- `Get-Content fall-camera.css`
- `Get-Content fall-camera.js`
- `node --check fall-camera.js`

### Ket qua test

- `node --check fall-camera.js`: pass
- `package.json` hien khong co `build` script, nen repo static nay khong co lenh build rieng de chay.
- Chua chay test webcam/Firebase that trong browser tu session nay.

### Viec con lai

- Test that trong browser voi webcam de xac nhan stage `Normal -> Suspected Fall -> Confirmed Fall -> Chami Check Sent -> Cooldown`.
- Test lai nut `Test Fall Alert` va `Reset Fall State`.
- Xac nhan command `emergency_check` van duoc tao dung schema va Chami nhan command nhu truoc.

## 2026-07-22 01:24:18 +09:00

### Muc tieu lan sua

Refactor giao dien Fall Detection Camera thanh dashboard gon trong mot man hinh desktop, giam scroll doc ma khong thay doi logic detection, Firebase hoac command Chami.

### File da sua

- `fall-camera.html`
- `fall-camera.css`
- `PROJECT_HISTORY.md`

### Thay doi chinh

- Mo rong `.camera-page` toi `min(1440px, calc(100% - 32px))` va giam padding, khoang cach header.
- Doi layout desktop thanh 2 cot: webcam/controls ben trai va status/local log ben phai.
- Giu webcam 16:9, gioi han kich thuoc theo chieu cao viewport tren desktop thap.
- Xep status cards thanh grid 2 cot, giam padding/font va cho phep `Last Chami command` tu xuong dong an toan.
- Gioi han Local Log toi da `190px`, cho scroll noi bo va giu nguyen gioi han 20 event trong JavaScript.
- Thu gon cac nut dieu khien de nam cung hang khi du cho, van `flex-wrap` khi man hinh hep.
- Responsive: 2 cot tu `1000px`, 1 cot duoi `1000px`, status ve 1 cot tren mobile duoi `640px`.
- Giu nguyen tat ca DOM id va khong sua `fall-camera.js`, MediaPipe Pose, fall state machine, FirebaseService hay payload `emergency_check`.

### Lenh kiem tra

- `node --check fall-camera.js`
- `git diff --check -- tsunagari-care/fall-camera.html tsunagari-care/fall-camera.css tsunagari-care/fall-camera.js`
- Doi chieu 20 DOM id bat buoc giua `fall-camera.html` va `fall-camera.js`.

### Ket qua kiem tra

- `node --check fall-camera.js`: pass.
- `git diff --check`: pass; chi co canh bao line ending LF/CRLF cua Git, khong co whitespace error.
- Ca 20 DOM id bat buoc ton tai dung 1 lan trong HTML va duoc JS truy cap dung 1 lan.
- `package.json` khong co build script; repo static nay khong co lenh build rieng de chay.
- Chua mo Live Server hoac test webcam/Firebase that trong session nay.

### Cach test thu cong

1. Mo `fall-camera.html` bang Live Server va nhan `Ctrl+F5`.
2. Test `Start Camera`, `Stop Camera`, `Test Fall Alert`, `Reset Fall State` va `Clear Local Log`.
3. Xac nhan skeleton va stage `Normal -> Suspected Fall -> Confirmed Fall -> Chami Check Sent` van cap nhat.
4. Tren desktop, xac nhan webcam/status hien 2 cot va Local Log scroll ben trong khung.
5. Thu hep trinh duyet duoi `1000px` va `640px` de xac nhan layout ve 1 cot, nut khong bi vo.

### Viec con lai

- Xac nhan truc quan tren man hinh desktop thuc te va tinh chinh neu do phan giai demo co chieu cao dac biet.
- Test webcam, Firebase va robot Chami that sau khi refresh bang Live Server.

## 2026-07-22 01:47:55 +09:00

### Muc tieu lan sua

Them Dashboard Fall Response Timeline de hien thi ro flow Camera phat hien nga -> gui Chami kiem tra -> ket qua -> canh bao nguoi nha ma khong can doc Console/monitor.

### File da sua

- `index.html`
- `src/js/dashboard.js`
- `src/css/style.css`
- `PROJECT_HISTORY.md`

### Data path da dung

- Firestore `fallAlerts`: doc `fall_detected` co `status=confirmed` hoac `confirmedAt`, kem `cameraId`, `location`, `createdAt`.
- Realtime Database `commands`: command `source=fall_camera`, `target=chami_001`, `type=robot_action`, `action=emergency_check`.
- Realtime Database `alerts`: alert Chami `type=emergency_response`, `level=danger`, `source=chami_001`; message duoc dung de phan biet danger va no_response.
- Realtime Database `care_logs`: chi duoc dung lam bang chung safe neu log co nguon Chami, ngu canh emergency/fall va status/message safe ro rang.
- `devices` van duoc dashboard doc cho robot/device status, nhung khong duoc dung de suy dien ket qua emergency.

### Logic timeline

- Them card `Quy trinh xu ly nga` gom 5 buoc: fall detected, Chami command, Chami checking, response result va family alert.
- Chi hien thi flow gan nhat trong 24 gio; tuong quan command/result trong cua so 15 phut quanh fall event.
- Timeline tu cap nhat bang listener realtime hien co, khong them polling.
- Nho command `emergency_check` da quan sat trong phien dashboard de khong mat buoc command ngay khi backend xoa command sau xu ly.
- Danger va no_response chi hien thi khi co alert `emergency_response` that tu Chami.
- Safe chi hien thi khi co care log safe that; neu thieu thi hien `Dang cho ket qua tu Chami` va log `Dashboard: Safe result log is not available yet`.
- Timeline hien mot flow gan nhat de card gon; desktop hien ngang, tablet cuon ngang va mobile hien doc.
- Khong sua `firebase-service.js`, Firebase config, Fall Camera, backend hay firmware.

### Logging

- `Dashboard: Fall response timeline data loaded`
- `Dashboard: Fall response timeline updated`
- `Dashboard: No recent fall response timeline`
- `Dashboard: Safe result log is not available yet`

### Lenh kiem tra

- `node --check src/js/dashboard.js`
- `node --check src/js/firebase-service.js`
- `git diff --check -- tsunagari-care/index.html tsunagari-care/src/js/dashboard.js tsunagari-care/src/css/style.css`
- Kiem tra so cap dau ngoac CSS.

### Ket qua kiem tra

- `node --check src/js/dashboard.js`: pass.
- `node --check src/js/firebase-service.js`: pass; file nay khong bi sua.
- `git diff --check`: pass; chi co canh bao line ending LF/CRLF cua Git.
- CSS co so dau ngoac mo/dong bang nhau.
- `package.json` khong co build script, nen khong co lenh build frontend rieng.
- Chua chay Live Server/Firebase/robot test that trong session terminal nay.

### Cach test thu cong

1. Mo `index.html` va `fall-camera.html` bang Live Server, sau do `Ctrl+F5` ca hai trang.
2. Bam `Test Fall Alert` hoac tao real confirmed fall va kiem tra timeline hien camera + command + dang cho Chami.
3. Noi `痛いです`, `助けて` hoac `tasukete`; timeline phai chuyen sang danger va family alert.
4. Tao flow moi va khong tra loi; timeline phai hien no_response va family alert.
5. Noi `大丈夫です`; khi firmware chua gui safe care log, timeline khong duoc hien safe ma phai tiep tuc bao thieu du lieu ket qua.

### Viec con lai

- Test realtime that voi Firestore, RTDB va Chami sau khi mo bang Live Server.
- De hien safe chinh xac sau khi reload dashboard, firmware/backend can ghi mot `care_logs` safe rieng cho emergency response.
- Neu can luu timeline hoan chinh lau dai, co the bo sung event/care log khi Chami bat dau va ket thuc emergency flow o buoc backend sau.

## 2026-07-22 02:02:51 +09:00

### Muc tieu lan sua

Sua Dashboard Fall Response Timeline de dung event that trong Realtime Database thay vi suy luan va ghep `fallAlerts` cu voi alert Chami moi.

### File da sua

- `fall-camera.js`
- `index.html`
- `src/js/dashboard.js`
- `src/js/firebase-service.js`
- `src/css/style.css`
- `PROJECT_HISTORY.md`

### Path va schema moi

- Them Realtime Database path `care_events`.
- Event co cac field: `flow`, `flowId`, `source`, `type`, `status`, `message`, `detail`, `relatedCommandId`, `relatedAlertId`, `cameraId`, `location`, `createdAt`.
- Khong luu anh/video va khong thay doi schema command Chami hien co.

### Logic Fall Camera

- Moi fall event tao `flowId` dang `fall_<timestamp>`.
- Khi confirm fall, ghi event `fall_confirmed` mot lan cho flow.
- Khi tao `emergency_check` thanh cong, ghi event `chami_command_sent` cung `flowId` va `relatedCommandId`.
- Event log khong chan flow tao command; neu ghi event loi thi Fall Camera log warning va van tiep tuc emergency flow.
- Lap lai nut Test trong cooldown khong tao event moi; sau cooldown co the tao flow demo moi.

### Logic Dashboard

- Timeline chi subscribe va render tu `care_events` co `flow=fall_response`.
- Xoa hoan toan logic cu suy luan timeline tu `fallAlerts`, `commands`, `alerts` va `care_logs`.
- Chi hien event trong 10 phut gan nhat; timer 30 giay chi loc lai UI cuc bo, khong request Firebase.
- Alert Chami `type=emergency_response` duoc anh xa thanh `chami_alert_received` voi dung `createdAt` cua alert goc.
- Dung event ID `chami_alert_<relatedAlertId>` va RTDB transaction de chong ghi trung qua reload/nhieu tab.
- Neu tim thay flow gan nhat trong 10 phut, alert Chami duoc gan cung `flowId`; neu khong co thi hien nhu event doc lap voi timestamp that.
- Danger hien `Da gui canh bao khan cap cho nguoi nha`; no_response hien `Khong co phan hoi sau thoi gian cho`.
- Neu chua co result event, hien `Dang cho ket qua tu Chami`.
- Safe chi hien khi `care_events` co status `safe` that; firmware/backend hien chua gui event nay.

### Logging

- Fall Camera:
  - `FallCamera: care event written: fall_confirmed`
  - `FallCamera: care event written: chami_command_sent`
- Dashboard:
  - `Dashboard: Fall response care events loaded`
  - `Dashboard: Fall response timeline updated from care_events`
  - `Dashboard: No recent fall response timeline`
  - `Dashboard: Chami emergency alert mapped to timeline`

### Lenh kiem tra

- `node --check fall-camera.js`
- `node --check src/js/dashboard.js`
- `node --check src/js/firebase-service.js`
- `git diff --check -- tsunagari-care/fall-camera.js tsunagari-care/index.html tsunagari-care/src/js/dashboard.js tsunagari-care/src/js/firebase-service.js tsunagari-care/src/css/style.css`
- Kiem tra source khong con reference toi helper timeline suy luan cu.
- Kiem tra so cap dau ngoac CSS.

### Ket qua kiem tra

- Ca ba lenh `node --check`: pass.
- `git diff --check`: pass; chi co canh bao line ending LF/CRLF cua Git.
- Khong con reference toi `latestTimeline*`, `fallTimelineDataReady`, `observedEmergencyCommands` hoac `FALL_TIMELINE_*`.
- CSS co so dau ngoac mo/dong bang nhau.
- `package.json` khong co build frontend script; chi co script `bridge`.
- Chua chay Live Server/Firebase/Chami test that trong session terminal nay.

### Cach test thu cong

1. Mo `index.html` va `fall-camera.html` bang Live Server, sau do `Ctrl+F5`.
2. Bam `Test Fall Alert` va xac nhan RTDB `care_events` co `fall_confirmed` va `chami_command_sent` cung `flowId`.
3. Xac nhan dashboard hien dung timestamp moi cua hai event.
4. Test danger; alert Chami moi phai tao duy nhat mot `chami_alert_received` status `danger` va timeline dung timestamp alert.
5. Test no_response; timeline phai hien status `no_response` voi timestamp moi.
6. Reload dashboard va xac nhan khong tao trung event cho cung `relatedAlertId`.
7. Test safe; neu chua co care event safe that, timeline phai hien dang cho va khong tu hien safe.

### Viec con lai

- Xac nhan Firebase rules cho phep web client doc/ghi path `care_events` trong moi truong demo.
- Test full flow voi Live Server, Firebase that va robot Chami.
- Them safe event tu firmware/backend trong buoc sau de hien ket qua `大丈夫です` chinh xac va ben vung sau reload.

## 2026-07-23 11:31:17 +09:00

### Muc tieu lan sua

Sua loi Fall Response Timeline trong khi Alert Center da co alert Chami `emergency_response` moi nhung card van hien empty do `care_events` chua co du lieu hoac bi Firebase Rules chan.

### File da sua

- `src/js/dashboard.js`
- `src/js/firebase-service.js`
- `PROJECT_HISTORY.md`

### Nguyen nhan

- Callback `alerts` chi map alert sang `care_events` sau khi listener `care_events` da load thanh cong.
- Neu doc `care_events` bi permission denied, co `fallResponseCareEventsLoaded` khong bat va alert moi khong duoc map.
- Timeline chi render tu `care_events`, khong co fallback truc tiep tu alert dang duoc Alert Center hien thi.

### Logic moi

- Van uu tien `care_events` flow `fall_response` trong 10 phut gan nhat.
- Neu khong co care event gan day, timeline render truc tiep tu alert Chami `emergency_response` moi nhat.
- Neu care event co nhung chua chua alert Chami moi hon, tam render alert fallback cho toi khi mapping thanh cong.
- Fallback toi thieu gom:
  - `Chami da hoan tat kiem tra`
  - `Khong co phan hoi sau thoi gian cho` hoac `Nguoi dung can tro giup`
  - `Da gui canh bao khan cap cho nguoi nha`
- Fallback dung dung `createdAt` cua alert; khong hien buoc camera neu khong co care event camera that.
- Alert listener luon render fallback va thu ghi care event, khong con phu thuoc vao trang thai load `care_events`.
- Ghi care event van chong duplicate bang `relatedAlertId`/event ID deterministic.
- Neu ghi bi permission denied, dashboard log loi va tiep tuc dung fallback, khong lam vo Alert Center.
- Neu listener `care_events` bi loi, FirebaseService tra danh sach rong cho subscriber de dashboard thoat loading va dung fallback.

### Phan loai va timestamp

- `no_response`, `no response`, `Khong co phan hoi` va `Khong co phan hoi` co dau deu duoc phan loai `no_response` sau khi normalize Unicode.
- Alert emergency_response danger khac duoc phan loai `danger`.
- Parser timestamp ho tro number, numeric string, ISO string, Firebase `toDate`, `toMillis`, va object `seconds/nanoseconds`.
- Neu timestamp khong parse duoc, log warning mot lan va dung thoi diem dashboard nhan alert lam fallback on dinh.
- Khong suy dien safe; safe van can care event status `safe` that tu Chami.

### Logging

- `Dashboard: Chami emergency alert mapped to timeline`
- `Dashboard: care_event write skipped duplicate alert`
- `Dashboard: care_event write failed, using alert fallback`
- `Dashboard: Fall response timeline rendered from care_events`
- `Dashboard: Fall response timeline rendered from alert fallback`
- Debug co kiem soat ghi so recent care events, alert emergency moi nhat va render source khi timeline thay doi.

### Lenh kiem tra

- `node --check src/js/dashboard.js`
- `node --check src/js/firebase-service.js`
- `git diff --check -- tsunagari-care/src/js/dashboard.js tsunagari-care/src/js/firebase-service.js`

### Ket qua kiem tra

- Hai lenh `node --check`: pass.
- `git diff --check`: pass; chi co canh bao line ending LF/CRLF cua Git.
- `package.json` khong co build frontend script; chi co script `bridge`.
- Chua chay Live Server/Firebase/Chami test that trong session terminal nay.

### Cach test thu cong

1. Mo `index.html` bang Live Server va nhan `Ctrl+F5`.
2. Tao alert Chami `emergency_response` no_response hoac danger moi.
3. Xac nhan Alert Center va timeline deu hien dung alert/timestamp moi.
4. Neu `care_events` empty hoac permission denied, Console phai co log render tu alert fallback va timeline khong duoc empty.
5. Neu mapping thanh cong, timeline chuyen sang render tu `care_events` va khong tao event trung khi reload.
6. Test safe: neu chua co care event safe that, timeline khong duoc hien safe.

### Viec con lai

- Xac nhan Firebase Rules cho path `care_events`; fallback da bao ve UI nhung event persistence van can quyen ghi.
- Test full flow voi Live Server, RTDB that va robot Chami.
- Them safe care event tu firmware/backend o buoc sau.

## 2026-07-26 17:39:37 +09:00

### Muc tieu lan sua

Nang cap Medication Reminder tu mot record co dinh `reminders/medicine_morning`
thanh collection nhieu lich doc lap theo kieu ung dung bao thuc.

### File da sua

- `index.html`
- `src/css/style.css`
- `src/js/firebase-service.js`
- `src/js/dashboard.js`
- `C:\Pt-tsunagari-care\server\lib\medicineReminderScheduler.js`
- `C:\Pt-tsunagari-care\server\routes\chami.js`
- `PROJECT_HISTORY.md`

Scheduler duoc sua truc tiep tai repo root la file Render dang su dung. Khong sua
firmware, Firebase config/Rules, fall detection, emergency flow hoac smart home.

### Data model va dashboard

- Moi reminder nam tai `reminders/{reminderId}`; create dung RTDB `push()` va luu
  lai key vao field `id`.
- Moi record giu `type=medicine`, ten thuoc, gio `HH:mm`, timezone, `repeat=daily`,
  enabled, target device, created/updated timestamp va marker occurrence rieng.
- Record cu `reminders/medicine_morning` neu hop le van duoc list/sua/toggle/xoa
  nhu reminder binh thuong; khong migration hoac xoa tu dong.
- Dashboard hien danh sach sap theo gio, co toggle, Sua, Xoa, Nhac ngay va modal
  Them/Sua. Update giu nguyen ID va `createdAt`; xoa reminder khong xoa care log.
- Service validate ten thuoc, gio, daily-only va khong nhan ID tu payload.
- `Nhac ngay` tao mot command co `reminderId` cua dong duoc chon, kiem tra command
  medicine pending tren cung robot va khong cap nhat `lastTriggeredKey`.

### Scheduler nhieu reminder

- Moi tick doc toan bo `reminders`, validate va xu ly tung medicine reminder trong
  vong lap rieng; loi cua mot reminder khong dung cac reminder con lai.
- Moi occurrence co key `${date}_${time}` theo timezone cua reminder, vi du
  `2026-07-26_08:00`. Transaction chi chay tai
  `reminders/{reminderId}/lastTriggeredKey`.
- Callback transaction chap nhan `currentKey=null`; chi abort bang `undefined`
  khi key da trung. Khong transaction tren toan record va khong return `null`.
- Sau commit, mot multi-path update ghi ngay/gio/timestamp, tao dung mot command
  va mot `medicine_reminder_sent` care log cung `reminderId`.
- Neu multi-path update loi, scheduler rollback marker va cac trigger timestamp
  truoc do, dong thoi log rollback thanh cong/that bai.
- Pending cung `reminderId` duoc log `pending_same_reminder`; pending medicine
  khac tren cung robot duoc log `robot_busy`. Marker chua duoc commit khi robot
  busy, nen tick sau con co the thu lai.
- Tick chay moi 30 giay va chi retry toi da 5 phut neu occurrence da den han khi
  lich dang bat nhung bi pending/robot busy hoac loi ghi. Lich duoc bat sau khi
  da qua gio khong tu dong nhan grace period. Day la gioi han co chu dich de
  khong tao queue vo han.
- `repeat=daily` hoat dong vi ngay Tokyo tiep theo tao occurrence key moi. Toggle
  off giu record nhung scheduler skip.

### Medicine follow-up backend

- Route Chami giu `reminderId` trong `medicine_taken`/`medicine_no_response` neu
  firmware gui field nay.
- Firmware hien co the chua gui `reminderId`; backend van chap nhan payload nhung
  khong tu gan `medicine_morning` hay mot reminder bat ky, tranh gan sai khi co
  nhieu lich. Khi thieu ca ID va ten thuoc, ten hien thi fallback la `Thuoc`.
- Han che hien tai: follow-up khong co `reminderId` khong the lien ket chac chan
  voi mot lich cu the cho toi khi firmware truyen lai ID cua command.

### Logging

- Scheduler log count, tung reminder, occurrence key, disabled/time-not-due,
  already-triggered, pending-same, robot-busy, transaction, timestamp update,
  command ID va care log reminder ID.
- Dashboard log loaded count va ID cho create/update/delete/toggle/immediate.
- Khong log token, credential hoac secret.

### Kiem tra da chay

- `node --check server/lib/medicineReminderScheduler.js`: pass.
- Test helper occurrence bang Firebase stub: pass cho hai ngay Tokyo lien tiep
  tao hai key khac nhau; lich qua gio khong tu nhan grace period.
- Test scheduler voi RTDB gia lap: pass cho hai reminder cung gio; A tao command,
  B gap `robot_busy` khong bi ghi marker, sau khi command A done thi B trigger o
  tick ke tiep. Case 23:59/00:00 giu dung key cua occurrence ngay truoc; ca A/B
  deu trigger lai voi key ngay Tokyo tiep theo. Lich disabled va lich chua den
  gio khong trigger.
- Test local-mode service: pass cho tao ba lich, reload list, update giu ID va
  `createdAt`, toggle, Nhac ngay giu marker, xoa reminder va giu care log.
- Lan require helper dau tien khong chay vi repo root hien khong co
  `node_modules/firebase-admin`; test sau do dung stub va khong truy cap RTDB.
- Chrome/Edge headless khong render duoc screenshot do GPU process tren may test
  bi crash; chua danh dau visual test la pass.

### Cach test thu cong tren RTDB/Render

1. Tao ba lich 08:00, 12:30 va 20:00; reload dashboard va xac nhan ca ba ID van
   ton tai.
2. Dat hai lich cach hien tai 2 va 5 phut; redeploy Render va theo doi log de A,
   sau do B, tao command/care log rieng.
3. Tick lap lai cung occurrence phai log `already_triggered_occurrence` va khong
   tao command thu hai.
4. Tat mot lich va xac nhan scheduler log `disabled`; bat lai de lich chay vao
   occurrence tiep theo.
5. Sua gio lich A, xac nhan ID khong doi va B/C khong bi cap nhat.
6. Xoa lich C, xac nhan care log cu van con.
7. Bam Nhac ngay lich B, xac nhan command co reminderId B va marker cua B khong
   doi.
8. Cho robot co medicine command pending, dua lich khac den gio va xac nhan log
   `robot_busy`; sau khi command cu ket thuc trong cua so retry, lich moi duoc gui.

### Viec con lai

- Chay end-to-end voi Firebase RTDB that, Render va Chami de xac nhan Rules/index,
  command lifecycle va ba lan nhac firmware.
- Xac nhan giao dien desktop/mobile bang trinh duyet thuong vi headless browser
  trong session nay khong render duoc.
- De lien ket follow-up chinh xac trong he nhieu lich, firmware can gui
  `reminderId` nhan duoc tu command trong payload ket qua o mot thay doi rieng.

## 2026-07-26 18:03:36 +09:00

### Muc tieu lan sua

Sua khan cap card Medication Reminder bi co hep, ten thuoc bi be tung ky tu va
gio/toggle/actions bi don vao mot hang tren dashboard ba cot.

### Nguyen nhan chinh xac

- `.secondary-row` cho phep cot Medication co xuong `260px` va van giu ba cot
  cho den breakpoint `980px`.
- `.medicine-reminder-row` dat schedule va controls trong grid ngang
  `minmax(0, 1fr) auto`. Cot controls chua toggle va ba button lay do rong auto,
  nen phan schedule/name con lai bi ep rat hep.
- `.medicine-reminder-schedule strong` bi ap `overflow-wrap: anywhere`, vi vay
  khi cot ten hep, trinh duyet co quyen be chu sau tung ky tu.
- Markup dong gom gio, ten, meta, toggle va actions vao hai khoi nam cung mot
  hang, khong phu hop voi card alarm nho.

### File da sua

- `src/js/dashboard.js`
- `src/css/style.css`
- `PROJECT_HISTORY.md`

`index.html` da duoc kiem tra; cac ID container/modal dung nen khong can sua.
Khong sua FirebaseService, backend, scheduler, firmware, data model hoac handler
CRUD.

### Markup va CSS moi

- Moi reminder duoc tach thanh bon hang:
  - `.medicine-alarm-top`: gio lon ben trai, toggle ben phai.
  - `.medicine-alarm-name`: ten thuoc rieng, toi da hai dong.
  - `.medicine-alarm-meta`: `Hang ngay`, timezone va lan trigger gan nhat.
  - `.medicine-alarm-actions`: Sua, Xoa, Nhac ngay.
- Ten thuoc dung `word-break: normal`, `overflow-wrap: break-word` va line-clamp
  hai dong; khong con `overflow-wrap: anywhere`.
- Item dung flex column, width 100%, min-width 0, padding 14px va border-radius
  8px; khong co fixed height.
- Actions wrap, moi button co flex basis hop ly va `min-width: 0`, khong lam card
  rong hon parent.
- Cac `data-medicine-action`, `data-reminder-id`, toggle/edit/delete/now listener
  va DOM ID khong thay doi.

### Responsive

- Desktop tu 1200px: ba cot co min-width lan luot 340px, 360px va 300px.
- Tablet 768-1199px: hai cot; Medication Reminder chiem full row, Care Log va
  Command Queue nam hai cot ben duoi.
- Mobile duoi 768px: mot cot. Duoi 640px header card xep doc va action button co
  the co gian/wrap trong card.
- Khong thay doi layout noi bo cua Care Log hoac Command Queue.

### Kiem tra truc quan

- Edge headless software rendering tai 1920px: pass; ba reminder nam gon trong
  cot dau, ten khong be ky tu, toggle va actions khong tran.
- Tai 1024px: pass; Medication chiem full row va ba reminder gon, hai card con
  lai tao hai cot.
- Tai CSS viewport 500px: pass; mot cot, toggle goc phai, ten nam ngang va ba
  button nam tron trong card.
- Edge headless co minimum layout viewport gan 500px khi yeu cau anh 390px, nen
  anh 390px bi crop tu layout 500px; khong dung anh nay de ket luan overflow.

### Test thu cong tren trinh duyet

1. `Ctrl+F5` dashboard.
2. Tao ba ten: `Thuoc huyet ap`, `Vitamin tong hop buoi toi`,
   `Thuoc da day sau an`.
3. Kiem tra ten toi da hai dong, khong be tung ky tu; gio lon va toggle o goc
   phai.
4. Kiem tra Sua/Xoa/Nhac ngay khong tran card va van goi dung handler.
5. Test 1920x1080, tablet va mobile; kiem tra `scrollWidth === clientWidth`.

### Gioi han

- Test headless dung localStorage fixture, khong ghi RTDB va khong test CRUD
  end-to-end voi Firebase that.
- Khong ghi token, credential hoac secret.

## 2026-07-26 19:45:28 +09:00

### Muc tieu lan sua

Them phase thong bao nguoi cham soc qua LINE Official Account va LINE Messaging
API. Khong dung LINE Notify, khong gui LINE tu browser hoac firmware, va token
chi doc tu bien moi truong backend.

### File da sua

- `server/lib/lineMessagingService.js`
- `server/lib/caregiverNotificationService.js`
- `server/routes/chami.js`
- `tsunagari-care/index.html`
- `tsunagari-care/src/css/style.css`
- `tsunagari-care/src/js/firebase-service.js`
- `tsunagari-care/src/js/dashboard.js`
- `tsunagari-care/PROJECT_HISTORY.md`

Repo root `.env.example` dang bi xoa san trong worktree truoc phase nay, nen
khong khoi phuc de tranh ghi de thay doi ngoai pham vi.

### Env vars backend

- `LINE_MESSAGING_ENABLED=true`
- `LINE_CHANNEL_ACCESS_TOKEN=<LINE Messaging API channel access token>`
- `LINE_CAREGIVER_USER_IDS=Uxxxx,Uyyyy`
- `LINE_NOTIFICATION_DEMO_ENABLED=false`

Danh sach recipient duoc split bang dau phay, trim khoang trang va bo gia tri
rong. Log chi ghi so luong recipient va masked user ID khi gui, khong log token
hoac Authorization header.

### Policy va message mapping

Chi gui LINE cho:

- `fall_confirmed`
- `danger`
- `emergency_no_response`
- `medicine_no_response`

Bo qua:

- `medicine_reminder_sent`
- `medicine_taken`
- smart-home commands
- robot heartbeat/state
- event ngoai whitelist
- event source `demo`, tru khi backend chu dong allow demo va
  `LINE_NOTIFICATION_DEMO_ENABLED=true`

Message MVP bang tieng Viet, gom thoi gian Nhat Ban, nguon, trang thai can
kiem tra va chi tiet thuoc/attempt khi co. Helper tach rieng de sau nay them
tieng Nhat.

### Backend trigger

Sau khi `/api/chami/alert` ghi `alerts` va, voi medicine follow-up, ghi
`care_logs`, backend goi caregiver notification fire-and-forget co `.catch`.
Loi LINE khong lam mat alert/care log goc va khong lam endpoint treo lau.

Co them `POST /api/chami/line-test`, di qua `deviceAuth`, chi hoat dong khi
`LINE_NOTIFICATION_DEMO_ENABLED=true`, va chi gui message mau co dinh.

### Dedupe va retry

Dedupe dung transaction tai:

- `line_notification_dedup/{eventId}`

Neu payload co `eventId`, dung eventId do. Neu khong co, medicine dung dedupe
key backend da tao cho care event; alert legacy dung hash gom type/source/status
/level/message va timestamp hoac cua so nhan 30 giay. Marker da ton tai thi ghi
notification `skipped` va khong gui LINE lai.

LINE send retry async cho loi mang, timeout, HTTP 408/429/5xx voi delay 2s, 5s,
15s. HTTP 400/401/403 khong retry vo han. Neu moi recipient that bai, status
`failed` va marker cho phep retry co kiem soat o request sau; neu co it nhat mot
recipient thanh cong thi `sent` hoac `partial`.

### RTDB schema moi

Backend ghi:

- `caregiver_notifications/{notificationId}`

Record gom `id`, `eventId`, `eventType`, `source`, `status`,
`recipientCount`, `successCount`, `failureCount`, `messagePreview`,
`createdAt`, `sentAt`, `updatedAt`, `lastError`. Khong luu token, Authorization
header hoac user ID day du.

### Dashboard

Them panel `Thong bao nguoi cham soc`, doc-only tu `caregiver_notifications`.
Dashboard hien toi da 3 record moi nhat voi badge Sent / Partial / Failed /
Skipped, preview va gio, kem `+N thong bao cu hon`. Frontend khong goi LINE API
va listener dung query limit thay vi doc toan bo RTDB.

### Static checks

Da chay `node --check` cho cac file JS backend/frontend moi sua trong qua trinh
lam viec. Can chay lai day du cuoi phase sau khi history duoc ghi:

- `node --check server/lib/lineMessagingService.js`
- `node --check server/lib/caregiverNotificationService.js`
- `node --check server/routes/chami.js`
- `node --check server/index.js`
- `node --check tsunagari-care/src/js/firebase-service.js`
- `node --check tsunagari-care/src/js/dashboard.js`
- `git diff --check`

### Manual tests can lam

- Chua cau hinh LINE: server khong crash, alert/care log van ghi, notification
  failed hoac skipped theo policy.
- Cau hinh token va user ID that: goi `POST /api/chami/line-test` voi
  `x-device-token`, xac nhan LINE nhan message va RTDB status `sent`.
- Gui `medicine_no_response`, `danger`, `emergency_no_response` va duplicate
  cung eventId de xac nhan chi mot message duoc gui.
- Token sai: LINE 401 khong crash backend va notification status `failed`.
- Event `medicine_taken` khong tao notification sent gia.

### Gioi han va next steps

- MVP chua co background worker khoi phuc pending notification sau Render
  restart.
- Chua test voi LINE that trong session nay vi khong co token/user ID that.
- Next phase nen them unit test cho policy/message formatter va Firebase mock
  dedupe, sau do can nhac job retry ben vung neu van can dam bao delivery sau
  restart.
