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
  const outputLanguage = body.lang === 'en' ? 'English' : 'Vietnamese';

  const prompt = `Solve the following high-school Mathematical Olympiad problem rigorously and completely in ${outputLanguage}.
Exam: ${text(body.examTitle, 300)}
Problem: ${text(body.problemId, 120)} - ${text(body.problemTitle, 500)}
Topic: ${text(body.topic, 200)}
Statement: ${problemContent}
Return knowledge (theorems/tools), intuition (key idea), solution (a rigorous step-by-step solution using MathJax LaTeX), and pitfalls (common errors).
Do not use the LaTeX environments itemize, enumerate, align, or the command textbf. Use Markdown and formulas delimited by $...$ or $$...$$.`;
  try {
    const result = await generateJson({
      contents: prompt,
      schema,
      systemInstruction: `You are a VMO/IMO team coach. Write the entire response in ${outputLanguage}. Do not invent assumptions; prove every conclusion.`
    });
    return res.status(200).json({ success: true, source: 'gemini', model: result.model, data: result.data });
  } catch (error) { return handleAiError(res, error); }
}
