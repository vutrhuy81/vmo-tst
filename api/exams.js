const { getDb } = require('./lib/db');
const { ObjectId } = require('mongodb');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = await getDb();
  const exams = db.collection('exams');
  const submissions = db.collection('submissions');

  if (req.method === 'GET') {
    try {
      const { id } = req.query;
      if (id) {
        const item = await exams.findOne({ _id: new ObjectId(id) });
        return res.status(200).json(item);
      }
      const list = await exams.find({}).project({ questions: 0 }).toArray();
      return res.status(200).json(list);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { type, payload } = req.body;
    try {
      if (type === 'create_exam') {
        const doc = await exams.insertOne({ ...payload, createdAt: new Date() });
        return res.status(201).json({ success: true, id: doc.insertedId });
      }
      if (type === 'submit_answer') {
        const sub = await submissions.insertOne({ ...payload, submittedAt: new Date() });
        return res.status(201).json({ success: true, submissionId: sub.insertedId });
      }
      return res.status(400).json({ error: 'Loại yêu cầu không hợp lệ' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
