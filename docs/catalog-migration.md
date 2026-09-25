# Chuyển catalog HTML sang MongoDB Atlas

## Trạng thái

Manifest trích từ HTML của phiên bản này gồm 64 đề, 75 nhóm nội dung,
354 câu hỏi (78 ví dụ chuyên đề) và 12 khối nội dung chuyên đề.
Script chỉ bổ sung những khóa còn thiếu. Bản ghi MongoDB đã tồn tại, đặc biệt
nội dung do Admin chỉnh sửa, không bị ghi đè. Đây là giai đoạn nhập dữ liệu;
giao diện vẫn dùng HTML cho đến khi kiểm chứng xong và phát hành API-only.

### Kết quả kiểm kê Atlas ngày 25/9/2026

Data Explorer hiển thị 28 `exams`, 78 `content_sets`, 456 `problems` và chưa có
`content_blocks`. Truy vấn `{ sourceGroup: 'tst', examId: { $exists: false } }`
trả 158 bản ghi. Ví dụ `specialty:chapter-2:example-1` đã tồn tại nhưng manifest
dùng khóa `specialty:chapter-2:example-1-1`; đề Hùng Vương hiện dùng tiền tố
`tst:` trong khi manifest dùng `tst-national:`. Vì vậy các khóa không khớp
không đồng nghĩa với nội dung còn thiếu. Dry-run sẽ báo xung đột và chặn nhập;
cần lập ánh xạ khóa cũ–mới, giữ `_id`, bài nộp và nội dung Admin đã chỉnh sửa.

### Dry-run thực tế do người vận hành cung cấp

Báo cáo cho thấy 64 đề, 75 nhóm, 354 câu và 12 khối trong manifest;
Atlas có 28 đề, 78 nhóm, 456 câu và 0 khối. Chỉ 6 nhóm khớp khóa;
0 đề và 0 câu khớp khóa. Script báo 423 xung đột và `writes: 0`.
Các số `insert` (64/69/354/12) chỉ là **số khóa thiếu**, không phải
số bản ghi được phép nhập: đề và câu đã tồn tại dưới khóa cũ. Cặp
`matchedWithoutSetId` và `matchedWithoutExamId` bằng 0 vì chưa khớp khóa;
không chứng minh rằng các bản ghi cũ đều có liên kết. Bản script trước
chỉ xuất 100 xung đột đầu; từ phiên bản này báo cáo xuất đủ để đối chiếu.
Tuyệt đối chưa chạy apply với báo cáo này.

### Đối chiếu 423 ứng viên từ báo cáo tiếp theo

Báo cáo `reportVersion: 2` có 423 `candidates`, tương ứng 5 đề,
64 nhóm và 354 câu. Trong 354 cặp câu, 151 cặp có `contentEqual: true`,
203 cặp khác HTML (78 chuyên đề, 8 đề thử VMO, 113 TST, 4 lịch sử
Đà Nẵng–Quảng Nam). Có 20 khóa nhóm Atlas đang là nhóm chung cho hai
ngày trong manifest; không được ánh xạ hai nhóm ngày về cùng một `_id`.
Bốn khóa đề Atlas là đích của năm ứng viên; riêng hai ngày KHTN cùng
trỏ đến một đề Atlas ngày 3, không thể tự động coi là cùng đề.
Toàn bộ 354 ứng viên câu có `existingExamId` rỗng. Đây là thống kê
trên các cặp ứng viên, không phải kết luận về cả collection `problems`.

Trước khi ghi, cần so 203 cặp khác HTML với nội dung thực tế, tách
nhóm theo ngày, xác minh khóa đề và `examId`; giữ nguyên `_id` của câu
Atlas để không làm đứt liên kết bài nộp và giữ nội dung Admin đã sửa.
151 cặp trùng HTML chỉ là bằng chứng về trường `content`, vẫn cần
kiểm tra `setId`, lời giải, nguồn tham khảo và trạng thái. Không chạy
`catalog:apply` hiện tại: chế độ này vẫn chủ động chặn toàn bộ xung đột.

## Chạy kiểm kê

1. Tạo bản sao lưu Atlas của `exams`, `content_sets`, `problems`, `content_blocks`
   trước khi chạy chế độ ghi. Dùng database user chỉ đọc cho dry-run.
2. Đặt `MONGODB_URI` trong môi trường máy cục bộ, chỉ rõ database `/vmo_tst`.
   Không đưa URI vào Git, nhật ký hoặc nội dung trao đổi.
3. Chạy `npm ci`, rồi `npm run catalog:dry-run`.
   Trên PowerShell, có thể xuất JSON riêng, không trộn stderr với stdout:
   `$env:CATALOG_REPORT_PATH='catalog-report.json'; npm run catalog:dry-run`.
   Báo cáo đúng phiên bản có `reportVersion: 2` và số phần tử trong
   `conflicts` bằng `conflictCount`. File này chỉ chứa khóa/metadata,
   không chứa chuỗi kết nối; đừng thêm file báo cáo vào Git.
   `candidates` liệt kê khóa manifest và khóa Atlas có thể tương ứng;
   với câu hỏi có thêm SHA-256 nội dung và `contentEqual`. Hash không
   chứng minh hai câu cùng nghĩa khi HTML khác, và script không tự hợp nhất.
   Đối chiếu riêng cặp nhiều nguồn cùng trỏ một bản ghi, liên kết
   `setId`/`examId` và các nội dung đã sửa trước khi lập ánh xạ chính thức.
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
