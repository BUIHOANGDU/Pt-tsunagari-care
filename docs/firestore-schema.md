# Firestore Schema

Collections (MVP):

- `users` — thông tin người dùng / người được chăm sóc.
- `robots` — document cho từng robot. Ví dụ: `robots/chami01`.
  - Fields: `name`, `status`, `battery`, `lastActive`, `emotion`, `firmware`.
- `devices` — danh sách thiết bị smart home (collection).
  - Example fields: `name`, `type`, `status`, `room`, `updatedAt`.
- `commands` — lệnh từ dashboard gửi tới thiết bị (consumer đọc và thực hiện).
  - Fields: `targetType`, `targetId`, `command`, `status`, `createdAt`, `source`.
- `care_logs` — nhật ký chăm sóc (medicine, meal, response).
  - Fields: `userId`, `type`, `status`, `message`, `createdAt`, `source`.
- `alerts` — cảnh báo hệ thống (fall, robot_offline,...).
  - Fields: `type`, `level`, `message`, `status`, `createdAt`, `source`.
- `system_logs` — (tuỳ chọn) log hệ thống và audit.

Ghi chú: Tất cả thời điểm nên dùng `serverTimestamp()` khi viết lên Firestore.
