import express from 'express';
import path from 'path';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { build } from './build.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tự động tổng hợp mã nguồn từ thư mục src/ khi máy chủ khởi động
try {
  build();
} catch (err) {
  console.warn('[Build Warning]: Không thể tự động build khi khởi động:', err.message);
}

const app = express();
const PORT = 3000;

// Parse JSON request bodies
app.use(express.json());

// Enable gzip/deflate compression for fast asset delivery
app.use(compression());

// Lazy-loaded Gemini AI client
let aiClient = null;
let GenAITypes = null;
async function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    try {
      const { GoogleGenAI, Type } = await import('@google/genai');
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      GenAITypes = Type;
    } catch (e) {
      console.warn('Không thể khởi tạo GoogleGenAI SDK:', e.message);
      return null;
    }
  }
  return { client: aiClient, Type: GenAITypes };
}

// Hàm phân tích JSON an toàn với công thức toán LaTeX
function parseMathJSON(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch (e1) {
    try {
      const fixed = cleaned.replace(/\\/g, (match, offset, full) => {
        const next = full[offset + 1];
        if (next === '"' || next === '\\' || next === '/') return '\\';
        if (next === 'u' && /^[0-9a-fA-F]{4}/.test(full.slice(offset + 2, offset + 6))) return '\\';
        if (next === 'n' || next === 'r' || next === 't' || next === 'b' || next === 'f') {
          const rest = full.slice(offset + 1);
          if (/^[a-zA-Z]{2,}/.test(rest)) return '\\\\';
          return '\\';
        }
        return '\\\\';
      });
      return JSON.parse(fixed);
    } catch (e2) {
      console.warn('parseMathJSON fallback error:', e2.message);
      return null;
    }
  }
}

// API Hướng dẫn giải toán chuyên sâu từ AI Giáo sư Toán
app.post('/api/ai-guide', async (req, res) => {
  const { problemId, problemTitle, problemContent, topic, examTitle } = req.body || {};

  try {
    const aiInstance = await getGeminiModel();
    if (aiInstance && aiInstance.client) {
      const { client: ai, Type } = aiInstance;

      const prompt = `Bạn là một Giáo sư Toán học, Chuyên gia đầu ngành bồi dưỡng Học sinh Giỏi Quốc gia môn Toán (VMO) và Tuyển chọn Đội tuyển Quốc tế (TST/IMO).
Hãy phân tích và viết bài giải toán học đỉnh cao, chuẩn mực Olympic cho bài toán sau:

[KỲ THI/NGUỒN]: ${examTitle || 'Đề thi HSGQG / TST'}
[CÂU HỎI]: ${problemId || ''} - ${problemTitle || ''}
[CHUYÊN ĐỀ]: ${topic || 'Toán Olympic THPT'}
[NỘI DUNG ĐỀ BÀI]:
${problemContent || ''}

YÊU CẦU BẮT BUỘC CHO TỪNG PHẦN:
1. knowledge:
   - Liệt kê chính xác tên các định lý, bổ đề, công thức chuyên sâu THPT Chuyên trực tiếp áp dụng (ví dụ: bổ đề LTE, định lý Euler, cấp số nguyên, phương trình hàm Cauchy, hàng điểm điều hòa, trục đẳng phương, định lý Miquel, bổ đề kẹp Stolz-Cesaro, nguyên lý Dirichlet, bất biến...).
   - Phát biểu vắn tắt nội dung bổ đề với công thức LaTeX $...$.

2. intuition:
   - Phân tích tư duy toán học sâu sắc của Giáo sư: Tại sao lại nhận ra hướng đi này? Dấu hiệu nhận biết cấu trúc bài toán, cách tìm nghiệm thử (test cases), phương pháp cô lập biến số hoặc dựng hình phụ.

3. solution:
   - LỜI GIẢI CHI TIẾT TỪNG BƯỚC (CHUẨN THI HSG QUỐC GIA):
   - YÊU CẦU ĐẶC BIỆT QUAN TRỌNG: BẮT BUỘC PHẢI GIẢI BÀI TOÁN THẬT SỰ ĐẾN TẬN CÙNG, KHÔNG ĐƯỢC PHÁC THẢO, KHÔNG NÓI CHUNG CHUNG (nghiêm cấm tuyệt đối các câu mơ hồ như "học sinh tự biến đổi", "tương tự ta có", "bước này đơn giản xin dành cho bạn đọc").
   - Trình bày khúc chiết, đầy đủ tất cả các bước biến đổi toán học, giải tích, đại số, số học, hình học hoặc tổ hợp.
   - ĐỐI VỚI CÁC BÀI TOÁN HỎI VỀ GIÁ TRỊ (tìm giới hạn dãy số, giải phương trình/hệ phương trình, tìm hàm số, tìm giá trị lớn nhất/nhỏ nhất, tìm bộ số nguyên, đếm số cách, tính hằng số...): BẮT BUỘC PHẢI TÍNH RA ĐÁP SỐ CUỐI CÙNG CỤ THỂ VÀ CHÍNH XÁC, VÀ KẾT THÚC BẰNG DÒNG KẾT LUẬN RÕ RÀNG: **Kết luận:** [đáp số cụ thể] (ví dụ: $\\lim_{n \\to \\infty} x_n = ...$, hoặc $\\min P = ...$ khi $a=b=c=...$, hoặc tập nghiệm $S = \\{ ... \\}$, hoặc $f(x) = ...$).
   - ĐỐI VỚI CÁC BÀI TOÁN CHỨNG MINH: Lập luận chặt chẽ hai chiều, kiểm tra đầy đủ điều kiện biên và không bỏ sót trường hợp suy biến.
   - Viết công thức toán học bằng định dạng LaTeX MathJax ($...$ cho công thức nội dòng, $$...$$ cho công thức riêng dòng).

4. pitfalls:
   - Chỉ rõ các lỗi sai phổ biến mà học sinh chuyên toán hay mắc phải khi làm bài thi khiến bị trừ điểm (quên xét trường hợp biên, quên thử lại nghiệm trong phương trình hàm, chia cho biểu thức có thể bằng 0, nhầm chiều bất đẳng thức, ngộ nhận điểm rơi...).`;

      const candidateModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
      let response = null;
      let usedModel = '';

      for (const modelName of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction: 'Bạn là Giáo sư - Huấn luyện viên trưởng Đội tuyển Olympic Toán học Quốc tế (IMO) và Quốc gia (VMO). Bạn có năng lực tư duy logic đỉnh cao, giải quyết triệt để mọi bài toán Olympic THPT Chuyên. Bạn luôn viết lời giải thật sự chi tiết từng bước đến tận cùng, không bao giờ phác thảo chung chung, và luôn tính ra kết quả cuối cùng cụ thể đối với các bài toán hỏi giá trị.',
              responseMimeType: 'application/json',
              responseSchema: Type ? {
                type: Type.OBJECT,
                properties: {
                  knowledge: { type: Type.STRING, description: '1. Kiến thức & Bổ đề chuyên toán cần nắm vững' },
                  intuition: { type: Type.STRING, description: '2. Ý tưởng then chốt & Phân tích của Giáo sư Toán' },
                  solution: { type: Type.STRING, description: '3. Lời giải chi tiết từng bước chuẩn VMO, giải thật sự và tính ra kết quả cuối cùng cụ thể' },
                  pitfalls: { type: Type.STRING, description: '4. Sai lầm phổ biến & Lưu ý khi chấm thi' }
                },
                required: ['knowledge', 'intuition', 'solution', 'pitfalls']
              } : undefined,
              temperature: 0.1
            }
          });
          usedModel = modelName;
          break;
        } catch (err) {
          console.warn(`Model ${modelName} gặp lỗi/quá tải, đang chuyển model kế tiếp:`, err.message?.substring(0, 100));
        }
      }

      if (response && response.text) {
        const parsed = parseMathJSON(response.text);
        if (parsed && (parsed.solution || parsed.knowledge)) {
          return res.json({
            success: true,
            source: 'gemini',
            model: usedModel,
            data: parsed
          });
        }
      }
    }
  } catch (err) {
    console.warn('Gemini generation fallback to local expert engine:', err.message);
  }

  // Fallback to local expert response
  res.json({
    success: false,
    source: 'fallback',
    message: 'Chuyển sang cơ sở dữ liệu phân tích chuyên gia toán học tích hợp sẵn.'
  });
});

// Set security and cross-origin headers that permit Firebase Auth popup and external CDNs
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Cache control: Always require revalidation so client code updates take effect immediately
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve static assets from root directory
app.use(express.static(__dirname, {
  extensions: ['html', 'htm']
}));

// Route for root /
app.get('/', (req, res) => {
  try {
    build();
  } catch (err) {
    console.warn('[Build Warning]:', err.message);
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route for login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Fallback for clean URLs
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VMO Da Nang production server running on port ${PORT}`);
});

