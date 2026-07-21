# Project History

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
