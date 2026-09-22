import { ObjectId } from 'mongodb';
import { getDb } from '../lib/db.js';
import { getSession } from '../lib/session.js';
import { deleteAiGuideRecord, learningScope, recordActivity, summarizeLearning } from '../lib/learning.js';
import { buildSubmissionVerificationUpdate } from '../lib/submission-verification.js';

const ALLOWED_RESOURCES = new Set(['documents', 'exams', 'exam_catalog', 'exam_image', 'content_sets', 'problems', 'content_revisions', 'submissions', 'submission_image', 'events', 'activity_feed', 'learning_overview', 'exam_trend_reports']);
const CONTENT_TYPES = new Set(['specialty_chapter', 'mock_exam', 'tst_exam', 'regional_exam']);
const SOURCE_TYPES = new Set(['specialty_example', 'mock_exam_question', 'tst_question', 'regional_question']);
const TST_REGIONS = new Set(['BAC', 'TRUNG', 'NAM']);
const EXAM_TREND_TOPICS = [
  'Dãy số và Giới hạn dãy số', 'Phương trình hàm', 'Số học và dãy số',
  'Hình học phẳng', 'Đa thức', 'Tổ hợp'
];
const MAX_SOLUTION_IMAGE_CHARS = 3_000_000;

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body); } catch { return null; }
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanSolutionImage(value) {
  if (!value) return '';
  const image = String(value).trim();
  if (image.length > MAX_SOLUTION_IMAGE_CHARS) return null;
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image)
    ? image
    : null;
}

function cleanReferenceLinks(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(item => {
    const label = cleanText(Array.isArray(item) ? item[0] : item?.label, 300);
    const url = cleanText(Array.isArray(item) ? item[1] : item?.url, 2000);
    if (!label || !/^https?:\/\//i.test(url)) return null;
    return { label, url };
  }).filter(Boolean);
}

function cleanAiGuide(value) {
  if (!value || typeof value !== 'object') return null;
  const quality = value.quality && typeof value.quality === 'object'
    ? {
        verified: value.quality.verified === true,
        score: cleanText(value.quality.score, 20),
        verifier: cleanText(value.quality.verifier, 120)
      }
    : null;
  return {
    branch: cleanText(value.branch, 300),
    knowledge: cleanText(value.knowledge, 50000),
    intuition: cleanText(value.intuition, 50000),
    solution: cleanText(value.solution, 100000),
    pitfalls: cleanText(value.pitfalls, 50000),
    quality
  };
}

function cleanStringList(value, limit = 20, max = 2500) {
  return (Array.isArray(value) ? value : []).slice(0, limit)
    .map(item => cleanText(item, max)).filter(Boolean);
}

function cleanExamTrendReport(payload) {
  const settings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const evidence = payload?.evidence && typeof payload.evidence === 'object' ? payload.evidence : {};
  const report = payload?.report && typeof payload.report === 'object' ? payload.report : {};
  const quality = payload?.quality && typeof payload.quality === 'object' ? payload.quality : {};
  const topicTrends = (Array.isArray(report.topicTrends) ? report.topicTrends : []).slice(0, 6).map(item => ({
    topic: cleanText(item?.topic, 120),
    questionCount: cleanNumber(item?.questionCount, 0, 0, 10000),
    prevalencePercent: cleanNumber(item?.prevalencePercent, 0, 0, 100),
    trendLevel: cleanText(item?.trendLevel, 80),
    observations: cleanText(item?.observations, 4000),
    frequentMethods: (Array.isArray(item?.frequentMethods) ? item.frequentMethods : []).slice(0, 12).map(method => ({
      name: cleanText(method?.name, 240), frequency: cleanNumber(method?.frequency, 0, 0, 10000),
      evidenceIds: cleanStringList(method?.evidenceIds, 240, 180), note: cleanText(method?.note, 1600)
    })).filter(method => method.name)
  })).filter(item => item.topic);
  if (topicTrends.length !== 6 || topicTrends.some((item, index) => item.topic !== EXAM_TREND_TOPICS[index])) return null;
  const qualityStatus = ['approved', 'rejected', 'unavailable'].includes(quality.status) ? quality.status : 'unavailable';
  return {
    settings: {
      mode: settings.mode === 'year' ? 'year' : settings.mode === 'target' ? 'target' : '',
      year: cleanText(settings.year, 20), targetType: settings.targetType === 'vmo' ? 'vmo' : 'tst',
      lookback: cleanNumber(settings.lookback, 0, 0, 15),
      anchor: cleanKey(settings.anchor, 100), province: cleanText(settings.province, 120)
    },
    evidence: {
      years: cleanStringList(evidence.years, 15, 20),
      examCount: cleanNumber(evidence.examCount, 0, 0, 1000),
      questionCount: cleanNumber(evidence.questionCount, 0, 0, 10000),
      otherQuestionCount: cleanNumber(evidence.otherQuestionCount, 0, 0, 10000),
      unitCount: cleanNumber(evidence.unitCount, 0, 0, 1000),
      historyCurrentProvince: cleanText(evidence.historyCurrentProvince, 120),
      historyMembers: cleanStringList(evidence.historyMembers, 5, 120),
      mergedProvinceHistory: evidence.mergedProvinceHistory === true,
      sources: (Array.isArray(evidence.sources) ? evidence.sources : []).slice(0, 80).map(item => ({
        year: cleanText(item?.year, 20), unit: cleanText(item?.unit, 120),
        historicalUnit: cleanText(item?.historicalUnit, 120), title: cleanText(item?.title, 300),
        source: cleanText(item?.source, 1000), questionCount: cleanNumber(item?.questionCount, 0, 0, 100)
      })),
      samples: (Array.isArray(evidence.samples) ? evidence.samples : []).slice(0, 240).map(item => ({
        sourceId: cleanText(item?.sourceId, 180), year: cleanText(item?.year, 20),
        unit: cleanText(item?.unit, 120), historicalUnit: cleanText(item?.historicalUnit, 120),
        title: cleanText(item?.title, 300),
        questionNumber: cleanNumber(item?.questionNumber, 0, 0, 100), rawTopic: cleanText(item?.rawTopic, 120),
        criterion: cleanText(item?.criterion, 120), excerpt: cleanText(item?.excerpt, 600)
      })).filter(item => item.sourceId)
    },
    report: {
      title: cleanText(report.title, 300), executiveSummary: cleanText(report.executiveSummary, 6000), topicTrends,
      recurringPatterns: (Array.isArray(report.recurringPatterns) ? report.recurringPatterns : []).slice(0, 20).map(item => ({
        pattern: cleanText(item?.pattern, 300), frequency: cleanNumber(item?.frequency, 0, 0, 10000),
        evidenceIds: cleanStringList(item?.evidenceIds, 240, 180), analysis: cleanText(item?.analysis, 2400)
      })).filter(item => item.pattern),
      unitInsights: (Array.isArray(report.unitInsights) ? report.unitInsights : []).slice(0, 50).map(item => ({
        unit: cleanText(item?.unit, 160), dominantTopics: cleanStringList(item?.dominantTopics, 6, 160),
        note: cleanText(item?.note, 2000)
      })).filter(item => item.unit),
      limitations: cleanStringList(report.limitations, 15, 1200), conclusion: cleanText(report.conclusion, 5000)
    },
    quality: {
      status: qualityStatus,
      verified: qualityStatus === 'approved' && quality.verified === true,
      score: quality.score !== null && quality.score !== '' && Number.isFinite(Number(quality.score))
        ? cleanNumber(quality.score, 0, 0, 5) : null,
      summary: cleanText(quality.summary, 4000), criticalIssues: cleanStringList(quality.criticalIssues, 20, 2500),
      corrections: cleanStringList(quality.corrections, 20, 2500),
      topicChecks: (Array.isArray(quality.topicChecks) ? quality.topicChecks : []).slice(0, 6).map(item => ({
        topic: cleanText(item?.topic, 120), valid: item?.valid === true, reason: cleanText(item?.reason, 2000)
      })), verifierModel: cleanText(quality.verifierModel, 100), pipeline: 'Gemini → GPT'
    },
    model: cleanText(payload?.model, 100), generatedAt: cleanText(payload?.generatedAt, 50)
  };
}

function objectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function cleanKey(value, max = 180) {
  return cleanText(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugKey(value, max = 120) {
  return cleanText(value, max)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, match => match === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanNumber(value, fallback = 0, min = 0, max = 10000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function problemSnapshot(problem) {
  if (!problem) return null;
  return {
    contentKey: problem.contentKey,
    title: problem.title,
    setTitle: problem.setTitle,
    sourceType: problem.sourceType,
    sourceGroup: problem.sourceGroup,
    frontendAnchor: problem.frontendAnchor,
    questionNumber: problem.questionNumber,
    chapterNumber: problem.chapterNumber,
    day: problem.day,
    maxScore: problem.maxScore,
    topic: problem.topic,
    content: problem.content,
    version: problem.version || 1
  };
}

function requireAdmin(session, res) {
  if (session.role === 'admin') return true;
  res.status(403).json({ success: false, error: 'Chỉ quản trị viên được thực hiện thao tác này' });
  return false;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });

  try {
    const db = await getDb();

    if (req.method === 'GET') {
      const resource = cleanText(req.query?.resource, 30);
      if (!ALLOWED_RESOURCES.has(resource)) {
        return res.status(400).json({ success: false, error: 'Loại dữ liệu không hợp lệ' });
      }

      if (resource === 'activity_feed' || resource === 'learning_overview') {
        const scope = learningScope(session, cleanText(req.query?.username, 64));
        if (!scope) return res.status(403).json({ success: false, error: 'Bạn chỉ được xem dữ liệu của tài khoản mình' });
        let userFilter = { ...scope };
        if (session.role === 'admin' && scope.username) {
          const account = await db.collection('users').findOne({ username: scope.username }, { projection: { _id: 1 } });
          if (!account) return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
          userFilter = { userId: String(account._id) };
        }
        if (resource === 'activity_feed') {
          const page = cleanNumber(req.query?.page, 1, 1, 100000);
          const limit = cleanNumber(req.query?.limit, 20, 5, 50);
          const events = db.collection('activity_events');
          const total = await events.countDocuments(userFilter);
          const pages = Math.max(1, Math.ceil(total / limit));
          const safePage = Math.min(page, pages);
          const items = await events.find(userFilter, { projection: {
            userId: 1, username: 1, action: 1, details: 1, createdAt: 1
          } }).sort({ createdAt: -1, _id: -1 }).skip((safePage - 1) * limit).limit(limit).toArray();
          return res.status(200).json({ success: true, items, pagination: { page: safePage, limit, total, pages } });
        }
        const [users, rows] = await Promise.all([
          db.collection('users').find(session.role === 'admin' ? {} : { _id: objectId(String(session.sub)) }, {
            projection: { username: 1, fullName: 1, role: 1 }
          }).sort({ username: 1 }).toArray(),
          db.collection('submissions').find({ ...userFilter, $or: [
            { submissionKind: 'ai_guide', solutionContent: { $type: 'string', $ne: '' } },
            { submissionKind: { $ne: 'ai_guide' }, evaluation: { $type: 'object' } }
          ] }, { projection: {
            userId: 1, username: 1, authorName: 1, problemId: 1, problemKey: 1,
            problemTitle: 1, 'problemSnapshot.title': 1, 'problemSnapshot.setTitle': 1,
            'problemSnapshot.sourceGroup': 1, 'problemSnapshot.frontendAnchor': 1,
            setTitle: 1, sourceGroup: 1, submissionKind: 1,
            'evaluation.estimatedScore': 1, score: 1, createdAt: 1, updatedAt: 1
          } }).toArray()
        ]);
        const selectedUsers = userFilter.userId ? users.filter(user => String(user._id) === userFilter.userId) : users;
        const overview = summarizeLearning(rows, selectedUsers, scope.username || '');
        return res.status(200).json({ success: true, overview, accounts: users.map(user => ({
          username: user.username, fullName: user.fullName || user.username, role: user.role || 'student'
        })) });
      }

      if (resource === 'submission_image') {
        const submissionId = objectId(cleanText(req.query?.submissionId, 80));
        if (!submissionId) {
          return res.status(400).json({ success: false, error: 'Mã bài nộp không hợp lệ' });
        }

        const submission = await db.collection('submissions').findOne(
          { _id: submissionId },
          { projection: { userId: 1, hasImage: 1 } }
        );
        if (!submission) return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp' });
        if (session.role !== 'admin' && String(submission.userId) !== String(session.sub)) {
          return res.status(403).json({ success: false, error: 'Bạn không có quyền xem ảnh này' });
        }

        const stored = await db.collection('submission_images').findOne(
          { submissionId },
          { projection: { _id: 0, image: 1, mimeType: 1, createdAt: 1 } }
        );
        return res.status(200).json({ success: true, items: stored ? [stored] : [] });
      }

      if (resource === 'exam_image') {
        const examId = objectId(cleanText(req.query?.examId, 80));
        const pageNumber = Math.max(1, Number(req.query?.pageNumber) || 1);
        if (!examId) return res.status(400).json({ success: false, error: 'Mã đề thi không hợp lệ' });
        const exam = await db.collection('exams').findOne({ _id: examId }, { projection: { status: 1 } });
        if (!exam) return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi' });
        if (session.role !== 'admin' && exam.status !== 'published') {
          return res.status(403).json({ success: false, error: 'Đề thi chưa được công khai' });
        }
        const stored = await db.collection('exam_images').findOne(
          { examId, pageNumber },
          { projection: { _id: 0, image: 1, mimeType: 1, pageNumber: 1, createdAt: 1 } }
        );
        return res.status(200).json({ success: true, items: stored ? [stored] : [] });
      }

      if (resource === 'content_revisions') {
        if (!requireAdmin(session, res)) return;
        const problemId = objectId(cleanText(req.query?.problemId, 80));
        if (!problemId) return res.status(400).json({ success: false, error: 'Mã câu hỏi không hợp lệ' });
        const items = await db.collection('content_revisions')
          .find({ problemId })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();
        return res.status(200).json({ success: true, items });
      }

      if (resource === 'exam_trend_reports') {
        if (!requireAdmin(session, res)) return;
        // Mẫu bằng chứng chi tiết vẫn được lưu để kiểm toán, nhưng không tải lại
        // trong danh sách nhằm tránh làm nặng Database Hub khi đã có nhiều báo cáo.
        const items = await db.collection('exam_trend_reports').find({}, { projection: { 'evidence.samples': 0 } })
          .sort({ createdAt: -1, _id: -1 }).limit(100).toArray();
        return res.status(200).json({ success: true, items });
      }

      if (resource === 'exam_catalog') {
        const examFilter = { category: cleanText(req.query?.category, 80) || 'tst-national' };
        if (session.role !== 'admin') examFilter.status = 'published';
        const exams = await db.collection('exams').find(examFilter).sort({ provinceOrder: 1, dayNumber: 1, createdAt: 1 }).limit(200).toArray();
        const examIds = exams.map(item => String(item._id));
        const problemFilter = { examId: { $in: examIds } };
        if (session.role !== 'admin') problemFilter.status = 'published';
        const problems = examIds.length
          ? await db.collection('problems').find(problemFilter).sort({ orderNumber: 1, questionNumber: 1 }).limit(1000).toArray()
          : [];
        const grouped = new Map();
        problems.forEach(problem => {
          const key = String(problem.examId || '');
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key).push(problem);
        });
        return res.status(200).json({
          success: true,
          items: exams.map(exam => ({ ...exam, problems: grouped.get(String(exam._id)) || [] }))
        });
      }

      const filter = {};
      let projection;
      if (resource === 'content_sets') {
        if (req.query?.group) filter.group = cleanText(req.query.group, 80);
        if (req.query?.key) filter.key = cleanKey(req.query.key);
        if (session.role !== 'admin') filter.status = 'published';
      }
      if (resource === 'problems') {
        if (req.query?.examId) filter.examId = cleanText(req.query.examId, 120);
        if (req.query?.setId) {
          const setId = objectId(cleanText(req.query.setId, 80));
          if (!setId) return res.status(400).json({ success: false, error: 'Mã nhóm nội dung không hợp lệ' });
          filter.setId = setId;
        }
        if (req.query?.sourceGroup) filter.sourceGroup = cleanText(req.query.sourceGroup, 80);
        if (req.query?.contentKey) filter.contentKey = cleanKey(req.query.contentKey);
        if (req.query?.view === 'runtime') {
          projection = {
            contentKey: 1,
            content: 1,
            referenceLinks: 1,
            title: 1,
            topic: 1,
            setTitle: 1,
            version: 1
          };
        }
        if (req.query?.catalogRules === '1' && session.role !== 'admin') {
          const [sets, problems] = await Promise.all([
            db.collection('content_sets').find({}, { projection: { status: 1 } }).toArray(),
            db.collection('problems').find({}, { projection: {
              contentKey: 1, setId: 1, setTitle: 1, title: 1, shortLabel: 1,
              topic: 1, maxScore: 1, order: 1, status: 1,
              allowSubmission: 1, allowAiEvaluation: 1
            } }).limit(1000).toArray()
          ]);
          const setStatus = new Map(sets.map(item => [String(item._id), item.status]));
          const items = problems.map(item => ({
            contentKey: item.contentKey,
            setTitle: item.setTitle,
            title: item.title,
            shortLabel: item.shortLabel,
            topic: item.topic,
            maxScore: item.maxScore,
            order: item.order,
            published: item.status === 'published' && setStatus.get(String(item.setId)) === 'published',
            allowSubmission: item.allowSubmission !== false,
            allowAiEvaluation: item.allowAiEvaluation !== false
          }));
          return res.status(200).json({ success: true, items });
        }
        if (session.role !== 'admin') {
          filter.status = 'published';
          const publishedSets = await db.collection('content_sets')
            .find({ status: 'published' }, { projection: { _id: 1 } })
            .toArray();
          const publishedSetIds = publishedSets.map(item => item._id);
          if (filter.setId) {
            if (!publishedSetIds.some(id => String(id) === String(filter.setId))) {
              return res.status(200).json({ success: true, items: [] });
            }
          } else {
            filter.setId = { $in: publishedSetIds };
          }
        }
      }
      if (resource === 'exams' && req.query?.category && req.query.category !== 'all') {
        filter.category = cleanText(req.query.category, 80);
      }
      if (resource === 'documents' && req.query?.topic && req.query.topic !== 'all') {
        filter.topic = cleanText(req.query.topic, 120);
      }
      if (resource === 'submissions') {
        if (session.role !== 'admin' || req.query?.own === '1') filter.userId = String(session.sub);
        if (req.query?.submissionKind) {
          filter.submissionKind = cleanText(req.query.submissionKind, 40);
        }
        if (req.query?.problemId) {
          const requestedProblem = cleanText(req.query.problemId, 180);
          filter.$or = [
            { problemId: requestedProblem },
            { problemKey: requestedProblem },
            { legacyProblemId: requestedProblem }
          ];
        }
        if (req.query?.problemKey) filter.problemKey = cleanKey(req.query.problemKey);
        if (req.query?.setId) filter.setId = cleanText(req.query.setId, 80);

        if (req.query?.paged === '1') {
          if (req.query?.sourceGroup) filter.sourceGroup = cleanText(req.query.sourceGroup, 80);
          if (session.role === 'admin' && req.query?.username) {
            const username = cleanText(req.query.username, 80);
            filter.username = { $regex: `^${escapeRegex(username)}$`, $options: 'i' };
          }
          if (req.query?.evaluation === 'yes') filter.evaluation = { $type: 'object' };
          if (req.query?.evaluation === 'no') filter.evaluation = null;
          if (req.query?.adminVerified === 'yes') filter.adminVerified = true;
          if (req.query?.adminVerified === 'no') filter.adminVerified = { $ne: true };

          const from = req.query?.dateFrom ? new Date(cleanText(req.query.dateFrom, 40)) : null;
          const to = req.query?.dateTo ? new Date(cleanText(req.query.dateTo, 40)) : null;
          if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
            filter.createdAt = {};
            if (from && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
            if (to && !Number.isNaN(to.getTime())) {
              to.setUTCHours(23, 59, 59, 999);
              filter.createdAt.$lte = to;
            }
          }

          const keyword = cleanText(req.query?.q, 120);
          if (keyword) {
            const search = { $regex: escapeRegex(keyword), $options: 'i' };
            filter.$and = [
              ...(filter.$or ? [{ $or: filter.$or }] : []),
              { $or: [
                { username: search },
                { authorName: search },
                { problemTitle: search },
                { 'problemSnapshot.title': search },
                { 'problemSnapshot.setTitle': search },
                { solutionContent: search }
              ] }
            ];
            delete filter.$or;
          }
        }
      }

      const sort = resource === 'events'
        ? { startDate: 1 }
        : resource === 'content_sets' || resource === 'problems'
          ? { order: 1, orderNumber: 1 }
          : { createdAt: -1 };
      if (resource === 'submissions' && req.query?.paged === '1') {
        const page = cleanNumber(req.query?.page, 1, 1, 100000);
        const limit = cleanNumber(req.query?.limit, 10, 5, 50);
        const total = await db.collection(resource).countDocuments(filter);
        const pages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, pages);
        const items = await db.collection(resource)
          .find(filter)
          .sort(sort)
          .skip((safePage - 1) * limit)
          .limit(limit)
          .toArray();
        return res.status(200).json({
          success: true,
          items,
          pagination: { page: safePage, limit, total, pages }
        });
      }

      const items = await db.collection(resource)
        .find(filter, projection ? { projection } : undefined)
        .sort(sort)
        .limit(req.query?.latest === '1' ? 1 : 500)
        .toArray();
      return res.status(200).json({ success: true, items });
    }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    const body = parseBody(req);
    if (!body) return res.status(400).json({ success: false, error: 'JSON không hợp lệ' });
    const { action, payload = {} } = body;
    const now = new Date();

    if (action === 'submit_solution') {
      const submittedProblemId = cleanText(payload.problemId, 180);
      const submittedProblemKey = cleanKey(payload.problemKey || submittedProblemId);
      const solutionContent = cleanText(payload.solutionContent, 50000);
      const solutionImage = cleanSolutionImage(payload.solutionImage);
      if (solutionImage === null) {
        return res.status(413).json({ success: false, error: 'Ảnh không hợp lệ hoặc vượt quá giới hạn 3 MB' });
      }
      if (!submittedProblemId || (!solutionContent && !solutionImage)) {
        return res.status(400).json({ success: false, error: 'Thiếu mã bài toán hoặc nội dung bài giải/ảnh bài làm' });
      }
      const submittedObjectId = objectId(submittedProblemId);
      const problemFilters = [];
      if (submittedObjectId) problemFilters.push({ _id: submittedObjectId });
      if (submittedProblemKey) problemFilters.push({ contentKey: submittedProblemKey });
      problemFilters.push({ id: submittedProblemId });
      const registeredProblem = await db.collection('problems').findOne({ $or: problemFilters });
      if (registeredProblem && session.role !== 'admin') {
        const registeredSet = registeredProblem.setId
          ? await db.collection('content_sets').findOne({ _id: registeredProblem.setId }, { projection: { status: 1 } })
          : null;
        if (registeredProblem.status !== 'published' || registeredSet?.status !== 'published') {
          return res.status(403).json({ success: false, error: 'Câu hỏi hiện chưa được công khai' });
        }
        if (registeredProblem.allowSubmission === false) {
          return res.status(403).json({ success: false, error: 'Câu hỏi hiện tạm khóa chức năng nộp bài' });
        }
      }
      const registeredProblemId = registeredProblem ? String(registeredProblem._id) : submittedProblemId;
      const registeredProblemKey = registeredProblem?.contentKey || submittedProblemKey || submittedProblemId;
      const evaluation = payload.evaluation && typeof payload.evaluation === 'object' ? payload.evaluation : null;
      const submissionKind = payload.submissionKind === 'ai_guide' ? 'ai_guide' : 'student_solution';
      const aiGuide = submissionKind === 'ai_guide' ? cleanAiGuide(payload.aiGuide) : null;
      const doc = {
        problemId: registeredProblemId,
        problemKey: registeredProblemKey,
        legacyProblemId: submittedProblemId !== registeredProblemId ? submittedProblemId : undefined,
        setId: registeredProblem?.setId ? String(registeredProblem.setId) : cleanText(payload.setId, 80),
        sourceType: registeredProblem?.sourceType || cleanText(payload.sourceType, 80),
        sourceGroup: registeredProblem?.sourceGroup || cleanText(payload.sourceGroup, 80),
        problemTitle: registeredProblem?.title || cleanText(payload.problemTitle, 500),
        problemSnapshot: problemSnapshot(registeredProblem) || {
          contentKey: registeredProblemKey,
          title: cleanText(payload.problemTitle, 500),
          setTitle: cleanText(payload.setTitle, 500),
          sourceType: cleanText(payload.sourceType, 80),
          sourceGroup: cleanText(payload.sourceGroup, 80),
          topic: cleanText(payload.topic, 120),
          content: cleanText(payload.problemContent, 50000),
          version: 1
        },
        userId: String(session.sub),
        username: session.username,
        authorName: session.fullName || session.username,
        solutionContent,
        hasImage: Boolean(solutionImage),
        status: evaluation?.verdict || 'submitted',
        verdictLabel: cleanText(evaluation?.verdictLabel, 500),
        score: evaluation?.estimatedScore ?? null,
        evaluation,
        submissionKind,
        aiGuide,
        createdAt: now,
        updatedAt: now
      };
      if (submissionKind === 'ai_guide') {
        const aiGuideDoc = { ...doc };
        delete aiGuideDoc.createdAt;
        const savedGuide = await db.collection('submissions').findOneAndUpdate(
          {
            userId: String(session.sub),
            problemKey: registeredProblemKey,
            submissionKind: 'ai_guide'
          },
          {
            $set: aiGuideDoc,
            $setOnInsert: { createdAt: now }
          },
          { upsert: true, returnDocument: 'after' }
        );
        if (!savedGuide?._id) return res.status(500).json({ success: false, error: 'Không thể lưu AI hướng dẫn giải' });
        await recordActivity(db, session, 'guide.saved', {
          submissionId: savedGuide._id, problemKey: registeredProblemKey,
          problemTitle: doc.problemTitle, setTitle: doc.problemSnapshot?.setTitle,
          sourceGroup: doc.sourceGroup
        });
        return res.status(200).json({ success: true, item: savedGuide });
      }
      const result = await db.collection('submissions').insertOne(doc);
      if (solutionImage) {
        const mimeType = solutionImage.slice(5, solutionImage.indexOf(';'));
        await db.collection('submission_images').insertOne({
          submissionId: result.insertedId,
          userId: String(session.sub),
          image: solutionImage,
          mimeType,
          createdAt: now
        });
      }
      const activityDetails = {
        submissionId: result.insertedId, problemKey: registeredProblemKey,
        problemTitle: doc.problemTitle, setTitle: doc.problemSnapshot?.setTitle,
        sourceGroup: doc.sourceGroup, score: evaluation?.estimatedScore
      };
      await recordActivity(db, session, 'solution.saved', activityDetails);
      if (evaluation) await recordActivity(db, session, 'evaluation.saved', activityDetails);
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (!requireAdmin(session, res)) return;

    if (action === 'save_exam_trend_report') {
      const cleaned = cleanExamTrendReport(payload);
      if (!cleaned || !cleaned.settings.mode || !cleaned.settings.year || !cleaned.report.title) {
        return res.status(400).json({ success: false, error: 'Báo cáo xu hướng không hợp lệ hoặc thiếu 6 chuyên đề' });
      }
      const doc = { ...cleaned, createdBy: session.username, createdAt: now, updatedAt: now };
      const result = await db.collection('exam_trend_reports').insertOne(doc);
      await recordActivity(db, session, 'trend_report.saved', {
        itemTitle: doc.report.title, reportId: result.insertedId, year: doc.settings.year,
        verifierStatus: doc.quality.status
      });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'delete_ai_guide') {
      const id = objectId(cleanText(payload.id, 80));
      if (!id) return res.status(400).json({ success: false, error: 'ID lời giải AI không hợp lệ' });
      const deleted = await deleteAiGuideRecord(db, session, id);
      if (!deleted) return res.status(404).json({ success: false, error: 'Không tìm thấy AI Hướng dẫn giải đã lưu' });
      return res.status(200).json({ success: true, deletedId: String(id) });
    }

    if (action === 'upsert_content_catalog') {
      const sets = Array.isArray(payload.sets) ? payload.sets.slice(0, 200) : [];
      const problems = Array.isArray(payload.problems) ? payload.problems.slice(0, 1000) : [];
      if (!sets.length || !problems.length) {
        return res.status(400).json({ success: false, error: 'Catalog phải có nhóm nội dung và câu hỏi' });
      }
      if (problems.some(item => /(?:<|&lt;)mjx-[a-z-]+\b|class=["'][^"']*\bMathJax\b/i.test(String(item?.content || '')))) {
        return res.status(400).json({ success: false, error: 'Catalog chứa HTML do MathJax tạo ra; vui lòng tải lại trang trước khi đồng bộ' });
      }

      const setIds = new Map();
      for (const raw of sets) {
        const key = cleanKey(raw.key);
        const contentType = cleanText(raw.contentType, 80);
        if (!key || !CONTENT_TYPES.has(contentType)) continue;
        const doc = {
          key,
          contentType,
          title: cleanText(raw.title, 500),
          group: cleanText(raw.group, 80),
          year: cleanText(raw.year, 40),
          province: cleanText(raw.province, 120),
          region: cleanText(raw.region, 80),
          order: cleanNumber(raw.order),
          status: raw.status === 'draft' ? 'draft' : 'published',
          updatedBy: session.username,
          updatedAt: now
        };
        const result = await db.collection('content_sets').findOneAndUpdate(
          { key },
          { $set: doc, $setOnInsert: { createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        );
        if (result?._id) setIds.set(key, result._id);
      }

      let problemCount = 0;
      for (const raw of problems) {
        const contentKey = cleanKey(raw.contentKey);
        const setKey = cleanKey(raw.setKey);
        const sourceType = cleanText(raw.sourceType, 80);
        const setId = setIds.get(setKey);
        if (!contentKey || !setId || !SOURCE_TYPES.has(sourceType)) continue;
        const doc = {
          contentKey,
          setId,
          setKey,
          setTitle: cleanText(raw.setTitle, 500),
          sourceType,
          sourceGroup: cleanText(raw.sourceGroup, 80),
          title: cleanText(raw.title, 500),
          shortLabel: cleanText(raw.shortLabel, 120),
          chapterNumber: cleanNumber(raw.chapterNumber),
          questionNumber: cleanNumber(raw.questionNumber),
          day: cleanText(raw.day, 80),
          order: cleanNumber(raw.order),
          maxScore: cleanNumber(raw.maxScore, 5, 0, 20),
          topic: cleanText(raw.topic, 120),
          difficulty: cleanText(raw.difficulty, 40),
          content: cleanText(raw.content, 50000),
          referenceSolution: cleanText(raw.referenceSolution, 100000),
          contentFormat: 'html-latex',
          frontendAnchor: cleanText(raw.frontendAnchor, 180),
          legacyIds: Array.isArray(raw.legacyIds) ? raw.legacyIds.map(v => cleanText(v, 180)).filter(Boolean).slice(0, 10) : [],
          allowSubmission: raw.allowSubmission !== false,
          allowAiEvaluation: raw.allowAiEvaluation !== false,
          status: raw.status === 'draft' ? 'draft' : 'published',
          version: Math.max(1, cleanNumber(raw.version, 1, 1, 100000)),
          updatedBy: session.username,
          updatedAt: now
        };
        if (Object.prototype.hasOwnProperty.call(raw, 'referenceLinks')) {
          doc.referenceLinks = cleanReferenceLinks(raw.referenceLinks);
        }
        if (Object.prototype.hasOwnProperty.call(raw, 'referenceSolutionVerified')) {
          doc.referenceSolutionVerified = raw.referenceSolutionVerified === true && Boolean(doc.referenceSolution);
          doc.referenceSolutionVerifiedBy = doc.referenceSolutionVerified ? session.username : '';
          doc.referenceSolutionVerifiedAt = doc.referenceSolutionVerified ? now : null;
        }
        const savedProblem = await db.collection('problems').findOneAndUpdate(
          { contentKey },
          { $set: doc, $setOnInsert: { createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        );
        if (savedProblem?._id) {
          const submissionLinks = [
            { problemKey: contentKey },
            { problemId: String(savedProblem._id) }
          ];
          if (doc.legacyIds.length) {
            submissionLinks.push(
              { problemId: { $in: doc.legacyIds } },
              { legacyProblemId: { $in: doc.legacyIds } }
            );
          }
          await db.collection('submissions').updateMany(
            {
              $or: submissionLinks
            },
            {
              $set: {
                problemId: String(savedProblem._id),
                problemKey: contentKey,
                setId: String(setId),
                sourceType: doc.sourceType,
                sourceGroup: doc.sourceGroup,
                problemTitle: doc.title,
                problemSnapshot: problemSnapshot(savedProblem),
                updatedAt: now
              }
            }
          );
        }
        problemCount += 1;
      }

      await Promise.all([
        db.collection('content_sets').createIndex({ key: 1 }, { unique: true }),
        db.collection('problems').createIndex({ contentKey: 1 }, { unique: true }),
        db.collection('problems').createIndex({ setId: 1, order: 1 }),
        db.collection('submissions').createIndex({ userId: 1, problemKey: 1, createdAt: -1 }),
        db.collection('submissions').createIndex({ problemKey: 1, adminVerified: 1, updatedAt: -1 }),
        db.collection('submission_images').createIndex({ submissionId: 1 }, { unique: true })
      ]);

      await recordActivity(db, session, 'catalog.synced', { itemTitle: `${problemCount} câu hỏi/ví dụ` });
      return res.status(200).json({ success: true, item: { setCount: setIds.size, problemCount } });
    }

    if (action === 'update_catalog_item') {
      const itemType = cleanText(payload.itemType, 20);
      const id = objectId(cleanText(payload.id, 80));
      if (!id || !['set', 'problem'].includes(itemType)) {
        return res.status(400).json({ success: false, error: 'Mục catalog không hợp lệ' });
      }

      const collectionName = itemType === 'set' ? 'content_sets' : 'problems';
      const changes = { updatedBy: session.username, updatedAt: now };
      if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
        changes.status = payload.status === 'draft' ? 'draft' : 'published';
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'order')) {
        changes.order = cleanNumber(payload.order, 0, 0, 10000);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'title')) {
        const title = cleanText(payload.title, 500);
        if (!title) return res.status(400).json({ success: false, error: 'Tiêu đề không được để trống' });
        changes.title = title;
      }
      if (itemType === 'set') {
        if (Object.prototype.hasOwnProperty.call(payload, 'year')) changes.year = cleanText(payload.year, 40);
        if (Object.prototype.hasOwnProperty.call(payload, 'province')) changes.province = cleanText(payload.province, 120);
      }
      if (itemType === 'problem') {
        if (changes.status === 'published' || payload.allowSubmission === true || payload.allowAiEvaluation === true) {
          const pending = await db.collection('problems').findOne({ _id: id }, { projection: { predictionReview: 1 } });
          if (pending?.predictionReview?.status === 'gpt_rejected') {
            return res.status(409).json({ success: false, error: 'Câu bị GPT bác cần sửa nội dung và xác nhận trong ⚙️ Quản lý nguồn trước khi công bố.' });
          }
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'shortLabel')) changes.shortLabel = cleanText(payload.shortLabel, 120);
        if (Object.prototype.hasOwnProperty.call(payload, 'topic')) changes.topic = cleanText(payload.topic, 120);
        if (Object.prototype.hasOwnProperty.call(payload, 'maxScore')) {
          changes.maxScore = cleanNumber(payload.maxScore, 5, 0, 20);
        }
        if (typeof payload.allowSubmission === 'boolean') changes.allowSubmission = payload.allowSubmission;
        if (typeof payload.allowAiEvaluation === 'boolean') changes.allowAiEvaluation = payload.allowAiEvaluation;
      }

      const update = { $set: changes };
      if (itemType === 'problem' && ['title', 'shortLabel', 'topic', 'maxScore'].some(field => Object.prototype.hasOwnProperty.call(payload, field))) {
        update.$inc = { version: 1 };
      }
      const result = await db.collection(collectionName).findOneAndUpdate(
        { _id: id },
        update,
        { returnDocument: 'after' }
      );
      if (!result) return res.status(404).json({ success: false, error: 'Không tìm thấy mục catalog' });
      if (itemType === 'set' && changes.title) {
        await db.collection('problems').updateMany(
          { setId: id },
          { $set: { setTitle: changes.title, updatedBy: session.username, updatedAt: now } }
        );
      }
      await recordActivity(db, session, 'catalog.updated', { itemTitle: result.title || result.key || result.contentKey });
      return res.status(200).json({ success: true, item: result });
    }

    if (action === 'update_catalog_content') {
      const id = objectId(cleanText(payload.id, 80));
      const content = cleanText(payload.content, 50000);
      const referenceSolution = cleanText(payload.referenceSolution, 100000);
      const referenceSolutionVerified = payload.referenceSolutionVerified === true && Boolean(referenceSolution);
      const referenceLinks = cleanReferenceLinks(payload.referenceLinks);
      const changeNote = cleanText(payload.changeNote, 500);
      if (!id || !content) {
        return res.status(400).json({ success: false, error: 'Thiếu câu hỏi hoặc nội dung đề bài' });
      }
      const current = await db.collection('problems').findOne({ _id: id });
      if (!current) return res.status(404).json({ success: false, error: 'Không tìm thấy câu hỏi' });
      const resolvePredictionReview = payload.resolvePredictionReview === true &&
        current.origin === 'prediction' && current.predictionReview?.status === 'gpt_rejected';
      if (resolvePredictionReview && content === current.content) {
        return res.status(400).json({ success: false, error: 'Cần sửa nội dung câu hỏi trước khi xác nhận đã khắc phục nhận xét GPT.' });
      }
      const expectedVersion = cleanNumber(payload.expectedVersion, 0, 0, 1000000);
      if (expectedVersion && Number(current.version || 1) !== expectedVersion) {
        return res.status(409).json({ success: false, error: 'Nội dung đã được người khác cập nhật. Hãy tải lại trước khi lưu.' });
      }

      await db.collection('content_revisions').insertOne({
        problemId: id,
        contentKey: current.contentKey,
        version: Number(current.version || 1),
        title: current.title,
        content: current.content || '',
        referenceSolution: current.referenceSolution || '',
        referenceSolutionVerified: current.referenceSolutionVerified === true,
        referenceLinks: cleanReferenceLinks(current.referenceLinks),
        predictionReview: current.predictionReview || null,
        changeNote: changeNote || 'Bản tự động trước khi chỉnh sửa',
        action: 'edit',
        createdBy: session.username,
        createdAt: now
      });
      const nextVersion = Number(current.version || 1) + 1;
      await db.collection('problems').updateOne(
        { _id: id },
        { $set: {
          content, referenceSolution, referenceLinks, referenceSolutionVerified,
          referenceSolutionVerifiedBy: referenceSolutionVerified ? session.username : '',
          referenceSolutionVerifiedAt: referenceSolutionVerified ? now : null,
          version: nextVersion, updatedBy: session.username, updatedAt: now,
          ...(resolvePredictionReview ? {
            predictionReview: { ...current.predictionReview, status: 'admin_corrected',
              correctedBy: session.username, correctedAt: now, correctionNote: changeNote },
            status: 'published', allowSubmission: true, allowAiEvaluation: true
          } : {})
        } }
      );
      await db.collection('content_revisions').createIndex({ problemId: 1, createdAt: -1 });
      await recordActivity(db, session, 'catalog.updated', { problemKey: current.contentKey, itemTitle: current.title });
      return res.status(200).json({ success: true, item: { id: String(id), version: nextVersion } });
    }

    if (action === 'migrate_tst_reference_links') {
      const sourceMap = payload.sourceMap && typeof payload.sourceMap === 'object' ? payload.sourceMap : {};
      const cardIds = Object.keys(sourceMap).map(value => cleanKey(value, 180)).filter(Boolean).slice(0, 100);
      if (!cardIds.length) return res.status(400).json({ success: false, error: 'Không có nguồn TST để migration' });

      let matchedProblems = 0;
      let updatedProblems = 0;
      const unmatchedCardIds = [];
      for (const cardId of cardIds) {
        const config = sourceMap[cardId] || {};
        const problems = await db.collection('problems').find({
          sourceGroup: 'tst',
          $or: [
            { frontendAnchor: cardId },
            { setKey: { $regex: `^tst:${escapeRegex(cardId)}(?::day-[0-9]+)?$` } }
          ]
        }).sort({ order: 1, questionNumber: 1, createdAt: 1 }).toArray();
        if (!problems.length) {
          unmatchedCardIds.push(cardId);
          continue;
        }
        matchedProblems += problems.length;
        const allLinks = cleanReferenceLinks(config.all);
        const byIndex = config.byIndex && typeof config.byIndex === 'object' ? config.byIndex : {};
        for (const [index, problem] of problems.entries()) {
          const rawLinks = Object.prototype.hasOwnProperty.call(byIndex, index) ? byIndex[index] : allLinks;
          const referenceLinks = cleanReferenceLinks(rawLinks);
          await db.collection('problems').updateOne(
            { _id: problem._id },
            { $set: { referenceLinks, referenceLinksUpdatedBy: session.username, referenceLinksUpdatedAt: now } }
          );
          updatedProblems += 1;
        }
      }
      await recordActivity(db, session, 'catalog.updated', { itemTitle: `${updatedProblems} nguồn TST` });
      return res.status(200).json({
        success: true,
        item: { cardCount: cardIds.length, matchedProblems, updatedProblems, unmatchedCardIds }
      });
    }

    if (action === 'update_problem_reference_links') {
      const contentKey = cleanKey(payload.contentKey, 180);
      if (!contentKey) return res.status(400).json({ success: false, error: 'Khóa câu hỏi không hợp lệ' });
      const referenceLinks = cleanReferenceLinks(payload.referenceLinks);
      const result = await db.collection('problems').findOneAndUpdate(
        { contentKey },
        { $set: {
          referenceLinks,
          referenceLinksUpdatedBy: session.username,
          referenceLinksUpdatedAt: now,
          updatedBy: session.username,
          updatedAt: now
        } },
        { returnDocument: 'after' }
      );
      if (!result) return res.status(404).json({ success: false, error: 'Không tìm thấy câu hỏi trong MongoDB' });
      await recordActivity(db, session, 'catalog.updated', { problemKey: contentKey, itemTitle: result.title });
      return res.status(200).json({ success: true, item: result });
    }

    if (action === 'restore_catalog_revision') {
      const revisionId = objectId(cleanText(payload.revisionId, 80));
      if (!revisionId) return res.status(400).json({ success: false, error: 'Phiên bản khôi phục không hợp lệ' });
      const revision = await db.collection('content_revisions').findOne({ _id: revisionId });
      if (!revision) return res.status(404).json({ success: false, error: 'Không tìm thấy phiên bản' });
      const current = await db.collection('problems').findOne({ _id: revision.problemId });
      if (!current) return res.status(404).json({ success: false, error: 'Không tìm thấy câu hỏi gốc' });

      await db.collection('content_revisions').insertOne({
        problemId: current._id,
        contentKey: current.contentKey,
        version: Number(current.version || 1),
        title: current.title,
        content: current.content || '',
        referenceSolution: current.referenceSolution || '',
        referenceSolutionVerified: current.referenceSolutionVerified === true,
        referenceLinks: cleanReferenceLinks(current.referenceLinks),
        changeNote: `Bản tự động trước khi khôi phục phiên bản ${revision.version}`,
        action: 'restore_backup',
        createdBy: session.username,
        createdAt: now
      });
      const nextVersion = Number(current.version || 1) + 1;
      await db.collection('problems').updateOne(
        { _id: current._id },
        { $set: {
          content: revision.content || '',
          referenceSolution: revision.referenceSolution || '',
          referenceSolutionVerified: revision.referenceSolutionVerified === true && Boolean(revision.referenceSolution),
          referenceSolutionVerifiedBy: revision.referenceSolutionVerified === true ? session.username : '',
          referenceSolutionVerifiedAt: revision.referenceSolutionVerified === true ? now : null,
          referenceLinks: cleanReferenceLinks(revision.referenceLinks),
          version: nextVersion,
          updatedBy: session.username,
          updatedAt: now
        } }
      );
      await recordActivity(db, session, 'catalog.updated', { problemKey: current.contentKey, itemTitle: current.title });
      return res.status(200).json({ success: true, item: { id: String(current._id), version: nextVersion } });
    }

    if (action === 'add_document') {
      const title = cleanText(payload.title, 300);
      if (!title) return res.status(400).json({ success: false, error: 'Tên tài liệu là bắt buộc' });
      const doc = { title, topic: cleanText(payload.topic, 120) || 'Tổng hợp', author: cleanText(payload.author, 200) || 'Tổ Toán VMO Đà Nẵng', description: cleanText(payload.description, 5000), fileUrl: cleanText(payload.fileUrl, 2000), chapter: cleanText(payload.chapter, 200), createdBy: session.username, createdAt: now };
      const result = await db.collection('documents').insertOne(doc);
      await recordActivity(db, session, 'document.added', { itemTitle: title });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'add_exam') {
      const title = cleanText(payload.title, 300);
      if (!title) return res.status(400).json({ success: false, error: 'Tên đề thi là bắt buộc' });
      const doc = { title, category: cleanText(payload.category, 80) || 'vmo-danang', year: cleanText(payload.year, 30) || '2026-2027', day: cleanText(payload.day, 40) || 'Ngày 1', province: cleanText(payload.province, 100) || 'Đà Nẵng', duration: Math.max(1, Math.min(600, Number(payload.duration) || 180)), description: cleanText(payload.description, 5000), sourceUrl: cleanText(payload.sourceUrl, 2000), createdBy: session.username, createdAt: now };
      const result = await db.collection('exams').insertOne(doc);
      await recordActivity(db, session, 'exam.added', { itemTitle: title });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'create_exam_from_ocr') {
      const isMock = payload.destination === 'mock';
      if (payload.destination && !['mock', 'tst'].includes(payload.destination)) return res.status(400).json({ success: false, error: 'Loại đề thi không hợp lệ' });
      const province = cleanText(payload.province, 120);
      const targetAnchor = cleanKey(payload.targetAnchor, 180);
      const requestedRegion = cleanText(payload.region, 20).toUpperCase();
      const region = TST_REGIONS.has(requestedRegion) ? requestedRegion : 'BAC';
      const dayNumber = Number(payload.dayNumber);
      const setNumber = Number(payload.setNumber);
      const year = cleanText(payload.year, 40) || '2026-2027';
      const isPrediction = isMock && payload.origin === 'prediction';
      if (payload.origin === 'prediction' && !isMock) return res.status(400).json({ success: false, error: 'Đề dự đoán phải được lưu trong bộ thi thử' });
      const imageCount = cleanNumber(payload.sourceImageCount, 0, 0, 20);
      if (!isPrediction && imageCount < 1) return res.status(400).json({ success: false, error: 'Đề OCR cần ít nhất một ảnh nguồn' });
      const questions = Array.isArray(payload.questions) ? payload.questions.slice(0, 10) : [];
      if (!province || !(isMock ? /^mock-set\d+-day[12]$/.test(targetAnchor) && Number.isInteger(setNumber) && setNumber >= 3 && setNumber <= 100 && targetAnchor === `mock-set${setNumber}-day${dayNumber}` : /^tst-[a-z0-9._:-]+$/.test(targetAnchor)) || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > (isMock ? 2 : 4) || !questions.length) {
        return res.status(400).json({ success: false, error: 'Thiếu tỉnh/thành phố, vị trí frontend hoặc danh sách câu hỏi' });
      }

      const provinceSlug = slugKey(province);
      const yearSlug = slugKey(year);
      const examKey = isMock ? `mock:set-${setNumber}:${yearSlug}:day-${dayNumber}` : `tst:${provinceSlug}:${yearSlug}:day-${dayNumber}`;
      // Một tỉnh có thể có hai đề với các số câu trùng nhau. Ngày thi phải
      // thuộc khóa ổn định để ngày 2 không ghi đè câu hỏi/lịch sử của ngày 1.
      const setKey = isMock ? `mock:${targetAnchor}` : `tst:${targetAnchor}:day-${dayNumber}`;
      const title = cleanText(payload.title, 500) || (isMock ? `Bộ đề thi thử VMO số ${setNumber} — Ngày ${dayNumber}` : `Đề thi lập đội tuyển ${province} — Ngày ${dayNumber}`);
      const status = payload.status === 'draft' ? 'draft' : 'published';
      const existingExam = await db.collection('exams').findOne({ examKey }, { projection: { _id: 1 } });
      if (existingExam && payload.replaceExisting !== true) {
        return res.status(409).json({
          success: false,
          error: `Đề ngày ${dayNumber} của ${province} đã tồn tại. Cần xác nhận trước khi cập nhật.`
        });
      }

      const normalizedQuestions = [];
      const seenQuestionNumbers = new Set();
      for (const [index, raw] of questions.entries()) {
        const questionNumber = Math.max(1, Math.min(99, Number(raw?.questionNumber) || index + 1));
        const content = cleanText(raw?.content, 50000);
        if (!content) continue;
        if (seenQuestionNumbers.has(questionNumber)) {
          return res.status(400).json({ success: false, error: `Số câu ${questionNumber} bị lặp trong kết quả OCR` });
        }
        seenQuestionNumbers.add(questionNumber);
        normalizedQuestions.push({ raw, questionNumber, content });
      }
      if (!normalizedQuestions.length) {
        return res.status(400).json({ success: false, error: 'Không có câu hỏi hợp lệ để lưu' });
      }
      if (isPrediction && (normalizedQuestions.length < 2 || normalizedQuestions.length > 6 ||
          Math.abs(normalizedQuestions.reduce((total, item) => total + Number(item.raw?.maxScore || 0), 0) - 20) > 0.001)) {
        return res.status(400).json({ success: false, error: 'Đề dự đoán phải có 2–6 câu và tổng điểm đúng 20' });
      }
      const examDoc = {
        examKey,
        title,
        category: isMock ? 'vmo-mock' : 'tst-national',
        setNumber: isMock ? setNumber : undefined,
        year,
        day: `Ngày ${dayNumber}`,
        dayNumber,
        province,
        region,
        provinceOrder: cleanNumber(payload.provinceOrder, 0, 0, 1000),
        duration: Math.max(1, Math.min(600, Number(payload.duration) || 180)),
        examDate: cleanText(payload.examDate, 20),
        description: cleanText(payload.description, 5000),
        targetAnchor,
        sourceImageCount: imageCount,
        hasImages: imageCount > 0,
        origin: isPrediction ? 'prediction' : 'ocr',
        predictionInfo: isPrediction ? {
          targetType: ['tst', 'vmo'].includes(payload.predictionInfo?.targetType) ? payload.predictionInfo.targetType : '',
          targetAnchor: cleanKey(payload.predictionInfo?.targetAnchor, 100),
          requestedYears: cleanNumber(payload.predictionInfo?.requestedYears, 0, 0, 15),
          actualYears: (Array.isArray(payload.predictionInfo?.actualYears) ? payload.predictionInfo.actualYears : []).slice(0, 15).map(value => cleanText(value, 20)),
          ownExamCount: cleanNumber(payload.predictionInfo?.ownExamCount, 0, 0, 200),
          peerExamCount: cleanNumber(payload.predictionInfo?.peerExamCount, 0, 0, 200),
          model: cleanText(payload.predictionInfo?.model, 80),
          verifierModel: cleanText(payload.predictionInfo?.verifierModel, 80),
          verificationScore: cleanNumber(payload.predictionInfo?.verificationScore, 0, 0, 5),
          verificationSummary: cleanText(payload.predictionInfo?.verificationSummary, 1000),
          verified: payload.predictionInfo?.verified === true,
          historyCurrentProvince: cleanText(payload.predictionInfo?.historyCurrentProvince, 120),
          historyMembers: cleanStringList(payload.predictionInfo?.historyMembers, 5, 120),
          criticalIssues: (Array.isArray(payload.predictionInfo?.criticalIssues) ? payload.predictionInfo.criticalIssues : [])
            .slice(0, 12).map(issue => cleanText(issue, 3000)).filter(Boolean)
        } : null,
        ocrConfidence: cleanText(payload.ocrConfidence, 40),
        status,
        updatedBy: session.username,
        updatedAt: now
      };
      const savedExam = await db.collection('exams').findOneAndUpdate(
        { examKey },
        { $set: examDoc, $setOnInsert: { createdBy: session.username, createdAt: now } },
        { upsert: true, returnDocument: 'after' }
      );
      if (!savedExam?._id) return res.status(500).json({ success: false, error: 'Không thể tạo đề thi' });

      const setDoc = {
        key: setKey,
        contentType: isMock ? 'mock_exam' : 'tst_exam',
        title,
        group: isMock ? 'mock_exam' : 'tst',
        origin: isPrediction ? 'prediction' : 'ocr',
        year,
        province,
        region,
        order: cleanNumber(payload.provinceOrder),
        status,
        updatedBy: session.username,
        updatedAt: now
      };
      const savedSet = await db.collection('content_sets').findOneAndUpdate(
        { key: setKey },
        { $set: setDoc, $setOnInsert: { createdAt: now } },
        { upsert: true, returnDocument: 'after' }
      );
      if (!savedSet?._id) return res.status(500).json({ success: false, error: 'Không thể tạo nhóm nội dung đề thi' });

      const savedQuestions = [];
      for (const { raw, questionNumber, content } of normalizedQuestions) {
        const contentKey = `${setKey}:question-${questionNumber}`;
        const review = isPrediction ? {
          status: raw?.predictionReview?.approved === true ? 'gpt_approved' : 'gpt_rejected',
          approved: raw?.predictionReview?.approved === true,
          reason: cleanText(raw?.predictionReview?.reason, 3000),
          issues: (Array.isArray(raw?.predictionReview?.issues) ? raw.predictionReview.issues : [])
            .slice(0, 12).map(issue => cleanText(issue, 3000)).filter(Boolean),
          verifierModel: cleanText(payload.predictionInfo?.verifierModel, 80),
          reviewedAt: now
        } : null;
        const pendingReview = isPrediction && !review.approved;
        const problemDoc = {
          contentKey,
          setId: savedSet._id,
          setKey,
          setTitle: title,
          examId: String(savedExam._id),
          examKey,
          sourceType: isMock ? 'mock_exam_question' : 'tst_question',
          sourceGroup: isMock ? 'mock_exam' : 'tst',
          origin: isPrediction ? 'prediction' : 'ocr',
          title: cleanText(raw?.title, 500) || `Câu ${questionNumber}`,
          shortLabel: `Câu ${questionNumber}`,
          questionNumber,
          day: `Ngày ${dayNumber}`,
          dayNumber,
          order: dayNumber * 100 + questionNumber,
          orderNumber: questionNumber,
          maxScore: cleanNumber(raw?.maxScore, 0, 0, 20),
          topic: cleanText(raw?.topic, 120) || 'Toán Olympic',
          content,
          predictionReview: review,
          referenceSolution: '',
          contentFormat: 'html-latex',
          frontendAnchor: targetAnchor,
          legacyIds: [`${targetAnchor}-day-${dayNumber}-Cau_${questionNumber}`],
          allowSubmission: !pendingReview,
          allowAiEvaluation: !pendingReview,
          status: pendingReview ? 'draft' : status,
          version: 1,
          updatedBy: session.username,
          updatedAt: now
        };
        const saved = await db.collection('problems').findOneAndUpdate(
          { contentKey },
          { $set: problemDoc, $setOnInsert: { createdAt: now, referenceLinks: [] } },
          { upsert: true, returnDocument: 'after' }
        );
        if (saved?._id) savedQuestions.push(saved);
      }
      if (!savedQuestions.length) return res.status(500).json({ success: false, error: 'Không thể lưu câu hỏi của đề thi' });

      // Khi admin OCR lại đúng đề/ngày, loại các câu cũ không còn trong bản
      // đã duyệt. Không đụng tới đề của ngày khác và không xóa submissions.
      const keptContentKeys = savedQuestions.map(item => item.contentKey);
      await db.collection('problems').deleteMany({
        examId: String(savedExam._id),
        contentKey: { $nin: keptContentKeys }
      });

      const sourceImageCount = imageCount;
      await db.collection('exam_images').deleteMany({
        examId: savedExam._id,
        pageNumber: { $gt: sourceImageCount }
      });

      await Promise.all([
        db.collection('exams').createIndex(
          { examKey: 1 },
          { unique: true, partialFilterExpression: { examKey: { $type: 'string' } } }
        ),
        db.collection('problems').createIndex({ contentKey: 1 }, { unique: true }),
        db.collection('problems').createIndex({ examId: 1, orderNumber: 1 })
      ]);
      await recordActivity(db, session, 'exam.added', { itemTitle: title });
      return res.status(201).json({
        success: true,
        item: { ...savedExam, problems: savedQuestions, problemCount: savedQuestions.length }
      });
    }

    if (action === 'save_exam_image') {
      const examId = objectId(cleanText(payload.examId, 80));
      const pageNumber = Math.max(1, Math.min(20, Number(payload.pageNumber) || 1));
      const image = cleanSolutionImage(payload.image);
      if (!examId || !image) {
        return res.status(image === null ? 413 : 400).json({ success: false, error: 'Ảnh đề thi không hợp lệ hoặc vượt quá 3 MB' });
      }
      const exam = await db.collection('exams').findOne({ _id: examId });
      if (!exam) return res.status(404).json({ success: false, error: 'Không tìm thấy đề thi' });
      const mimeType = image.slice(5, image.indexOf(';'));
      await db.collection('exam_images').updateOne(
        { examId, pageNumber },
        { $set: { image, mimeType, updatedBy: session.username, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      );
      await db.collection('exams').updateOne(
        { _id: examId },
        { $set: { hasImages: true, sourceImageCount: Math.max(Number(exam.sourceImageCount) || 0, pageNumber), updatedAt: now } }
      );
      await db.collection('exam_images').createIndex({ examId: 1, pageNumber: 1 }, { unique: true });
      await recordActivity(db, session, 'exam.image_saved', { itemTitle: `${exam.title || 'Đề thi'} – trang ${pageNumber}` });
      return res.status(200).json({ success: true, item: { examId: String(examId), pageNumber, hasImage: true } });
    }

    if (action === 'save_problem') {
      const id = cleanText(payload.id, 180);
      const examId = cleanText(payload.examId, 180);
      if (!id || !examId || !cleanText(payload.content, 50000)) return res.status(400).json({ success: false, error: 'Thiếu mã, đề thi hoặc nội dung bài toán' });
      const doc = { id, examId, orderNumber: Math.max(1, Number(payload.orderNumber) || 1), title: cleanText(payload.title, 500), topic: cleanText(payload.topic, 120) || 'Đại số', content: cleanText(payload.content, 50000), officialSolution: cleanText(payload.officialSolution, 100000), maxScore: Math.max(0, Math.min(20, Number(payload.maxScore) || 5)), updatedBy: session.username, updatedAt: now };
      await db.collection('problems').updateOne({ id }, { $set: doc, $setOnInsert: { createdAt: now } }, { upsert: true });
      await recordActivity(db, session, 'catalog.updated', { itemTitle: doc.title });
      return res.status(200).json({ success: true, item: doc });
    }

    if (action === 'add_event') {
      const title = cleanText(payload.title, 300);
      if (!title || !cleanText(payload.startDate, 80)) return res.status(400).json({ success: false, error: 'Tên và ngày bắt đầu là bắt buộc' });
      const doc = { title, eventType: cleanText(payload.eventType, 80) || 'exam', startDate: cleanText(payload.startDate, 80), endDate: cleanText(payload.endDate, 80), location: cleanText(payload.location, 300) || 'THPT Chuyên Lê Quý Đôn - Đà Nẵng', description: cleanText(payload.description, 5000), targetAudience: cleanText(payload.targetAudience, 300) || 'Đội tuyển HSG QG Toán', createdBy: session.username, createdAt: now };
      const result = await db.collection('events').insertOne(doc);
      await recordActivity(db, session, 'event.added', { itemTitle: title });
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'delete_submission') {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID bài nộp không hợp lệ' });
      const result = await db.collection('submissions').deleteOne({ _id: id });
      if (!result.deletedCount) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp' });
      }
      await db.collection('submission_images').deleteMany({ submissionId: id });
      await recordActivity(db, session, 'submission.deleted', { submissionId: id });
      return res.status(200).json({ success: true, deletedId: String(id) });
    }

    if (action === 'verify_submission') {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID bài nộp không hợp lệ' });
      const submission = await db.collection('submissions').findOne({ _id: id });
      let change;
      try {
        change = buildSubmissionVerificationUpdate(session, submission, {
          verified: payload.verified,
          note: cleanText(payload.note, 1000)
        }, now);
      } catch (error) {
        return res.status(error.status || 400).json({ success: false, error: error.message });
      }
      const updated = await db.collection('submissions').findOneAndUpdate(
        { _id: id }, change.update, { returnDocument: 'after' }
      );
      if (!updated) return res.status(404).json({ success: false, error: 'Không tìm thấy bài nộp' });
      await db.collection('submissions').createIndex({ problemKey: 1, adminVerified: 1, updatedAt: -1 });
      await recordActivity(db, session,
        change.verified ? 'submission.verified' : 'submission.verification_revoked', {
          submissionId: id,
          problemKey: updated.problemKey,
          problemTitle: updated.problemSnapshot?.title || updated.problemTitle,
          setTitle: updated.problemSnapshot?.setTitle,
          ownerUsername: updated.username
        });
      return res.status(200).json({ success: true, item: updated });
    }

    const deletions = { delete_document: 'documents', delete_event: 'events' };
    if (deletions[action]) {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID không hợp lệ' });
      const result = await db.collection(deletions[action]).deleteOne({ _id: id });
      if (result.deletedCount) await recordActivity(db, session, action === 'delete_document' ? 'document.deleted' : 'event.deleted', { itemTitle: String(id) });
      return res.status(result.deletedCount ? 200 : 404).json({ success: Boolean(result.deletedCount), error: result.deletedCount ? undefined : 'Không tìm thấy dữ liệu' });
    }

    return res.status(400).json({ success: false, error: 'Thao tác không hợp lệ' });
  } catch (error) {
    console.error('[API data]', error);
    return res.status(500).json({ success: false, error: 'Không thể xử lý dữ liệu MongoDB' });
  }
}
