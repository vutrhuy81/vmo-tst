import { ObjectId } from 'mongodb';
import { getDb } from './lib/db.js';
import { getSession } from './lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from './lib/ai.js';
import { generateOpenAIJson } from './lib/openai.js';

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
    verificationNotes: { type: 'string' }, studentWorkTranscription: { type: 'string' }
  },
  required: [
    'verdict', 'verdictLabel', 'estimatedScore', 'summary', 'approachAnalysis',
    'stepByStep', 'criticalFlaws', 'recommendations', 'verificationNotes', 'studentWorkTranscription'
  ]
};

const stringArray = { type: 'array', items: { type: 'string' } };
const verifierSchema = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' }, corrected: { type: 'boolean' },
    allClaimsChecked: { type: 'boolean' }, mathCorrect: { type: 'boolean' },
    scoreConsistent: { type: 'boolean' }, noInventedStudentWork: { type: 'boolean' },
    referenceMatched: { type: 'boolean' }, criticalIssues: stringArray,
    verdict: { type: 'string', enum: VERDICTS }, verdictLabel: { type: 'string' },
    estimatedScore: { type: 'string' }, summary: { type: 'string' }, approachAnalysis: { type: 'string' },
    stepByStep: { type: 'string' }, criticalFlaws: { type: 'string' }, recommendations: { type: 'string' },
    verificationNotes: { type: 'string' }
  },
  required: [
    'approved', 'corrected', 'allClaimsChecked', 'mathCorrect', 'scoreConsistent',
    'noInventedStudentWork', 'referenceMatched', 'criticalIssues', 'verdict', 'verdictLabel',
    'estimatedScore', 'summary', 'approachAnalysis', 'stepByStep', 'criticalFlaws',
    'recommendations', 'verificationNotes'
  ],
  additionalProperties: false
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

async function trustedReference(problemRef) {
  if (!problemRef) return null;
  const filters = [{ contentKey: problemRef }, { id: problemRef }];
  if (ObjectId.isValid(problemRef)) filters.unshift({ _id: new ObjectId(problemRef) });
  const db = await getDb();
  const problem = await db.collection('problems').findOne(
    { $or: filters },
    { projection: { referenceSolution: 1, referenceSolutionVerified: 1 } }
  );
  if (problem?.referenceSolutionVerified === true && text(problem.referenceSolution, 100_000)) {
    return { content: text(problem.referenceSolution, 100_000), origin: 'admin_verified_problem_reference' };
  }
  const submission = await db.collection('submissions').findOne(
    { problemKey: problemRef, adminVerified: true, solutionContent: { $type: 'string', $ne: '' } },
    { sort: { updatedAt: -1, createdAt: -1 }, projection: { solutionContent: 1 } }
  );
  return submission
    ? { content: text(submission.solutionContent, 100_000), origin: 'admin_verified_submission' }
    : null;
}

function verifierChecks(data, hasTrustedReference) {
  return {
    allClaimsChecked: data?.allClaimsChecked === true,
    mathCorrect: data?.mathCorrect === true,
    scoreConsistent: data?.scoreConsistent === true,
    noInventedStudentWork: data?.noInventedStudentWork === true,
    // Không có nguồn admin xác minh thì GPT phải tự giải độc lập; không được
    // biến một cờ "không có gì để đối chiếu" thành lỗi chặn toàn bộ kết quả.
    referenceMatched: !hasTrustedReference || data?.referenceMatched === true
  };
}

function verifierApproved(data, hasTrustedReference) {
  return Object.values(verifierChecks(data, hasTrustedReference)).every(Boolean);
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
  const outputLanguage = body.lang === 'en' ? 'English' : 'Vietnamese';

  if (session.role !== 'admin') {
    const problemRef = text(body.problemKey || body.problemId, 180);
    if (problemRef) {
      const filters = [{ contentKey: problemRef }, { id: problemRef }];
      if (ObjectId.isValid(problemRef)) filters.unshift({ _id: new ObjectId(problemRef) });
      const db = await getDb();
      const registeredProblem = await db.collection('problems').findOne({ $or: filters });
      if (registeredProblem) {
        const registeredSet = registeredProblem.setId
          ? await db.collection('content_sets').findOne({ _id: registeredProblem.setId }, { projection: { status: 1 } })
          : null;
        if (registeredProblem.status !== 'published' || registeredSet?.status !== 'published') {
          return res.status(403).json({ success: false, error: 'Câu hỏi hiện chưa được công khai' });
        }
        if (registeredProblem.allowAiEvaluation === false) {
          return res.status(403).json({ success: false, error: 'Câu hỏi hiện tạm khóa chức năng đánh giá AI' });
        }
      }
    }
  }

  const prompt = `Chấm bài giải Olympic THPT theo thang 5 điểm. Viết TOÀN BỘ báo cáo bằng ${outputLanguage}, với văn phong toán học chuẩn mực.

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
- studentWorkTranscription chép lại trung thực bài làm học sinh; nếu đầu vào là văn bản thì giữ nguyên nội dung, nếu là ảnh thì OCR đầy đủ để lớp kiểm định độc lập sử dụng.
- Nêu điểm, đánh giá hướng tiếp cận, rà soát từng bước, lỗi logic và khuyến nghị.
- Dùng LaTeX MathJax với $...$ hoặc $$...$$.
- Không dùng môi trường itemize, enumerate, align hoặc lệnh textbf; dùng Markdown cho danh sách.`;
  try {
    const problemRef = text(body.problemKey || body.problemId, 180);
    const reference = await trustedReference(problemRef);
    const referenceBlock = reference?.content
      ? `\nNGUỒN LỜI GIẢI ĐÃ ĐƯỢC ADMIN XÁC MINH\n${reference.content}`
      : '\nKhông có lời giải tham khảo đã xác minh; phải tự giải và kiểm tra độc lập.';
    const provisionalPrompt = `${prompt}${referenceBlock}`;
    let contents = provisionalPrompt;
    if (solutionImage) {
      const match = solutionImage.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s);
      if (!match) return res.status(400).json({ success: false, error: 'Ảnh phải là JPEG, PNG hoặc WEBP dạng base64' });
      contents = { parts: [{ inlineData: { mimeType: match[1], data: match[2] } }, { text: provisionalPrompt }] };
    }

    const provisional = await generateJson({
      contents,
      schema,
      temperature: 0,
      models: [process.env.GEMINI_EVALUATION_MODEL || process.env.GEMINI_SOLVER_MODEL || 'gemini-3.5-flash-lite'],
      timeoutMs: 45_000,
      systemInstruction: `Bạn là giám khảo VMO/IMO nghiêm túc và thận trọng. Toàn bộ nội dung phải được viết bằng ${outputLanguage}.
Ưu tiên tính đúng đắn hơn độ dài. Không bịa dữ kiện hoặc lỗi.
Mọi phép biến đổi đại số do bạn nêu phải được tự kiểm tra độc lập trước khi trả kết quả JSON.`
    });

    const provisionalData = normalizeEvaluation(provisional.data);
    const observedStudentWork = solutionText || text(provisional.data?.studentWorkTranscription, 100_000);
    if (!observedStudentWork) {
      return res.status(422).json({ success: false, error: 'Gemini chưa đọc được nội dung bài làm để GPT kiểm định độc lập.', code: 'STUDENT_WORK_TRANSCRIPTION_MISSING' });
    }

    const verified = await generateOpenAIJson({
      model: process.env.OPENAI_EVALUATION_VERIFY_MODEL || process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra',
      input: `Hãy tự giải bài toán và kiểm định độc lập báo cáo chấm của Gemini. Không mặc nhiên tin Gemini.

ĐỀ BÀI
Kỳ thi: ${text(body.examTitle, 300)}
Câu: ${text(body.problemId, 180)} - ${text(body.problemTitle, 500)}
Chuyên đề: ${text(body.topic, 200)}
${text(body.problemContent)}

BÀI LÀM THỰC TẾ CỦA HỌC SINH
${observedStudentWork}

${referenceBlock}

BÁO CÁO SƠ BỘ CỦA GEMINI
${JSON.stringify(provisionalData)}

YÊU CẦU KIỂM ĐỊNH
1. Đối chiếu từng nhận xét với đúng nội dung học sinh đã viết; tuyệt đối không gán cho học sinh bước họ không viết.
2. Tự tính lại mọi đẳng thức, giới hạn, điều kiện và trường hợp biên.
3. Kiểm tra verdict và điểm trên thang 5.0; điểm phải phù hợp mức độ hoàn thành thực tế.
4. Trả về một báo cáo CUỐI CÙNG hoàn chỉnh trong các trường nội dung. Nếu Gemini sai, hãy sửa trực tiếp và đặt corrected=true.
5. approved chỉ được true khi báo cáo cuối cùng có thể công bố; mọi cờ kiểm định phải phản ánh báo cáo cuối cùng sau hiệu chỉnh.
6. Khi không có nguồn tham khảo, referenceMatched=true chỉ khi đã tự giải và đối chiếu độc lập.
7. Dùng MathJax $...$ hoặc $$...$$; không dùng align, aligned, tag, itemize, enumerate hoặc textbf.`,
      schema: verifierSchema,
      systemInstruction: `Bạn là giám khảo phản biện VMO/IMO độc lập. Hãy kiểm tra bài làm gốc và báo cáo Gemini bằng ${outputLanguage}. Ưu tiên tính đúng đắn; không bịa nội dung học sinh. Trả về đúng structured JSON.`,
      timeoutMs: 120_000,
      maxOutputTokens: 8_000,
      reasoningEffort: 'low'
    });

    const hasTrustedReference = Boolean(reference?.content);
    const checks = verifierChecks(verified.data, hasTrustedReference);
    if (!verifierApproved(verified.data, hasTrustedReference)) {
      const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
      console.warn('[AI EVALUATE QUALITY_REJECTED]', {
        problemRef: text(body.problemKey || body.problemId, 180),
        hasTrustedReference,
        approvedFlag: verified.data?.approved === true,
        failedChecks,
        criticalIssueCount: Array.isArray(verified.data?.criticalIssues) ? verified.data.criticalIssues.length : 0
      });
      return res.status(422).json({
        success: false,
        error: 'Kết quả chấm chưa vượt qua kiểm định độc lập Gemini–GPT.',
        code: 'QUALITY_REJECTED',
        quality: {
          failedChecks,
          criticalIssues: Array.isArray(verified.data?.criticalIssues) ? verified.data.criticalIssues.slice(0, 10) : []
        }
      });
    }

    const finalData = normalizeEvaluation(verified.data);
    finalData.quality = {
      verified: true,
      corrected: verified.data.corrected === true,
      pipeline: 'gemini_openai',
      graderProvider: 'google',
      verifierProvider: 'openai',
      usedTrustedReference: hasTrustedReference,
      referenceOrigin: reference?.origin || '',
      criticalIssues: Array.isArray(verified.data.criticalIssues) ? verified.data.criticalIssues.slice(0, 10) : []
    };
    return res.status(200).json({
      success: true,
      source: 'gemini_openai_verified',
      model: `${provisional.model}+${verified.model}`,
      providers: { grader: 'google', verifier: 'openai' },
      data: finalData
    });
  } catch (error) {
    console.error('[AI EVALUATE]', error);
    const openAiMissing = error?.code === 'OPENAI_NOT_CONFIGURED';
    const geminiMissing = error?.code === 'AI_NOT_CONFIGURED';
    const openAiTimeout = error?.code === 'OPENAI_TIMEOUT';
    if (openAiTimeout) return res.status(504).json({ success: false, error: 'Gemini đã chấm sơ bộ nhưng GPT kiểm định quá thời gian. Vui lòng thử lại.', code: 'OPENAI_TIMEOUT' });
    if (openAiMissing || geminiMissing) return res.status(503).json({ success: false, error: error.message, code: error.code });
    if (String(error?.code || '').startsWith('OPENAI_')) {
      return res.status(502).json({ success: false, error: 'GPT chưa thể hoàn tất kiểm định kết quả chấm.', code: error.code });
    }
    return handleAiError(res, error);
  }
}
