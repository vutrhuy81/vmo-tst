import { getSession } from './lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from './lib/ai.js';

const VERDICTS = [
  'CORRECT_OPTIMAL',
  'CORRECT_SUBOPTIMAL',
  'RIGHT_DIRECTION_INACCURATE',
  'MISSING_CONDITIONS',
  'LOGICAL_GAP',
  'INCORRECT'
];

const VERDICT_COLORS = {
  CORRECT_OPTIMAL: '#16a34a',
  CORRECT_SUBOPTIMAL: '#15803d',
  RIGHT_DIRECTION_INACCURATE: '#d97706',
  MISSING_CONDITIONS: '#ea580c',
  LOGICAL_GAP: '#ea580c',
  INCORRECT: '#dc2626'
};

const schema = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICTS }, verdictLabel: { type: 'string' },
    estimatedScore: { type: 'string' }, summary: { type: 'string' }, approachAnalysis: { type: 'string' },
    stepByStep: { type: 'string' }, criticalFlaws: { type: 'string' }, recommendations: { type: 'string' },
    verificationNotes: { type: 'string' }
  },
  required: [
    'verdict', 'verdictLabel', 'estimatedScore', 'summary', 'approachAnalysis',
    'stepByStep', 'criticalFlaws', 'recommendations', 'verificationNotes'
  ]
};

function normalizeEvaluation(value) {
  const data = value && typeof value === 'object' ? value : {};
  const verdict = VERDICTS.includes(data.verdict) ? data.verdict : 'LOGICAL_GAP';
  let estimatedScore = text(data.estimatedScore, 30);
  const scoreMatch = estimatedScore.match(/^(\d+(?:\.\d+)?)\s*\/\s*5(?:\.0)?(?:\s*(?:đ|điểm))?$/i);

  if (scoreMatch) {
    const score = Math.max(0, Math.min(5, Number(scoreMatch[1])));
    estimatedScore = `${Number.isInteger(score) ? score.toFixed(1) : score}/5.0`;
  } else {
    estimatedScore = '0.0/5.0';
  }

  return {
    verdict,
    verdictLabel: text(data.verdictLabel, 500) || verdict,
    verdictColor: VERDICT_COLORS[verdict],
    estimatedScore,
    summary: text(data.summary, 8_000),
    approachAnalysis: text(data.approachAnalysis, 12_000),
    stepByStep: text(data.stepByStep, 20_000),
    criticalFlaws: text(data.criticalFlaws, 12_000),
    recommendations: text(data.recommendations, 12_000),
    verificationNotes: text(data.verificationNotes, 8_000)
  };
}

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!checkRateLimit(session.username, 8)) return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu quá nhanh' });
  const body = parseBody(req);
  if (!body) return res.status(400).json({ success: false, error: 'JSON không hợp lệ' });
  const solutionText = text(body.solutionText);
  const solutionImage = text(body.solutionImage, 4_000_000);
  if (!solutionText && !solutionImage) return res.status(400).json({ success: false, error: 'Cần có văn bản hoặc ảnh bài giải' });

  const prompt = `Chấm bài giải Olympic THPT theo thang 5 điểm.

THÔNG TIN BÀI TOÁN
- Kỳ thi: ${text(body.examTitle, 300)}
- Câu: ${text(body.problemId, 180)} - ${text(body.problemTitle, 500)}
- Chuyên đề: ${text(body.topic, 200)}
- Đề bài: ${text(body.problemContent)}

BÀI LÀM THÍ SINH
${solutionText || '(xem ảnh đính kèm)'}

QUY TRÌNH CHẤM BẮT BUỘC
1. Tự giải hoặc thiết lập một lời giải chuẩn ngắn gọn trước khi nhận xét bài làm.
2. Đối chiếu từng khẳng định của thí sinh với đề bài; không suy diễn nội dung thí sinh chưa viết.
3. Trước khi kết luận một phép biến đổi đúng hoặc sai, phải tự tính lại độc lập. Với mỗi đẳng thức, hãy khai triển hoặc thế ngược để kiểm tra dấu, hệ số và điều kiện.
4. Nếu đưa ra công thức sửa lỗi, phải kiểm tra công thức đó bằng phép biến đổi trực tiếp. Không được tạo ra lỗi toán học mới trong phần nhận xét.
5. Phân biệt rõ: sai toán học, thiếu chứng minh, trình bày vắn tắt và phương pháp chưa tối ưu. Không hạ verdict chỉ vì văn phong nếu logic đã đầy đủ.
6. Sau khi viết nhận xét, rà soát lần cuối tất cả công thức xuất hiện trong chính báo cáo chấm.

ĐẦU RA
- verdict chỉ được dùng một trong: ${VERDICTS.join(', ')}.
- estimatedScore phải có dạng số/5.0, ví dụ 3.5/5.0.
- verificationNotes ghi ngắn gọn các phép tính hoặc đẳng thức quan trọng mà giám khảo đã tự kiểm tra lại.
- Nêu điểm, đánh giá hướng tiếp cận, rà soát từng bước, lỗi logic và khuyến nghị.
- Dùng LaTeX MathJax với $...$ hoặc $$...$$.
- Không dùng môi trường itemize, enumerate, align hoặc lệnh textbf; dùng Markdown cho danh sách.`;
  let contents = prompt;
  if (solutionImage) {
    const match = solutionImage.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
    if (!match) return res.status(400).json({ success: false, error: 'Ảnh phải là JPEG, PNG hoặc WEBP dạng base64' });
    contents = { parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: prompt }] };
  }
  try {
    const result = await generateJson({
      contents,
      schema,
      temperature: 0,
      systemInstruction: `Bạn là giám khảo VMO/IMO nghiêm túc và thận trọng.
Ưu tiên tính đúng đắn hơn độ dài. Không bịa dữ kiện hoặc lỗi.
Mọi phép biến đổi đại số do bạn nêu phải được tự kiểm tra độc lập trước khi trả kết quả JSON.`
    });
    return res.status(200).json({
      success: true,
      source: 'gemini',
      model: result.model,
      data: normalizeEvaluation(result.data)
    });
  } catch (error) { return handleAiError(res, error); }
}
