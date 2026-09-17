import { getDb } from './lib/db.js';
import { getSession } from './lib/session.js';
import { checkRateLimit, generateJson, handleAiError, parseBody, prepare, text } from './lib/ai.js';

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
  correctedIntuition: { type: 'string' }, correctedSolution: { type: 'string' }, correctedPitfalls: { type: 'string' },
  correctedFinalAnswers: stringArray, correctedEqualityCases: stringArray, correctedVerificationChecks: stringArray
}, required: ['approved', 'score', 'allPartsCorrect', 'rigorous', 'noExtraAssumptions', 'equalityCasesChecked', 'matchesVerifiedReference', 'summary', 'criticalIssues', 'correctedApproved', 'correctedScore', 'correctedKnowledge', 'correctedIntuition', 'correctedSolution', 'correctedPitfalls', 'correctedFinalAnswers', 'correctedEqualityCases', 'correctedVerificationChecks'] };

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

function accepted(data, corrected = false) {
  if (corrected) return data.correctedApproved === true && scoreOf(data.correctedScore) >= 4.5;
  return data.approved === true && scoreOf(data.score) >= 4.5 && data.allPartsCorrect === true && data.rigorous === true && data.noExtraAssumptions === true && data.equalityCasesChecked === true && data.matchesVerifiedReference === true;
}

async function trustedReference(contentKey) {
  if (!contentKey) return null;
  const db = await getDb();
  const problem = await db.collection('problems').findOne({ contentKey }, { projection: { status: 1, allowAiEvaluation: 1, referenceSolution: 1, referenceSolutionVerified: 1 } });
  if (!problem) return null;
  if (problem.status === 'draft' || problem.allowAiEvaluation === false) return { blocked: true };
  if (problem.referenceSolutionVerified === true && text(problem.referenceSolution, 100000)) return { content: text(problem.referenceSolution, 100000), origin: 'admin_verified_problem_reference' };
  const submission = await db.collection('submissions').findOne({ problemKey: contentKey, adminVerified: true, solutionContent: { $type: 'string', $ne: '' } }, { sort: { updatedAt: -1, createdAt: -1 }, projection: { solutionContent: 1 } });
  return submission ? { content: text(submission.solutionContent, 100000), origin: 'admin_verified_submission' } : null;
}

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!checkRateLimit(`${session.username}:guide`, 6)) return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu quá nhanh' });
  const body = parseBody(req);
  if (!body) return res.status(400).json({ success: false, error: 'JSON không hợp lệ' });
  const problemContent = text(body.problemContent);
  if (!problemContent) return res.status(400).json({ success: false, error: 'Thiếu nội dung bài toán' });
  const outputLanguage = body.lang === 'en' ? 'English' : 'Vietnamese';

  try {
    const reference = await trustedReference(text(body.contentKey, 180));
    if (reference?.blocked) return res.status(403).json({ success: false, error: 'Câu hỏi này chưa được phép sử dụng AI Hướng dẫn giải' });
    const referenceBlock = reference?.content ? `TRUSTED ADMIN-VERIFIED REFERENCE SOLUTION:\n${reference.content}` : 'No admin-verified reference is available. Solve and verify independently.';
    const common = `Exam: ${text(body.examTitle, 300)}\nProblem: ${text(body.problemId, 120)} - ${text(body.problemTitle, 500)}\nTopic: ${text(body.topic, 200)}\nSTATEMENT:\n${problemContent}\n\n${referenceBlock}`;
    const solved = await generateJson({
      contents: `Produce a complete high-school Mathematical Olympiad solution in ${outputLanguage}.\n${common}\nFirst enumerate every requested part. Give exact final results and every equality case. Check boundary cases, indices, signs and quantifiers. The reference is evidence, not permission to copy an error. Use Markdown and MathJax $...$ or $$...$$; do not use itemize, enumerate, align or textbf.`,
      schema: guideSchema,
      systemInstruction: `You are the primary VMO/IMO solver. Be explicit and rigorous. Never replace proof steps with generic advice. Write entirely in ${outputLanguage}.`,
      // Flash-Lite tạo bản nháp nhanh; tầng giám khảo Flash bên dưới mới là
      // nguồn quyết định cuối cùng và có quyền viết lại toàn bộ lời giải.
      models: ['gemini-2.5-flash-lite'], timeoutMs: 20_000, temperature: 0.08
    });
    const verified = await generateJson({
      contents: `Independently solve and audit the candidate below. Score 0.0-5.0. Approval requires every requested part correct, a rigorous derivation, no unstated assumptions, and all extremal/equality cases proved. When no trusted reference exists, matchesVerifiedReference means independent cross-check passed. If anything is weak, provide a fully corrected guide in corrected* fields; this is the single repair pass. Leave no generic placeholders.\n\n${common}\n\nCANDIDATE JSON:\n${JSON.stringify(solved.data)}`,
      schema: verifierSchema,
      systemInstruction: `You are an adversarial VMO jury verifier. Recompute the mathematics instead of trusting the candidate. Correct it in ${outputLanguage} when needed. A score of 5.0 means publication-ready and fully rigorous.`,
      models: ['gemini-2.5-flash'], timeoutMs: 28_000, temperature: 0.02
    });
    const requiredParts = partCount(problemContent);
    let data; let score; let repaired = false;
    if (accepted(verified.data) && substantive(solved.data.solution, solved.data.finalAnswers, requiredParts)) {
      data = solved.data; score = scoreOf(verified.data.score);
    } else if (accepted(verified.data, true) && substantive(verified.data.correctedSolution, verified.data.correctedFinalAnswers, requiredParts)) {
      repaired = true; score = scoreOf(verified.data.correctedScore);
      data = { knowledge: verified.data.correctedKnowledge, intuition: verified.data.correctedIntuition, solution: verified.data.correctedSolution, pitfalls: verified.data.correctedPitfalls, finalAnswers: verified.data.correctedFinalAnswers, equalityCases: verified.data.correctedEqualityCases, verificationChecks: verified.data.correctedVerificationChecks };
    } else {
      return res.status(422).json({ success: false, error: 'AI chưa tạo được lời giải đạt chuẩn kiểm định. Vui lòng thử lại; hệ thống không hiển thị lời giải chung chung hoặc chưa chắc chắn.', quality: { score: Math.max(scoreOf(verified.data.score), scoreOf(verified.data.correctedScore)), summary: text(verified.data.summary, 1000) } });
    }
    data.quality = { verified: true, score: `${score.toFixed(1)}/5.0`, repaired, usedTrustedReference: Boolean(reference?.content), referenceOrigin: reference?.origin || '', summary: text(verified.data.summary, 1000) };
    return res.status(200).json({ success: true, source: 'gemini_verified', model: `${solved.model}+${verified.model}`, data });
  } catch (error) { return handleAiError(res, error); }
}
