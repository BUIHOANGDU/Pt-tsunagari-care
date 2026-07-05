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
