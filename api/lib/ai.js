let client;
const calls = new Map();

function parseJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

function normalizeMathOutput(value) {
  if (typeof value === 'string') {
    return value
      .replace(/\\begin\{(?:itemize|enumerate)\}/g, '\n')
      .replace(/\\end\{(?:itemize|enumerate)\}/g, '\n')
      .replace(/\\item\s*/g, '\n- ')
      .replace(/\\textbf\{([^{}]*)\}/g, '**$1**');
  }
  if (Array.isArray(value)) return value.map(normalizeMathOutput);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeMathOutput(item)]));
  }
  return value;
}

export function checkRateLimit(username, limit = 12, windowMs = 60_000) {
  const key = String(username || 'anonymous');
  const now = Date.now();
  const recent = (calls.get(key) || []).filter(time => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  calls.set(key, recent);
  return true;
}

export function text(value, max = 50_000) {
  return String(value ?? '').trim().slice(0, max);
}

export function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body); } catch { return null; }
}

export async function generateJson({ contents, schema, systemInstruction, temperature = 0.15, models = ['gemini-3.5-flash-lite'], timeoutMs = 22_000 }) {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY chưa được cấu hình trên Vercel');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }
  if (!client) {
    const { GoogleGenAI } = await import('@google/genai');
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // Dùng model hiện hành hỗ trợ ảnh và structured JSON. Có thể ghi đè model
  // qua tham số `models` ở từng chức năng khi cần.
  const modelList = Array.isArray(models) && models.length ? models.map(value => text(value, 80)).filter(Boolean).slice(0, 3) : ['gemini-3.5-flash-lite'];
  const requestTimeout = Math.max(5_000, Math.min(50_000, Number(timeoutMs) || 22_000));
  let lastError;
  for (const model of modelList) {
    try {
      const response = await Promise.race([
        client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            temperature
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), requestTimeout))
      ]);
      const data = parseJson(response?.text);
      if (data) return { data: normalizeMathOutput(data), model };
      lastError = new Error('AI trả về JSON không hợp lệ');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Không nhận được phản hồi AI');
}

export function prepare(res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

export function handleAiError(res, error) {
  console.error('[AI API]', error);
  const notConfigured = error?.code === 'AI_NOT_CONFIGURED';
  return res.status(notConfigured ? 503 : 502).json({
    success: false,
    error: notConfigured ? error.message : 'Dịch vụ AI tạm thời không phản hồi'
  });
}
