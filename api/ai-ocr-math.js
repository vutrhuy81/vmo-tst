import { getSession } from './lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from './lib/ai.js';

const schema = {
  type: 'object',
  properties: { latexText: { type: 'string' }, summary: { type: 'string' }, confidence: { type: 'string' } },
  required: ['latexText', 'summary', 'confidence']
};

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!checkRateLimit(session.username, 8)) return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu quá nhanh' });
  const body = parseBody(req);
  const image = text(body?.image || body?.solutionImage, 4_000_000);
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
  if (!match) return res.status(400).json({ success: false, error: 'Thiếu ảnh JPEG, PNG hoặc WEBP dạng base64' });
  const prompt = 'Đọc chính xác bài toán/bài giải viết tay trong ảnh. Trả latexText dùng MathJax, summary mô tả ngắn nội dung nhận diện và confidence. Không tự thêm nội dung không nhìn thấy.';
  try {
    const result = await generateJson({ contents: { parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: prompt }] }, schema, systemInstruction: 'Bạn là chuyên gia OCR công thức toán tiếng Việt.' });
    return res.status(200).json({ success: true, source: 'gemini', model: result.model, data: result.data });
  } catch (error) { return handleAiError(res, error); }
}
