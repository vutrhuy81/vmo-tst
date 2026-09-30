# Retrieval hai tầng — bản preview 2026-09-30

Nhánh: `feature/two-stage-hybrid-rag-20260930`. Bắt đầu từ main `7d2069e6443cf80747e9240ee4871f280a8e18d9`.

## Luồng

Cả `/api/ai-guide` và `/api/ai-evaluate-solution` dùng `retrieveVerifiedContext`.

1. Backend giải quyết `contentKey`, ID Atlas hoặc ID cũ tới problem hiện hành, kiểm tra trạng thái/khóa AI và quyền đọc. Đề Atlas là nguồn chuẩn; client không được thay đề trong prompt.
2. Exact: tìm submission Admin xác minh theo các khóa chuẩn, so hash đề hiện hành với snapshot. Nguồn referenceSolution trong problem chỉ được dùng nếu `referenceSolutionProblemHash` khớp đề hiện tại; nguồn cũ chưa có hash không mặc nhiên được tin.
3. Hybrid khi exact không có: pre-filter active/admin_verified/topic; chạy Atlas Vector Search, Atlas Search và exact-tag lookup; hợp nhất RRF, lọc điều kiện, đọc lại submission/problem và kiểm tra hash/verification. Tối đa 3 nguồn khác nhau.
4. Nhận định SIMILAR chỉ hỗ trợ phương pháp; không phải đáp án cho bài mới. Gemini giải/chấm và GPT kiểm định vẫn giữ. Chấm bài phải chấp nhận phương pháp đúng khác nguồn.

Bản đầu chủ động yêu cầu tag toán học phù hợp; chưa dùng ngưỡng vector cố định khi chưa có corpus thật để hiệu chỉnh. Bộ tag là heuristics hữu hạn trong rag-core.js; không phải bộ chứng minh tương đương toán học. Nguồn không có tag phù hợp bị bỏ qua. Lọc giả thiết chỉ nhận diện một số điều kiện (nguyên, thực, dương, tam giác nhọn); prompt phải tiếp tục kiểm tra đầy đủ. Nếu không đủ nguồn, AI tự giải độc lập. Không có cam kết mọi bài tương tự đều được tìm thấy.

## Collection và trạng thái

- `verified_knowledge`: sourceId, problemId/key, hash đề/lời giải, trạng thái, topic/tags/constraints, searchText rút gọn, vector/model/dimensions/version. Không duplicate toàn bộ lời giải.
- `rag_index_jobs`: pending → processing → ready; failed thử tối đa 5 lần; revoked nếu nguồn không còn đủ điều kiện. Lease 60s cho job đang xử lý.
- `rag_retrieval_logs`: ID lần truy xuất, mục đích, source IDs/hash/matchType, số token, chi phí embedding ước tính, thời gian, lỗi/hạn chế. TTL 90 ngày. Không lưu lời giải hoặc thông tin người làm bài trong context nguồn; nhật ký có username người gọi và chỉ Admin đọc được.

Xác minh/sửa/thu hồi/xóa submission cập nhật hàng đợi. Lưu đè hoặc sửa AI Guide thu hồi xác minh của bản lưu. Nếu enqueue lỗi, mutation vẫn hoàn tất, ghi lỗi server; retrieval kiểm tra nguồn gốc để từ chối index cũ. Backfill phục hồi jobs bị bỏ lỡ. Sửa đề tự khiến hash cũ không khớp. Kiểm tra cuối diễn ra ngay trước khi tạo prompt, không bảo đảm nguồn không thay đổi trong lúc model đang chạy.

Một nguồn có nội dung rất dài được cắt giới hạn để kiểm soát prompt; provenance ghi truncated. Nguồn đã xác minh được coi là tài liệu tham khảo, không mặc nhiên là lời giải hoàn chỉnh đạt điểm tối đa.

## Cấu hình Atlas / Vercel

Giữ các biến đã có: MONGODB_URI, JWT_SECRET, OPENAI_API_KEY và biến model Gemini/GPT. Thêm CRON_SECRET để bảo vệ worker cron.

Biến thêm:

- RAG_MODE=hybrid (mặc định); exact để tắt retrieval tầng 2 khi rollback.
- RAG_EMBEDDING_MODEL=text-embedding-3-small (mặc định).
- RAG_EMBEDDING_DIMENSIONS=1536 (mặc định). Model/query/index phải cùng kích thước.
- RAG_EMBEDDING_USD_PER_MILLION: giá embedding thực tế trong tài khoản; nếu thiếu, chi phí ghi null, không tự bịa giá.
- RAG_MIN_TAG_OVERLAP=0.25: mức phủ tag tối thiểu, cần hiệu chỉnh bằng corpus. Đây không phải vector similarity threshold.

Trong Database Hub → AI xu hướng đề → Kho tham chiếu đã xác minh:

1. Thiết lập chỉ mục (cần tài khoản Atlas có quyền quản lý Search indexes).
2. Chờ rag_vector_v1 và rag_text_v1 queryable/READY.
3. Đưa nguồn đã xác minh vào hàng đợi; bấm tiếp nếu còn trang.
4. Lập chỉ mục 3 nguồn tiếp theo, lặp lại cho tới khi ready. Mỗi nguồn tạo một embedding, có chi phí.
5. Xem nhật ký để xác nhận exact/hybrid/none, mã nguồn, trạng thái/lỗi.

CLI tương đương:

    npm run rag:index -- setup
    npm run rag:index -- backfill
    npm run rag:index -- backfill <cursor>
    npm run rag:index -- process

Tác vụ chạy từ CLI hoặc Admin theo batch; worker cron chạy mỗi ngày lúc 00:00 UTC (07:00 Việt Nam), tối đa 24 nguồn/lượt, yêu cầu CRON_SECRET. Cron Vercel chỉ chạy trên deployment production; preview dùng nút Admin hoặc CLI. Vì vậy submission mới xác minh dùng được qua exact ngay, nhưng phải xử lý job trước khi tham gia vector retrieval. Quản trị dùng API data hiện có (maxDuration 120s); worker dùng endpoint thứ 12 và xác thực Bearer CRON_SECRET. AI chừa ngân sách retrieval bằng timeout Gemini 130s và GPT 140s.

Thay embedding model/dimensions cần tạo lại index vector tương ứng và backfill; setup không tự phá/hủy chỉ mục đang có. Không dùng embedding các model khác nhau chung một không gian.

## Kiểm thử và đo

`npm test`: có trường hợp đúng khóa, đổi đề a_2727 → a_(27^27), khác giả thiết nhọn, thu hồi, xóa, sửa lời giải và nguồn chưa công khai. Có kiểm tra prompt chấp nhận phương pháp khác, không phải kiểm thử một model thực chấm phương pháp đó.

`npm run rag:benchmark`: 8 fixtures, mock candidate search, không gọi Atlas/embedding/model thật. Kết quả docs/rag-benchmark-offline.json chỉ đánh giá orchestration và kiểm tra nguồn. p50/p95 là thời gian mock trong bộ nhớ; không đại diện thời gian mạng. Baseline mô phỏng exact theo problemKey cũ, không đo lại toàn pipeline AI cũ.

Đo thật:

    node scripts/rag-benchmark-live.mjs labelled-cases.json > rag-benchmark-live.json

Corpus: mảng {name, problemRef, expectedSourceIds: [submissionId...]}; cần Admin gán nhãn độc lập. Tối thiểu nên có 50–100 bài đa chuyên đề, nhiều bài gần giống khác giả thiết và bài không có nguồn. Script đo Recall@3, precision, p50/p95 và token/chi phí embedding. Chưa đo chi phí sinh/chấm AI. Thực hiện riêng thử nghiệm chấm cặp lời giải cùng bài theo hai phương pháp đúng; đánh giá điểm, lỗi và chênh lệch bởi Admin.

Không xem điểm RRF là xác suất đúng. Chưa đủ điều kiện merge chỉ dựa trên benchmark mock; phải kiểm tra live Atlas và chất lượng Gemini/GPT trước khi merge.
