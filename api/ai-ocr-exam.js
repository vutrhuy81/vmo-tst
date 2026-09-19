import { getSession } from '../lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from '../lib/ai.js';

const schema = {
  type: 'object',
  properties: {
    province: { type: 'string' },
    examTitle: { type: 'string' },
    examDate: { type: 'string' },
    duration: { type: 'number' },
    dayNumber: { type: 'number' },
    confidence: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionNumber: { type: 'number' },
          title: { type: 'string' },
          topic: { type: 'string' },
          maxScore: { type: 'number' },
          content: { type: 'string' }
        },
        required: ['questionNumber', 'title', 'topic', 'maxScore', 'content']
      }
    }
  },
  required: ['province', 'examTitle', 'examDate', 'duration', 'dayNumber', 'confidence', 'questions']
};

function normalizeMath(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\\\$/g, '$')
    .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
    .trim();
}

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (session.role !== 'admin') return res.status(403).json({ success: false, error: 'Chỉ quản trị viên được OCR đề thi' });
  if (!checkRateLimit(`exam-ocr:${session.username}`, 12)) {
    return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu OCR quá nhanh' });
  }

  const body = parseBody(req);
  const image = text(body?.image, 4_000_000);
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ success: false, error: 'Thiếu ảnh JPEG, PNG hoặc WEBP hợp lệ' });

  const context = {
    province: text(body?.province, 120),
    year: text(body?.year, 40) || '2026-2027',
    dayNumber: Math.max(1, Math.min(body?.destination === 'tst' ? 4 : 2, Number(body?.dayNumber) || 1))
  };
  const prompt = `Nhận dạng chính xác đề thi Olympic Toán tiếng Việt trong ảnh và tách thành từng câu hỏi.

Ngữ cảnh do quản trị viên cung cấp: tỉnh/thành phố "${context.province}", năm học "${context.year}", ngày thi thứ ${context.dayNumber}.

Quy tắc bắt buộc:
1. Chỉ chép nội dung nhìn thấy; không giải bài, không bổ sung giả thiết và không suy diễn phần bị khuất.
2. Giữ đúng số câu, các ý a), b), c), điểm số, ký hiệu và điều kiện toán học.
3. Trong trường content: công thức nội dòng đặt trong $...$; công thức riêng dòng đặt trong $$...$$.
4. Không để lệnh LaTeX trần ngoài delimiter. Không dùng align/align*; nếu cần nhiều dòng, dùng $$\\begin{aligned}...\\end{aligned}$$.
5. Dùng LaTeX chuẩn MathJax: \\mathbb, \\frac, \\sqrt, \\le, \\ge, \\ne, \\in, \\to, \\mid.
6. title ngắn gọn dạng "Câu 5"; topic là một trong các mô tả như Đại số, Số học, Hình học, Tổ hợp, Phương trình hàm, Dãy số.
7. examDate dùng định dạng YYYY-MM-DD nếu đọc được, nếu không để chuỗi rỗng. duration là số phút.
8. Trả đúng JSON theo schema, không Markdown và không văn bản ngoài JSON.`;

  try {
    const result = await generateJson({
      contents: {
        parts: [
          { inlineData: { mimeType: match[1], data: match[2] } },
          { text: prompt }
        ]
      },
      schema,
      temperature: 0,
      systemInstruction: 'Bạn là chuyên gia biên tập đề thi Olympic Toán Việt Nam. Nhiệm vụ duy nhất là OCR chính xác và tạo LaTeX tương thích MathJax.'
    });
    const data = result.data || {};
    const questions = (Array.isArray(data.questions) ? data.questions : [])
      .slice(0, 10)
      .map((item, index) => ({
        questionNumber: Math.max(1, Number(item?.questionNumber) || index + 1),
        title: text(item?.title, 200) || `Câu ${index + 1}`,
        topic: text(item?.topic, 120) || 'Toán Olympic',
        maxScore: Math.max(0, Math.min(20, Number(item?.maxScore) || 0)),
        content: normalizeMath(item?.content)
      }))
      .filter(item => item.content);
    if (!questions.length) return res.status(422).json({ success: false, error: 'Không nhận dạng được câu hỏi nào trong ảnh' });

    return res.status(200).json({
      success: true,
      source: 'gemini',
      model: result.model,
      data: {
        province: text(data.province, 120) || context.province,
        examTitle: text(data.examTitle, 500),
        examDate: text(data.examDate, 20),
        duration: Math.max(1, Math.min(600, Number(data.duration) || 180)),
        dayNumber: Math.max(1, Math.min(body?.destination === 'tst' ? 4 : 2, Number(data.dayNumber) || context.dayNumber)),
        confidence: text(data.confidence, 40) || 'unknown',
        questions
      }
    });
  } catch (error) {
    return handleAiError(res, error);
  }
}
