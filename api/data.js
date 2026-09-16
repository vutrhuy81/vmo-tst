import { ObjectId } from 'mongodb';
import { getDb } from './lib/db.js';
import { getSession } from './lib/session.js';

const ALLOWED_RESOURCES = new Set(['documents', 'exams', 'problems', 'submissions', 'submission_image', 'events']);
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
      if (resource === 'problems' && req.query?.examId) filter.examId = cleanText(req.query.examId, 120);
      if (resource === 'exams' && req.query?.category && req.query.category !== 'all') {
        filter.category = cleanText(req.query.category, 80);
      }
      if (resource === 'documents' && req.query?.topic && req.query.topic !== 'all') {
        filter.topic = cleanText(req.query.topic, 120);
      }
      if (resource === 'submissions') {
        if (session.role !== 'admin') filter.userId = String(session.sub);
        if (req.query?.problemId) filter.problemId = cleanText(req.query.problemId, 180);
      }

      const sort = resource === 'events'
        ? { startDate: 1 }
        : resource === 'problems'
          ? { orderNumber: 1 }
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
      const problemId = cleanText(payload.problemId, 180);
      const solutionContent = cleanText(payload.solutionContent, 50000);
      const solutionImage = cleanSolutionImage(payload.solutionImage);
      if (solutionImage === null) {
        return res.status(413).json({ success: false, error: 'Ảnh không hợp lệ hoặc vượt quá giới hạn 3 MB' });
      }
      if (!problemId || (!solutionContent && !solutionImage)) {
        return res.status(400).json({ success: false, error: 'Thiếu mã bài toán hoặc nội dung bài giải/ảnh bài làm' });
      }
      const evaluation = payload.evaluation && typeof payload.evaluation === 'object' ? payload.evaluation : null;
      const doc = {
        problemId,
        problemTitle: cleanText(payload.problemTitle, 500),
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
