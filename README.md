# VMO Đà Nẵng 2026–2027 — Website

Website tĩnh hoàn chỉnh để deploy trực tiếp lên Vercel.

## Cấu trúc
- `index.html`: nội dung tài liệu VMO 85 trang + ngân hàng đề TST.
- `styles.css`: giao diện responsive, print và dark mode.
- `app.js`: điều hướng, tìm kiếm, bộ lọc, ẩn/hiện lời giải.
- `assets/On_luyen_VMO_Da_Nang_2026_2027.pdf`: PDF nguồn.
- `vercel.json`: cấu hình triển khai Vercel.

## MathJax
Cấu hình đã sửa delimiter đúng chuẩn JavaScript:
- inline: `\\(...\\)` và `$...$`
- display: `\\[...\\]` và `$$...$$`

MathJax dùng jsDelivr và có fallback sang cdnjs nếu CDN chính lỗi.

## Deploy Vercel
1. Giải nén toàn bộ project.
2. Import thư mục vào Vercel hoặc push lên GitHub rồi import repository.
3. Framework Preset: **Other**.
4. Build Command: để trống.
5. Output Directory: để trống.
6. Deploy.

Nếu đang cập nhật một deployment cũ, tạo deployment mới hoặc redeploy để Vercel phục vụ `index.html` đã sửa.
