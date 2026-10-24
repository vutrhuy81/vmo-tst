import { generateGuideDiagram } from '../lib/guide-diagram.js';
import { geometrySchema, geometryInstruction, selectGuideGeometry, inspectGeometryDiagram } from '../lib/geometry-diagram.js';
import { mathematicalAuditInstruction, auditEvidence } from '../lib/math-audit.js';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
import { getSession } from '../lib/session.js';
import { checkRateLimit, generateJson, parseBody, prepare, text } from '../lib/ai.js';
import { generateOpenAIJson } from '../lib/openai.js';

const stringArray = { type: 'array', items: { type: 'string' } };
const guideSchema = { type: 'object', properties: {
  requirements: stringArray, knowledge: { type: 'string' }, intuition: { type: 'string' },
  solution: { type: 'string' }, pitfalls: { type: 'string' }, finalAnswers: stringArray,
  equalityCases: stringArray, assumptionsUsed: stringArray, verificationChecks: stringArray
}, required: ['requirements', 'knowledge', 'intuition', 'solution', 'pitfalls', 'finalAnswers', 'equalityCases', 'assumptionsUsed', 'verificationChecks'] };

const verifierSchema = { type: 'object', properties: {
  approved: { type: 'boolean' }, score: { type: 'number' }, allPartsCorrect: { type: 'boolean' },
  rigorous: { type: 'boolean' }, noExtraAssumptions: { type: 'boolean' }, equalityCasesChecked: { type: 'boolean' },
  matchesVerifiedReference: { type: 'boolean' }, summary: { type: 'string' }, criticalIssues: stringArray,
  correctedApproved: { type: 'boolean' }, correctedScore: { type: 'number' }, correctedKnowledge: { type: 'string' },
  correctedAllPartsCorrect: { type: 'boolean' }, correctedRigorous: { type: 'boolean' },
  correctedNoExtraAssumptions: { type: 'boolean' }, correctedEqualityCasesChecked: { type: 'boolean' },
  correctedMatchesVerifiedReference: { type: 'boolean' },
  correctedIntuition: { type: 'string' }, correctedSolution: { type: 'string' }, correctedPitfalls: { type: 'string' },
  correctedFinalAnswers: stringArray, correctedEqualityCases: stringArray, correctedVerificationChecks: stringArray
}, required: ['approved', 'score', 'allPartsCorrect', 'rigorous', 'noExtraAssumptions', 'equalityCasesChecked', 'matchesVerifiedReference', 'summary', 'criticalIssues', 'correctedApproved', 'correctedScore', 'correctedKnowledge', 'correctedAllPartsCorrect', 'correctedRigorous', 'correctedNoExtraAssumptions', 'correctedEqualityCasesChecked', 'correctedMatchesVerifiedReference', 'correctedIntuition', 'correctedSolution', 'correctedPitfalls', 'correctedFinalAnswers', 'correctedEqualityCases', 'correctedVerificationChecks'], additionalProperties: false };

Object.assign(guideSchema.properties, { degeneracyChecks: stringArray });
guideSchema.required.push('degeneracyChecks');
Object.assign(verifierSchema.properties, { degeneraciesChecked: { type: 'boolean' }, degeneracyChecks: stringArray,
  correctedDegeneraciesChecked: { type: 'boolean' }, correctedDegeneracyChecks: stringArray });
verifierSchema.required.push('degeneraciesChecked', 'degeneracyChecks', 'correctedDegeneraciesChecked', 'correctedDegeneracyChecks');

guideSchema.properties.geometry = geometrySchema;
guideSchema.required.push('geometry');
Object.assign(verifierSchema.properties, { geometryApproved: { type: 'boolean' }, correctedGeometryApproved: { type: 'boolean' }, correctedGeometry: geometrySchema });
verifierSchema.required.push('geometryApproved', 'correctedGeometryApproved', 'correctedGeometry');

const genericPatterns = [/thực hiện các phép thế thích hợp/i, /xây dựng một ví dụ cụ thể/i, /thiết lập (?:một )?đánh giá phù hợp/i, /apply appropriate substitutions/i, /construct a suitable example/i, /derive an appropriate estimate/i];
const scoreOf = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(5, Number(value))) : 0;

function partCount(statement) {
  const matches = String(statement || '').match(/(?:^|\n)\s*(?:[a-d]|[1-4])[.)]\s+/gim) || [];
  return Math.max(1, new Set(matches.map(item => item.trim().toLowerCase())).size);
}

function substantive(solution, finalAnswers, requiredParts) {
  const body = text(solution, 100000);
  return body.length >= 700 && Array.isArray(finalAnswers) && finalAnswers.length >= requiredParts && !genericPatterns.some(pattern => pattern.test(body));
}

export function accepted(data, corrected = false) {
  if (corrected) return data.correctedDegeneraciesChecked === true && auditEvidence(data.correctedDegeneracyChecks) && data.correctedApproved === true && scoreOf(data.correctedScore) >= 4.5 && data.correctedAllPartsCorrect === true && data.correctedRigorous === true && data.correctedNoExtraAssumptions === true && data.correctedEqualityCasesChecked === true && data.correctedMatchesVerifiedReference === true;
  return data.degeneraciesChecked === true && auditEvidence(data.degeneracyChecks) && data.approved === true && scoreOf(data.score) >= 4.5 && data.allPartsCorrect === true && data.rigorous === true && data.noExtraAssumptions === true && data.equalityCasesChecked === true && data.matchesVerifiedReference === true;
}

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const session = await getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!checkRateLimit(`${session.username}:guide`, 6)) return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu quá nhanh' });
  const body = parseBody(req);
  if (!body) return res.status(400).json({ success: false, error: 'JSON không hợp lệ' });
  let problemContent = text(body.problemContent);
  if (!problemContent) return res.status(400).json({ success: false, error: 'Thiếu nội dung bài toán' });
  const startedAt = Date.now();
  const outputLanguage = body.lang === 'en' ? 'English' : 'Vietnamese';

  try {
    const reference = await retrieveVerifiedContext({ problemRef: text(body.contentKey || body.problemKey || body.problemId, 180),
      statement: problemContent, topic: text(body.topic, 200), session, purpose: 'guide' });
    if (reference?.blocked) return res.status(403).json({ success: false, error: 'Câu hỏi này chưa được phép sử dụng AI Hướng dẫn giải' });
    problemContent = text(reference.statement, 100000);
    const referenceBlock = reference.block;
    const common = `Exam: ${text(body.examTitle, 300)}\nProblem: ${text(body.problemId, 120)} - ${text(body.problemTitle, 500)}\nTopic: ${text(reference.topic || body.topic, 200)}\nSTATEMENT:\n${problemContent}\n\n${referenceBlock}`;
    const mathFormat = 'In every guide field (including corrected fields), enclose each mathematical expression in $...$ or $$...$$. Preserve TeX delimiters and escape backslashes correctly in JSON. Keep multiline equations inside one display block. Use Markdown for prose only, without HTML.';
    // Existing saved guides can receive a diagram without replacing their proof.
    if (body.mode === 'diagram') {
      const solution = text(body.solution, 100000);
      if (!solution) return res.status(400).json({ success: false, error: 'Thiếu lời giải để dựng hình' });
      const result = await generateGuideDiagram({ common, solution, language: outputLanguage,
        generate: generateJson, review: generateOpenAIJson, deadline: startedAt + 260000,
        log: (event, diagnostics) => console.warn(event, { problemKey: text(body.contentKey || body.problemId, 180), ...diagnostics }) });
      if (!result.geometry) return res.status(422).json({ success: false,
        error: outputLanguage === 'English' ? 'The diagram could not be validated after repair.' : 'Hình vẽ chưa đạt kiểm tra sau bước hiệu chỉnh.',
        code: result.code, details: result.details, reason: result.reason });
      return res.status(200).json({ success: true, data: result });
    }
    const solved = await generateJson({
      contents: `Produce a complete high-school Mathematical Olympiad solution in ${outputLanguage}.\n${common}\n${mathematicalAuditInstruction}\n${geometryInstruction} First enumerate every requested part. Give exact final results and every equality case. Check boundary cases, indices, signs and quantifiers. The reference is evidence, not permission to copy an error. ${mathFormat} Use Markdown and MathJax $...$ or $$...$$; do not use itemize, enumerate, align or textbf.`,
      schema: guideSchema,
      systemInstruction: `You are the primary VMO/IMO solver. Be explicit and rigorous. Never replace proof steps with generic advice. Write entirely in ${outputLanguage}.`,
      models: [process.env.GEMINI_SOLVER_MODEL || 'gemini-3.5-flash'], timeoutMs: 130_000, totalTimeoutMs: 130_000, temperature: 1
    });
    const diagramCheck = solved.data.geometry?.isGeometry === true ? inspectGeometryDiagram(solved.data.geometry) : { geometry: null, issues: [] };
    if (diagramCheck.geometry) solved.data.geometry = diagramCheck.geometry;
    const verified = await generateOpenAIJson({
      input: `${mathematicalAuditInstruction}\nIndependently solve and audit the candidate below. ${geometryInstruction} Independently check the candidate geometry against EVERY statement hypothesis and every depicted auxiliary construction in the selected proof, labels, coordinates and constraints. Set geometryApproved=true only if faithful and complete. Supply a correctedGeometry and correctedGeometryApproved for the corrected proof; never reuse a diagram incompatible with that proof. Diagram failure alone must not reject a valid proof. Score 0.0-5.0. Approval requires every requested part correct, a rigorous derivation, no unstated assumptions, and all extremal/equality cases proved. When no EXACT reference exists (including SIMILAR-only sources), matchesVerifiedReference means independent cross-check passed. Never require the new answer to equal the answer of a similar problem. If anything is weak, provide a fully corrected guide in the corrected* fields. Leave no generic placeholders. ${mathFormat}\n\n${common}\n\nDIAGRAM NUMERICAL VALIDATION:\n${JSON.stringify(diagramCheck.issues)}\nGEMINI CANDIDATE JSON:\n${JSON.stringify(solved.data)}`,
      schema: verifierSchema,
      systemInstruction: `You are an independent adversarial VMO/IMO jury. Recompute the problem instead of trusting Gemini. Correct the guide in ${outputLanguage} when needed. A score of 5.0 means publication-ready and fully rigorous. Return only the required structured result.`,
      timeoutMs: 140_000,
      maxOutputTokens: 12_000,
      reasoningEffort: 'medium'
    });
    const requiredParts = partCount(problemContent);
    let data; let score; let repaired = false;
    if (accepted(verified.data) && substantive(solved.data.solution, solved.data.finalAnswers, requiredParts)) {
      data = solved.data; score = scoreOf(verified.data.score);
    } else if (accepted(verified.data, true) && substantive(verified.data.correctedSolution, verified.data.correctedFinalAnswers, requiredParts)) {
      repaired = true; score = scoreOf(verified.data.correctedScore);
      data = { knowledge: verified.data.correctedKnowledge, intuition: verified.data.correctedIntuition, solution: verified.data.correctedSolution, pitfalls: verified.data.correctedPitfalls, finalAnswers: verified.data.correctedFinalAnswers, equalityCases: verified.data.correctedEqualityCases, verificationChecks: verified.data.correctedVerificationChecks, degeneracyChecks: verified.data.correctedDegeneracyChecks };
    } else {
      return res.status(422).json({ success: false, error: 'AI chưa tạo được lời giải đạt chuẩn kiểm định. Vui lòng thử lại; hệ thống không hiển thị lời giải chung chung hoặc chưa chắc chắn.', quality: { score: Math.max(scoreOf(verified.data.score), scoreOf(verified.data.correctedScore)), summary: text(verified.data.summary, 1000) } });
    }
    Object.assign(data, selectGuideGeometry(solved.data, verified.data, repaired, reference.topic || body.topic));
    data.quality = { degeneracyChecks: repaired ? verified.data.correctedDegeneracyChecks : verified.data.degeneracyChecks, verified: true, score: `${score.toFixed(1)}/5.0`, repaired, solverProvider: 'google', verifierProvider: 'openai', usedTrustedReference: Boolean(reference?.content), referenceOrigin: reference?.origin || '', retrieval: reference.retrieval, summary: text(verified.data.summary, 1000) };
    return res.status(200).json({
      success: true,
      source: 'gemini_openai_verified',
      model: `${solved.model}+${verified.model}`,
      providers: { solver: 'google', verifier: 'openai' },
      data
    });
  } catch (error) {
    console.error('[AI GUIDE]', error);
    const openAiMissing = error?.code === 'OPENAI_NOT_CONFIGURED';
    const geminiMissing = error?.code === 'AI_NOT_CONFIGURED';
    const openAiTimeout = error?.code === 'OPENAI_TIMEOUT' || error?.code === 'GEOMETRY_TIMEOUT';
    return res.status(openAiTimeout ? 504 : (openAiMissing || geminiMissing ? 503 : 502)).json({
      success: false,
      error: openAiTimeout
        ? (body.mode === 'diagram' ? 'Gia sư Toán AI chưa hoàn tất dựng và kiểm tra hình trong thời gian cho phép. Vui lòng thử lại.' : 'Gia sư Toán AI chưa hoàn tất kiểm định lời giải trong thời gian cho phép. Vui lòng thử lại.')
        : 'Gia sư Toán AI tạm thời không phản hồi. Vui lòng thử lại sau.',
      code: text(error?.code, 80) || 'AI_PIPELINE_ERROR'
    });
  }
}
