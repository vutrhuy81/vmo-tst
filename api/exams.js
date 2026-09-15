const { getDb } = require('./lib/db');
const { ObjectId } = require('mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = await getDb();
    const exams = db.collection('exams');
    const submissions = db.collection('submissions');

    // GET /api/exams hoặc GET /api/exams?id=...
    if (req.method === 'GET') {
      const { id } = req.query || {};
      
      if (id) {
        let query;
        if (ObjectId.isValid(id)) {
          // Khớp cả dạng ObjectId lẫn chuỗi thường
          query = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { id: id }] };
        } else {
          query = { $or: [{ _id: id }, { id: id }] };
        }
        
        const item = await exams.findOne(query);
        return res.status(200).json(item || {});
      }

      // Lấy danh sách đề (ẩn bớt questions để nhẹ payload nếu danh sách lớn)
      const list = await exams.find({}).project({ questions: 0 }).toArray();
      return res.status(200).json(list);
    }

    // POST /api/exams
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ success: false, error: 'JSON payload không hợp lệ' });
        }
      }

      const { type, payload } = body || {};

      if (type === 'create_exam') {
        if (!payload || typeof payload !== 'object') {
          return res.status(400).json({ success: false, error: 'Thiếu dữ liệu payload đề thi' });
        }
        const doc = await exams.insertOne({ ...payload, createdAt: new Date() });
        return res.status(201).json({ success: true, id: doc.insertedId });
      }

      if (type === 'submit_answer') {
        if (!payload || typeof payload !== 'object') {
          return res.status(400).json({ success: false, error: 'Thiếu dữ liệu bài nộp' });
        }
        const sub = await submissions.insertOne({ ...payload, submittedAt: new Date() });
        return res.status(201).json({ success: true, submissionId: sub.insertedId });
      }

      return res.status(400).json({ success: false, error: 'Loại yêu cầu (type) không hợp lệ' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('LỖI THỰC THI API EXAMS:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Lỗi thực thi Database/Serverless',
      details: err.message 
    });
  }
};
