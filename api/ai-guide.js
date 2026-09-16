import { getSession } from './lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from './lib/ai.js';

const schema = {
  type: 'object',
  properties: {
    knowledge: { type: 'string' }, intuition: { type: 'string' },
    solution: { type: 'string' }, pitfalls: { type: 'string' }
  },
  required: ['knowledge', 'intuition', 'solution', 'pitfalls']
};

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!checkRateLimit(session.username)) return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu quá nhanh' });
  const body = parseBody(req);
  if (!body) return res.status(400).json({ success: false, error: 'JSON không hợp lệ' });
  const problemContent = text(body.problemContent);
  if (!problemContent) return res.status(400).json({ success: false, error: 'Thiếu nội dung bài toán' });

  const prompt = `Hãy giải bài toán Olympic THPT sau bằng tiếng Việt, chặt chẽ và đến kết quả cuối cùng.
Kỳ thi: ${text(body.examTitle, 300)}
Câu: ${text(body.problemId, 120)} - ${text(body.problemTitle, 500)}
Chuyên đề: ${text(body.topic, 200)}
Đề bài: ${problemContent}
Trả về knowledge (định lý/công cụ), intuition (ý tưởng), solution (lời giải từng bước, LaTeX MathJax), pitfalls (lỗi thường gặp).`;
  try {
    const result = await generateJson({ contents: prompt, schema, systemInstruction: 'Bạn là huấn luyện viên đội tuyển VMO/IMO. Không bịa dữ kiện; mọi kết luận phải được chứng minh.' });
    return res.status(200).json({ success: true, source: 'gemini', model: result.model, data: result.data });
  } catch (error) { return handleAiError(res, error); }
}
