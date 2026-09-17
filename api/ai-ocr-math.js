import { getSession } from './lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from './lib/ai.js';

const schema = {
  type: 'object',
  properties: { latexText: { type: 'string' }, summary: { type: 'string' }, confidence: { type: 'string' } },
  required: ['latexText', 'summary', 'confidence']
};

// Gemini đôi khi trả một dòng TeX thuần (ví dụ \\boxed{...}) không có
// delimiter. Chuẩn hóa ở API để mọi client đều nhận được MathJax hợp lệ.
function normalizeOcrLatex(value) {
  let text = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!text) return text;
  text = text.replace(/\\\$/g, '$');
  text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
    .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
    .replace(/(?<!\$\$|\\\[)\s*(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})\s*(?!\$\$|\\\])/g, (_, block) => `\n$$\n${block}\n$$\n`);
  const mathParts = [];
  text = text.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?:\\.|[^$])+\$)/g, match => {
    mathParts.push(match);
    return `\uE000${mathParts.length - 1}\uE001`;
  });
  // Văn bản OCR như \\text{Giải.} phải nằm ngoài LaTeX math.
  text = text.replace(/\\text(?:bf|it|rm)?\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
  text = text
    .replace(/\\(ne|le|ge|in|notin|to|Rightarrow|Leftrightarrow|cdot|times|pm)\b/g,
      (_, command) => ({ ne: '≠', le: '≤', ge: '≥', in: '∈', notin: '∉', to: '→', Rightarrow: '⇒', Leftrightarrow: '⇔', cdot: '·', times: '×', pm: '±' }[command] || command))
    .replace(/(\\frac\{[^{}]+\}\{[^{}]+\}|\\sqrt\{[^{}]+\})/g, '$$$1$$')
    .replace(/([A-Za-z](?:_\{[^{}]+\}|\^[^{}]+|_[A-Za-z0-9]+|\^[A-Za-z0-9]+))/g, '$$$1$$');
  text = text.replace(/\uE000(\d+)\uE001/g, (_, index) => mathParts[Number(index)] || '');
  const lines = text.split(/\r?\n/);
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || /^\$\$|^\$|^\\\[|^\\\(/.test(trimmed)) return line;
    // Các dòng chỉ chứa một biểu thức TeX phải là display math.
    if (/^\\(?:boxed|fbox|frac|sqrt|sum|prod|lim|left|right|text)\b/.test(trimmed)) {
      return `$$\n${trimmed}\n$$`;
    }
    return line;
  }).join('\n');
}

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
  const prompt = `Đọc chính xác toàn bộ bài toán/bài giải viết tay trong ảnh. Trả về latexText để hiển thị trực tiếp bằng MathJax.
Quy tắc bắt buộc: công thức nội dòng phải đặt trong $...$; công thức riêng dòng phải đặt trong $$...$$; không được để \\boxed, \\frac, chỉ số, số mũ hoặc lệnh LaTeX trần ngoài delimiter; không dùng align/align* (dùng aligned); dùng \\le, \\ge, \\in, \\ne, \\to; chữ tiếng Việt nằm ngoài công thức hoặc trong \\text{...}. Giữ nguyên nội dung nhìn thấy, không tự suy diễn. Trả summary ngắn và confidence.`;
  try {
    const result = await generateJson({ contents: { parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: prompt }] }, schema, systemInstruction: 'Bạn là chuyên gia OCR công thức toán tiếng Việt.' });
    const data = { ...result.data, latexText: normalizeOcrLatex(result.data?.latexText) };
    return res.status(200).json({ success: true, source: 'gemini', model: result.model, data });
  } catch (error) { return handleAiError(res, error); }
}
