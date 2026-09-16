import { ObjectId } from 'mongodb';
import { getDb } from './lib/db.js';
import { getSession } from './lib/session.js';

const ALLOWED_RESOURCES = new Set(['documents', 'exams', 'content_sets', 'problems', 'submissions', 'submission_image', 'events']);
const CONTENT_TYPES = new Set(['specialty_chapter', 'mock_exam', 'tst_exam', 'regional_exam']);
const SOURCE_TYPES = new Set(['specialty_example', 'mock_exam_question', 'tst_question', 'regional_question']);
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

function objectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function cleanKey(value, max = 180) {
  return cleanText(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanNumber(value, fallback = 0, min = 0, max = 10000) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function problemSnapshot(problem) {
  if (!problem) return null;
  return {
    contentKey: problem.contentKey,
    title: problem.title,
    setTitle: problem.setTitle,
    sourceType: problem.sourceType,
    sourceGroup: problem.sourceGroup,
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

      const filter = {};
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
        if (session.role !== 'admin') filter.status = 'published';
      }
      if (resource === 'exams' && req.query?.category && req.query.category !== 'all') {
        filter.category = cleanText(req.query.category, 80);
      }
      if (resource === 'documents' && req.query?.topic && req.query.topic !== 'all') {
        filter.topic = cleanText(req.query.topic, 120);
      }
      if (resource === 'submissions') {
        if (session.role !== 'admin') filter.userId = String(session.sub);
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
      }

      const sort = resource === 'events'
        ? { startDate: 1 }
        : resource === 'content_sets' || resource === 'problems'
          ? { order: 1, orderNumber: 1 }
          : { createdAt: -1 };
      const items = await db.collection(resource).find(filter).sort(sort).limit(500).toArray();
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
      const registeredProblemId = registeredProblem ? String(registeredProblem._id) : submittedProblemId;
      const registeredProblemKey = registeredProblem?.contentKey || submittedProblemKey || submittedProblemId;
      const evaluation = payload.evaluation && typeof payload.evaluation === 'object' ? payload.evaluation : null;
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
        createdAt: now,
        updatedAt: now
      };
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
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (!requireAdmin(session, res)) return;

    if (action === 'upsert_content_catalog') {
      const sets = Array.isArray(payload.sets) ? payload.sets.slice(0, 200) : [];
      const problems = Array.isArray(payload.problems) ? payload.problems.slice(0, 1000) : [];
      if (!sets.length || !problems.length) {
        return res.status(400).json({ success: false, error: 'Catalog phải có nhóm nội dung và câu hỏi' });
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
        db.collection('submission_images').createIndex({ submissionId: 1 }, { unique: true })
      ]);

      return res.status(200).json({ success: true, item: { setCount: setIds.size, problemCount } });
    }

    if (action === 'add_document') {
      const title = cleanText(payload.title, 300);
      if (!title) return res.status(400).json({ success: false, error: 'Tên tài liệu là bắt buộc' });
      const doc = { title, topic: cleanText(payload.topic, 120) || 'Tổng hợp', author: cleanText(payload.author, 200) || 'Tổ Toán VMO Đà Nẵng', description: cleanText(payload.description, 5000), fileUrl: cleanText(payload.fileUrl, 2000), chapter: cleanText(payload.chapter, 200), createdBy: session.username, createdAt: now };
      const result = await db.collection('documents').insertOne(doc);
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'add_exam') {
      const title = cleanText(payload.title, 300);
      if (!title) return res.status(400).json({ success: false, error: 'Tên đề thi là bắt buộc' });
      const doc = { title, category: cleanText(payload.category, 80) || 'vmo-danang', year: cleanText(payload.year, 30) || '2026-2027', day: cleanText(payload.day, 40) || 'Ngày 1', province: cleanText(payload.province, 100) || 'Đà Nẵng', duration: Math.max(1, Math.min(600, Number(payload.duration) || 180)), description: cleanText(payload.description, 5000), sourceUrl: cleanText(payload.sourceUrl, 2000), createdBy: session.username, createdAt: now };
      const result = await db.collection('exams').insertOne(doc);
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    if (action === 'save_problem') {
      const id = cleanText(payload.id, 180);
      const examId = cleanText(payload.examId, 180);
      if (!id || !examId || !cleanText(payload.content, 50000)) return res.status(400).json({ success: false, error: 'Thiếu mã, đề thi hoặc nội dung bài toán' });
      const doc = { id, examId, orderNumber: Math.max(1, Number(payload.orderNumber) || 1), title: cleanText(payload.title, 500), topic: cleanText(payload.topic, 120) || 'Đại số', content: cleanText(payload.content, 50000), officialSolution: cleanText(payload.officialSolution, 100000), maxScore: Math.max(0, Math.min(20, Number(payload.maxScore) || 5)), updatedBy: session.username, updatedAt: now };
      await db.collection('problems').updateOne({ id }, { $set: doc, $setOnInsert: { createdAt: now } }, { upsert: true });
      return res.status(200).json({ success: true, item: doc });
    }

    if (action === 'add_event') {
      const title = cleanText(payload.title, 300);
      if (!title || !cleanText(payload.startDate, 80)) return res.status(400).json({ success: false, error: 'Tên và ngày bắt đầu là bắt buộc' });
      const doc = { title, eventType: cleanText(payload.eventType, 80) || 'exam', startDate: cleanText(payload.startDate, 80), endDate: cleanText(payload.endDate, 80), location: cleanText(payload.location, 300) || 'THPT Chuyên Lê Quý Đôn - Đà Nẵng', description: cleanText(payload.description, 5000), targetAudience: cleanText(payload.targetAudience, 300) || 'Đội tuyển HSG QG Toán', createdBy: session.username, createdAt: now };
      const result = await db.collection('events').insertOne(doc);
      return res.status(201).json({ success: true, item: { _id: result.insertedId, ...doc } });
    }

    const deletions = { delete_document: 'documents', delete_event: 'events' };
    if (deletions[action]) {
      const id = objectId(payload.id);
      if (!id) return res.status(400).json({ success: false, error: 'ID không hợp lệ' });
      const result = await db.collection(deletions[action]).deleteOne({ _id: id });
      return res.status(result.deletedCount ? 200 : 404).json({ success: Boolean(result.deletedCount), error: result.deletedCount ? undefined : 'Không tìm thấy dữ liệu' });
    }

    return res.status(400).json({ success: false, error: 'Thao tác không hợp lệ' });
  } catch (error) {
    console.error('[API data]', error);
    return res.status(500).json({ success: false, error: 'Không thể xử lý dữ liệu MongoDB' });
  }
}
