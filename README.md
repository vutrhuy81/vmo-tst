# VMO Đà Nẵng 2026–2027 — Website tĩnh

Website không cần bước build. Có thể public trực tiếp trên Vercel.

## Cấu trúc
- `index.html`: nội dung đầy đủ của tài liệu + ngân hàng TST hiện có
- `styles.css`: giao diện responsive, print, dark mode
- `app.js`: tab, tìm kiếm, bộ lọc, thu gọn lời giải
- `assets/On_luyen_VMO_Da_Nang_2026_2027.pdf`: PDF gốc để mở/tải từ website
- `vercel.json`: cấu hình static hosting

## Deploy Vercel
Import thư mục này vào Vercel hoặc chạy `vercel --prod` tại thư mục dự án. Không cần framework và không cần lệnh build.
