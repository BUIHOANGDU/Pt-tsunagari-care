# Demo Scenarios

1. Mở dashboard, thấy robot offline (fallback demo).
2. Nhấn "Simulate Robot Online" → `robots/chami01` cập nhật `status: online`.
3. Nhấn "Simulate Low Battery" → `robots/chami01.battery` giảm.
4. Nhấn "Simulate Fall Detected" → Tạo document trong `alerts` với `level: emergency`.
5. Nhấn nút để tạo care log (medicine done) → `care_logs` nhập record.
6. Chọn device, nhấn toggle → Tạo document trong `commands`.
