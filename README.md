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
├── build.js                           # Build shell + tab mặc định; 3 kho còn lại lazy-load từ src/content
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
└── index.html                         # Application shell + nội dung chuyên đề mặc định
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

### Tối ưu hiệu năng

- `tab-mock`, `tab-tst` và `tab-history` chỉ được tải khi người dùng mở tab lần đầu.
- MathJax chỉ typeset tab đang hiển thị và không xử lý lại tab đã hoàn tất.
- Các GET catalog giống nhau được dùng chung Promise và cache trong bộ nhớ 5 phút; mutation thành công tự xóa cache.
- Dữ liệu TST động chỉ được tải khi mở tab TST. Đổi tab không cưỡng bức tải lại MongoDB.
- JS/CSS và fragment nội dung có cache dài hạn theo phiên bản build; HTML shell luôn được xác thực lại.

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


## Hình vẽ trong AI Hướng dẫn giải

Hướng dẫn cho bài hình học phẳng có thêm hình SVG gồm các điểm có nhãn, đoạn thẳng và đường tròn; nét đứt biểu diễn các đường phụ. Chức năng áp dụng cho câu hỏi trong đề thi và mục **Hỗ trợ giải toán**. Hình được đưa vào bản in/PDF và lưu cùng `aiGuide.geometry` khi người dùng bấm nút lưu MongoDB hiện có.

- Gemini đề xuất các điểm tự do và chuỗi phép dựng; mã tính trực tiếp trung điểm, hình chiếu, đối xứng, giao hai đường thẳng, tâm ngoại tiếp, trực tâm, điểm trên đường tròn và giao đường thẳng–đường tròn/hai đường tròn. GPT kiểm tra sự phù hợp với giả thiết và lời giải. Bộ kiểm tra số học dùng chung ở server và trình duyệt kiểm tra quan hệ thẳng hàng, vuông góc, song song, bằng độ dài, trung điểm và thuộc đường tròn với sai số chuẩn hóa `1e-4`.
- Chỉ dựng SVG từ dữ liệu đã chuẩn hóa, không chèn SVG/HTML hoặc tài nguyên bên ngoài do mô hình cung cấp. Giới hạn mỗi hình: 40 điểm, 80 đoạn, 12 đường tròn và 100 ràng buộc.
- Với hướng dẫn hình học đã lưu chưa có hình, bấm **Tạo / Thử lại hình vẽ**, sau đó lưu bằng nút MongoDB nếu muốn giữ hình. API dùng chế độ `diagram` của `/api/ai-guide`, giữ nguyên lời giải, phiên đăng nhập, quyền đọc câu hỏi và giới hạn tần suất hiện có.
- Dữ liệu hình được tính và kiểm tra trước khi gửi GPT; kết quả GPT trả về được tính/kiểm tra lại. Cho phép một lượt hiệu chỉnh theo lỗi cụ thể trong thời hạn yêu cầu. Nếu vẫn không vượt qua kiểm tra, giao diện và log trả mã lỗi phân biệt lỗi tọa độ/ràng buộc với lỗi kiểm định nội dung; lời giải vẫn hiển thị cùng thông báo và nút thử lại. Khi sửa nội dung hướng dẫn, hình cũ bị loại bỏ để dựng lại; bản in của nội dung đang sửa cũng không dùng hình cũ.

Hình biểu diễn một cấu hình minh họa, không phải chứng minh hình học. Kiểm tra số học chỉ kiểm tra các quan hệ đã khai báo; độ đầy đủ và sự phù hợp với đề bài còn phụ thuộc bước kiểm định AI. Phiên bản này hỗ trợ hình học phẳng, chưa dựng hình không gian hay các đường cong tổng quát. Chạy `node test/geometry-constructions.test.mjs` và `node test/geometry-diagram.test.mjs` để kiểm tra hình học, API với mô hình giả lập, lưu dữ liệu, giao diện và bản in.

### Màu sắc phần dựng thêm trong lời giải

- Điểm, nhãn điểm, đoạn thẳng và đường tròn bổ sung ngoài đề bài có `auxiliary: true`: hiển thị màu đỏ; đường phụ vẫn dùng nét đứt để phân biệt trên bản in đen trắng. Các đối tượng được đề bài định nghĩa giữ màu gốc, kể cả khi tọa độ được tính bằng phép dựng.
- Nhãn `auxiliary` của điểm được bảo toàn khi tính tọa độ, kiểm định, lưu/tải lại và in/PDF. Mô hình sinh và mô hình kiểm định đều đối chiếu phân loại với đề bài và lời giải.
- Hình cũ vẫn đọc được. Các đường đã có cờ phụ chuyển sang đỏ ngay; điểm cũ thiếu thông tin phân loại không bị tự động suy đoán. Bấm **Vẽ lại hình** rồi lưu hướng dẫn để cập nhật phân loại điểm theo lời giải.

## Phân quyền Admin, Giáo viên và Thành viên

- **Admin** quản trị nội dung, AI, bài nộp và tài khoản. Chỉ Admin được liệt kê/tạo/xóa tài khoản hoặc đổi mật khẩu/đổi quyền qua API quản lý tài khoản.
- **Giáo viên** (`teacher`) có các quyền quản trị dữ liệu như Admin: quản lý kho đề/câu hỏi, OCR đề, chỉnh sửa/lưu/xóa hướng dẫn AI, xác minh bài nộp và nguồn tham chiếu, xem hoạt động học tập, quản lý phân tích xu hướng và cơ sở lý thuyết. Không được quản lý tài khoản. Admin có thể chọn Giáo viên khi tạo tài khoản mới hoặc đổi quyền tài khoản khác ngay trong danh sách. Không cho tự đổi quyền tài khoản đang đăng nhập. Mỗi yêu cầu xác thực đối chiếu quyền hiện tại trong cơ sở dữ liệu: khi quyền thay đổi, phiên cũ bị từ chối và người dùng cần đăng nhập lại.
- **Thành viên** tiếp tục học tập theo quyền hiện có và được sử dụng **Kho dữ liệu → AI xu hướng đề**: phân tích kho đề công khai; tạo/lưu/xem/sửa/xóa báo cáo của mình; xem/tạo nội dung cơ sở lý thuyết để học. Không được thay đổi thư viện lý thuyết dùng chung hoặc vận hành công cụ quản trị kho tham chiếu. Báo cáo mới gắn `ownerId` từ phiên đăng nhập, không tin thông tin chủ sở hữu do client gửi; báo cáo cũ chưa có `ownerId` vẫn do Admin/Giáo viên quản lý, không tự gán quyền sở hữu cho Thành viên chỉ vì trùng tên tài khoản.

Quyền được kiểm tra ở API bên cạnh việc ẩn/hiện giao diện. Không tự chuyển vai trò của các tài khoản hiện có. Chạy `node test/teacher-permissions.test.mjs` để kiểm tra ranh giới quản trị tài khoản, quản trị nội dung, truy cập AI xu hướng đề và quyền sở hữu báo cáo.

## Cấp học và phạm vi nội dung

Cấp học độc lập với vai trò Admin/Giáo viên/Thành viên. Admin chọn nhiều ô trong **Quản lý tài khoản → Cấp học → Lưu cấp học**, hoặc chọn khi tạo tài khoản. Giáo viên chỉ quản trị nội dung trong cấp học được cấp; không được tự cấp quyền cho mình hoặc tài khoản khác. Admin luôn quản trị toàn hệ thống.

| Cấp học | Nội dung hiện có |
| --- | --- |
| Tiểu học (`primary`) | Khu vực riêng; chưa có bộ học liệu riêng |
| THCS (`lower_secondary`) | Đề thi vào lớp 10 chuyên |
| THPT (`upper_secondary`) | Tài liệu chuyên đề VMO, thi thử VMO, TST, VMO, IMO–Olympic, Đà Nẵng–Quảng Nam, Olympic 30/4, Duyên hải miền Bắc; AI xu hướng đề |
| Đại học (`university`) | Khu vực riêng; chưa có bộ học liệu riêng |

**Hỗ trợ giải toán** dùng chung cho mọi cấp đã được cấp quyền, vẫn giữ quyền sở hữu bài toán riêng lẻ. Chọn THCS + THPT mở hợp của hai danh mục. Không có cấp nào (`[]`) nghĩa là chờ Admin cấp quyền; không tự mở nội dung khi tự đăng ký. Tài khoản cũ chưa có trường `educationLevels` tiếp tục được THCS + THPT, giữ quyền hiện tại; không cần sửa hàng loạt dữ liệu. Nội dung tương lai có thể gắn `educationLevel` rõ ràng; dữ liệu cũ phân loại từ category/sourceGroup/group, mặc định THPT, riêng tuyển sinh chuyên là THCS.

Phiên ký chứa danh sách cấp học chuẩn hóa; mỗi yêu cầu đối chiếu bản ghi tài khoản. Thay đổi quyền hoặc cấp học từ chối phiên cũ; người dùng đăng nhập lại. Cookie cũ chưa có danh sách cấp học dùng phạm vi hiện tại từ DB. Giao diện kiểm tra lại phiên khi mở trang, không tin phạm vi trong localStorage làm căn cứ cho API.

`educationDb` áp cùng điều kiện phạm vi cho đọc danh sách/chi tiết, đếm, aggregate và ghi trong các collection nội dung; bộ lọc client kết hợp bằng `$and` nên không ghi đè được phạm vi. Bài nộp và lời giải lưu tuân theo cấp học. Hướng dẫn AI/đánh giá/vẽ hình và nguồn RAG kiểm tra câu hỏi đã đăng ký; không đưa nguồn ngoài phạm vi vào ngữ cảnh mô hình. Không thêm serverless function (vẫn 12).

Trang chính được phục vụ qua API hiện có với `private, no-store` và `Vary: Cookie`; máy chủ loại tài liệu chuyên đề THPT khỏi HTML của tài khoản ngoài cấp. Đường dẫn HTML nguồn/bản sao/manifest và mã phía máy chủ không được phục vụ trực tiếp; PDF/ảnh học liệu trong assets phải qua kiểm tra THPT. `server.js` sử dụng cùng handler API và cổng trang/tài liệu như Vercel. Việc tải trang và tài liệu cần DB xác thực đang hoạt động; file đã được tải trước đó hoặc nguồn bên ngoài ứng dụng không thể thu hồi bằng phân quyền này.

Kiểm thử thêm: `node test/education-access.test.mjs` (chọn nhiều cấp, cấp học sai/rỗng, quyền Admin, đọc/đếm/ghi theo cấp, chặn query vượt phạm vi, RAG, HTML/PDF và điều hướng). Các fixture sử dụng DB mô phỏng; không thay đổi tài khoản production hoặc tạo học liệu Tiểu học/Đại học bằng dữ liệu giả.
