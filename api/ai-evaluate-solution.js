import { getSession } from './lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from './lib/ai.js';

const schema = {
  type: 'object',
  properties: {
    verdict: { type: 'string' }, verdictLabel: { type: 'string' }, verdictColor: { type: 'string' },
    estimatedScore: { type: 'string' }, summary: { type: 'string' }, approachAnalysis: { type: 'string' },
    stepByStep: { type: 'string' }, criticalFlaws: { type: 'string' }, recommendations: { type: 'string' }
  },
  required: ['verdict', 'verdictLabel', 'estimatedScore', 'summary', 'approachAnalysis', 'stepByStep', 'criticalFlaws', 'recommendations']
};

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

  const prompt = `Chấm bài giải Olympic theo thang 5 điểm.
Đề: ${text(body.problemContent)}
Bài làm: ${solutionText || '(xem ảnh đính kèm)'}
Phân loại verdict chỉ dùng: CORRECT_OPTIMAL, CORRECT_SUBOPTIMAL, RIGHT_DIRECTION_INACCURATE, MISSING_CONDITIONS, LOGICAL_GAP, INCORRECT.
Nêu điểm, đánh giá hướng tiếp cận, rà soát từng bước, lỗi logic và khuyến nghị. Dùng LaTeX MathJax.
Không dùng các môi trường LaTeX itemize, enumerate, align hoặc lệnh textbf; dùng Markdown và công thức $...$, $$...$$.`;
  let contents = prompt;
  if (solutionImage) {
    const match = solutionImage.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
    if (!match) return res.status(400).json({ success: false, error: 'Ảnh phải là JPEG, PNG hoặc WEBP dạng base64' });
    contents = { parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: prompt }] };
  }
  try {
    const result = await generateJson({ contents, schema, systemInstruction: 'Bạn là giám khảo VMO nghiêm túc, công bằng và chỉ ra chính xác mọi lỗ hổng.' });
    return res.status(200).json({ success: true, source: 'gemini', model: result.model, data: result.data });
  } catch (error) { return handleAiError(res, error); }
}
