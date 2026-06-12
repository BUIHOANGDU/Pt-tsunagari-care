# TsunagariCare

TsunagariCare — つながりケア: AIロボットとIoTを用いた在宅見守り支援システムの開発

Mục tiêu: Web Dashboard + Firestore schema + Demo mode để phục vụ bảo vệ đồ án.

Xem nhanh:

- Mở [index.html](index.html) trong trình duyệt (hoặc dùng `python -m http.server`).
- Cấu hình Firebase: sao chép `src/js/firebase-config.example.js` → `src/js/firebase-config.js` và điền cấu hình.

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

Commit history: commit đầu sẽ là: "chore: init TsunagariCare project structure and basic dashboard"
