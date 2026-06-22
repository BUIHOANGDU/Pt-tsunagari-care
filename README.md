# TsunagariCare

TsunagariCare — つながりケア: AIロボットとIoTを用いた在宅見守り支援システムの開発

Mục tiêu: Web Dashboard + Firestore schema + Demo mode để phục vụ bảo vệ đồ án.

Xem nhanh:

- Mở [index.html](index.html) trong trình duyệt (hoặc dùng `python -m http.server`).
- Cấu hình Firebase (tuỳ chọn): sao chép `src/js/firebase-config.js.example` → `src/js/firebase-config.js` và điền cấu hình.

Thư mục chính:

- [index.html](index.html)
- [src/](src/) — mã nguồn front-end
- [docs/](docs/) — tài liệu kiến trúc và schema

Chạy local nhanh:

```bash
cd tsunagari-care
# phục vụ static trên cổng 8000
python -m http.server 8000

# rồi mở http://localhost:8000
```

Nếu không cấu hình Firebase, giao diện dùng chế độ fallback demo (localStorage).
Important: Mock-first approach

- The Web Dashboard is mock-first: it runs fully with localStorage demo data and does not require a real Robot or ESP32.
- `Robot AI Module` and `Smart Home Module` are being developed separately; this dashboard provides Firestore schema and a command system so those modules can connect later.
- Commands created by the dashboard are stored in the `commands` collection (or `mock:commands` in localStorage) with `status: pending`.
- Fall Detection Camera uses MediaPipe Pose in the browser. Video is processed locally and not uploaded. Only detection metadata is stored in Firestore.

Firebase integration (quick guide):

1. In Firebase Console create a project and enable Firestore (Native mode).
2. Create a Web App and copy the config object.
3. Create file `src/js/firebase-config.js` containing:

```js
// src/js/firebase-config.js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "...",
  appId: "...",
};
```

4. Add Firebase SDK script tags in `index.html` before `src/js/firebase-service.js`:

```html
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js"></script>
<script src="src/js/firebase-config.js"></script>
```

5. Reload the page — the dashboard will use Firestore realtime listeners. If not present, it will stay in local demo mode.

Security note: Never commit `src/js/firebase-config.js` with real keys to git. Use `src/js/firebase-config.js.example` as template.

Commit history: commit đầu sẽ là: "chore: init TsunagariCare project structure and basic dashboard"
