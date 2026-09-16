# VMO Đà Nẵng 2026–2027 — Hệ Thống Ôn Luyện Đội Tuyển HSG Quốc Gia Môn Toán

Hệ thống web tài liệu chuyên sâu bồi dưỡng đội tuyển VMO Đà Nẵng 2026–2027 kèm ngân hàng đề thi thử, đề TST toàn quốc và đề lưu trữ qua các năm.

---

## 🏛️ Kiến Trúc Mã Nguồn Module Hóa (Modular Architecture)

Để giải quyết vấn đề tệp `index.html` quá lớn (hơn 6.000 dòng khó quản lý), toàn bộ dự án đã được tái cấu trúc theo mô hình **Module phân tán & Tự động biên dịch**:

```
├── src/                               # THƯ MỤC NGUỒN (CHỈNH SỬA NỘI DUNG TẠI ĐÂY)
│   ├── template.html                  # Khung bố cục chính (Chỉ ~140 dòng, cực kỳ gọn gàng)
│   ├── content/                       # 4 Khối nội dung chính được tách độc lập
│   │   ├── tab-danang.html            # 📚 Tài liệu chuyên đề VMO (85 trang: 13 chương, lý thuyết, 78 ví dụ)
│   │   ├── tab-mock.html              # 🎯 Bộ đề thi thử VMO (2 bộ 4 buổi + barem + nhận xét)
│   │   ├── tab-tst.html               # 🏛️ Ngân hàng đề TST 2026-2027 (18 kỳ thi các tỉnh thành)
│   │   └── tab-history.html           # 🗂️ Đề lưu trữ Đà Nẵng – Quảng Nam (12 bộ đề 2014-2023)
│   ├── sidebars/                      # Mục lục thanh điều hướng tương ứng từng tab
│   │   ├── sidebar-danang.html        # Mục lục 13 chương chuyên đề
│   │   ├── sidebar-mock.html          # Mục lục bộ đề thi thử
│   │   ├── sidebar-tst.html           # Mục lục 18 đề TST
│   │   └── sidebar-history.html       # Mục lục 12 đề Đà Nẵng & Quảng Nam
│   └── modals/
│       └── account-modal.html         # Hộp thoại Quản lý tài khoản & Phân quyền Admin
│
├── build.js                           # Trình biên dịch siêu tốc (<35ms) ghép src/ thành index.html
├── styles.css                         # CSS giao diện, Dark mode, Print, Responsive
├── app.js                             # Logic tương tác chính (Tabs, Tìm kiếm, Bộ lọc, Copy, Lời giải)
├── tst-sources.js                     # Cơ sở dữ liệu link nguồn tham khảo các đề TST
├── auth.js & auth.css                 # Hệ thống xác thực và phân quyền (RBAC)
├── account_mgmt.js                    # Quản lý tài khoản người dùng & mật khẩu
├── vmo_data_service.js                 # Giao tiếp API MongoDB từ trình duyệt
├── api/data.js                         # API dữ liệu có xác thực/phân quyền trên Vercel
├── ai_guide_engine.js & ai_guide.css  # AI Hướng dẫn giải toán chuyên sâu
├── i18n.js & i18n.css                 # Chuyển đổi ngôn ngữ Tiếng Việt / English
├── server.js                          # Máy chủ Express & API Gemini (tự động build khi start/request)
└── index.html                         # Tệp biên dịch hoàn chỉnh sẵn sàng phục vụ trình duyệt
```

---

## 🛠️ Hướng Dẫn Quản Lý & Chỉnh Sửa

Khi cần cập nhật nội dung, **thầy cô/lập trình viên không cần cuộn qua tệp 6.000 dòng nữa**:
1. **Thêm hoặc sửa đề TST mới:** Mở `src/content/tab-tst.html` và `src/sidebars/sidebar-tst.html`.
2. **Sửa chuyên đề hoặc ví dụ toán học:** Mở `src/content/tab-danang.html`.
3. **Sửa bộ đề thi thử:** Mở `src/content/tab-mock.html`.
4. **Sửa đề lưu trữ Đà Nẵng - Quảng Nam:** Mở `src/content/tab-history.html`.
5. **Chỉnh sửa giao diện header/navbar:** Mở `src/template.html`.

### Quy trình chạy:
- **Biên dịch thủ công:** Chạy lệnh `node build.js` hoặc `npm run build`.
- **Chạy môi trường phát triển (Dev/Server):** Chạy `node server.js` hoặc `npm run dev`. Máy chủ sẽ tự động gọi `build()` khi khởi động và tự động cập nhật ngay lập tức.

## MongoDB Atlas và phân quyền dữ liệu

Vercel phải có hai biến môi trường bắt buộc: `MONGODB_URI` và `JWT_SECRET` (tối thiểu 32 ký tự). Không đưa giá trị thật của hai biến này vào GitHub.

Database mặc định là `vmo_tst`. Ứng dụng sử dụng các collection:

- `users`: tài khoản, vai trò và mật khẩu đã băm bằng bcrypt;
- `documents`: tài liệu do quản trị viên thêm;
- `exams`: thông tin đề thi;
- `problems`: nội dung câu hỏi và lời giải chính thức;
- `submissions`: bài làm, kết quả và nhận xét chấm của học sinh;
- `events`: lịch thi và sự kiện.

Trình duyệt chỉ gọi `/api/auth` và `/api/data`; không kết nối trực tiếp MongoDB. Chỉ quản trị viên được thêm/xóa dữ liệu quản trị. Học viên chỉ được nộp bài và đọc bài nộp của chính mình; quản trị viên có thể xem toàn bộ bài nộp.

## API AI trên Vercel

Ba Vercel Functions yêu cầu phiên đăng nhập hợp lệ và biến môi trường `GEMINI_API_KEY`:

- `/api/ai-guide`: sinh hướng dẫn và lời giải Olympic;
- `/api/ai-evaluate-solution`: chấm bài dạng văn bản hoặc ảnh;
- `/api/ai-ocr-math`: nhận diện công thức từ ảnh JPEG, PNG hoặc WEBP.

API key chỉ được đọc ở server và không được gửi xuống trình duyệt. Các endpoint có giới hạn tần suất theo tài khoản và giới hạn kích thước nội dung đầu vào.
