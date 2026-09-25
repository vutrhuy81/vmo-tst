# Chuyển catalog HTML sang MongoDB Atlas

## Trạng thái

Manifest trích từ HTML của phiên bản này gồm 64 đề, 75 nhóm nội dung,
354 câu hỏi (78 ví dụ chuyên đề) và 12 khối nội dung chuyên đề.
Script chỉ bổ sung những khóa còn thiếu. Bản ghi MongoDB đã tồn tại, đặc biệt
nội dung do Admin chỉnh sửa, không bị ghi đè. Đây là giai đoạn nhập dữ liệu;
giao diện vẫn dùng HTML cho đến khi kiểm chứng xong và phát hành API-only.

## Chạy kiểm kê

1. Tạo bản sao lưu Atlas của `exams`, `content_sets`, `problems`, `content_blocks`
   trước khi chạy chế độ ghi. Dùng database user chỉ đọc cho dry-run.
2. Đặt `MONGODB_URI` trong môi trường máy cục bộ, chỉ rõ database `/vmo_tst`.
   Không đưa URI vào Git, nhật ký hoặc nội dung trao đổi.
3. Chạy `npm ci`, rồi `npm run catalog:dry-run`.
4. Đối chiếu `manifest`, `plan`, `conflicts` và tổng số bản ghi trong Atlas.
   Mọi xung đột khóa hoặc anchor đều chặn ghi. Đối chiếu riêng các câu có
   cùng nội dung nhưng khác khóa; công cụ không thể tự kết luận chúng trùng.
   Nếu `matchedWithoutSetId` hoặc `matchedWithoutExamId` khác 0, phải đối chiếu
   và bổ sung liên kết các bản ghi cũ trước khi giao diện chỉ đọc qua API.
5. Khi báo cáo không còn xung đột và bản sao lưu đã hoàn tất, chạy
   `CATALOG_APPLY=YES npm run catalog:apply` bằng user có quyền ghi.
   Chạy lại dry-run để xác nhận số `insert` bằng 0.

Không chạy apply trên production khi chưa đối chiếu các câu đã tồn tại với
manifest. Import dùng upsert `$setOnInsert`, có thể chạy lại nếu bị ngắt.
`examId` được lưu theo chuỗi ObjectId như các đề tạo bởi API hiện tại;
`setId` là ObjectId. Sau nhập cần kiểm tra các bản ghi cũ còn thiếu liên kết.

## Điều kiện chuyển frontend sang API-only

- Toàn bộ danh mục và lời giải được đối chiếu, các khóa cũ và bài nộp còn truy cập được.
- API phục vụ chuyên đề, đề, câu hỏi, sidebar và thống kê đầy đủ, phân trang theo đề.
- Kiểm tra MathJax, lọc, tìm kiếm, bài nộp, AI và chức năng Admin trên Preview.
- Khi API lỗi, trang hiển thị trạng thái lỗi và thử lại, không đọc HTML tĩnh.
