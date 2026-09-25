import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';
import { assertManifest, manifestSummary } from '../lib/catalog-manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = assertManifest(JSON.parse(fs.readFileSync(path.join(root, 'data/static-catalog-manifest.json'), 'utf8')));
const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Thiếu MONGODB_URI. Dùng tài khoản Atlas có quyền đọc cho dry-run.');
if (new URL(uri).pathname.slice(1) !== 'vmo_tst') throw new Error('MONGODB_URI phải ghi rõ /vmo_tst.');
if (apply && process.env.CATALOG_APPLY !== 'YES') throw new Error('Để ghi, truyền --apply và CATALOG_APPLY=YES.');

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
const collections = [
  ['exams', manifest.exams, 'examKey'],
  ['content_sets', manifest.contentSets, 'key'],
  ['problems', manifest.problems, 'contentKey'],
  ['content_blocks', manifest.contentBlocks, 'blockKey']
];
const duplicateKeys = (items, field) => {
  const count = new Map();
  items.forEach(item => { if (item[field]) count.set(item[field], (count.get(item[field]) || 0) + 1); });
  return [...count].filter(([, n]) => n > 1).map(([key]) => key);
};

try {
  await client.connect();
  const db = client.db('vmo_tst');
  const existing = Object.fromEntries(await Promise.all(collections.map(async ([name]) =>
    [name, await db.collection(name).find({}, {
      projection: name === 'problems'
        ? { contentKey: 1, setKey: 1, setId: 1, examId: 1, frontendAnchor: 1, legacyIds: 1, status: 1 }
        : name === 'exams' ? { examKey: 1, targetAnchor: 1, category: 1 }
          : name === 'content_sets' ? { key: 1, examKey: 1, examId: 1 } : { blockKey: 1 }
    }).toArray()] )));
  const plan = {};
  const conflicts = [];
  for (const [name, source, field] of collections) {
    const current = existing[name];
    duplicateKeys(current, field).forEach(key => conflicts.push(`${name}: khóa trùng trong Atlas ${key}`));
    const keyed = new Map(current.filter(item => item[field]).map(item => [item[field], item]));
    const missing = source.filter(item => !keyed.has(item[field]));
    plan[name] = {
      existing: current.length,
      matched: source.length - missing.length,
      insert: missing.length,
      sampleMissingKeys: missing.slice(0, 15).map(item => item[field])
    };
    if (name === 'exams') {
      missing.forEach(item => {
        const collision = current.find(x => x.category === item.category && x.targetAnchor === item.targetAnchor);
        if (collision) conflicts.push(`exams: anchor ${item.targetAnchor} đã thuộc ${collision.examKey || collision._id}`);
      });
    }
    if (name === 'problems') {
      missing.forEach(item => {
        const collision = current.find(x => x.setKey === item.setKey && x.frontendAnchor === item.frontendAnchor &&
          (x.legacyIds || []).some(id => (item.legacyIds || []).includes(id)));
        if (collision) conflicts.push(`problems: câu ${item.contentKey} trùng legacy ID với ${collision.contentKey || collision._id}`);
      });
    }
  }
  const setKeys = new Set([...existing.content_sets.map(x => x.key), ...manifest.contentSets.map(x => x.key)]);
  const examKeys = new Set([...existing.exams.map(x => x.examKey), ...manifest.exams.map(x => x.examKey)]);
  manifest.problems.forEach(p => { if (!setKeys.has(p.setKey)) conflicts.push(`problem thiếu set ${p.contentKey}`); });
  manifest.contentSets.filter(x => x.examKey).forEach(x => { if (!examKeys.has(x.examKey)) conflicts.push(`set thiếu exam ${x.key}`); });
  const report = { mode: apply ? 'apply' : 'dry-run', database: 'vmo_tst', manifest: manifestSummary(manifest),
    plan, conflicts: conflicts.slice(0, 100), conflictCount: conflicts.length, writes: 0 };
  if (conflicts.length) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error('Phát hiện xung đột; chưa ghi bất kỳ bản ghi nào.');
  }
  if (!apply) { console.log(JSON.stringify(report, null, 2)); }
  else {
    // Insert only: dữ liệu đã tồn tại, nhất là các sửa chữa của Admin, luôn được giữ nguyên.
    for (const [name, source, field] of collections) {
      const known = new Set(existing[name].map(x => x[field]));
      for (const item of source) {
        if (known.has(item[field])) continue;
        const row = { ...item, importedFrom: 'static-catalog', importedAt: new Date() };
        if (name === 'content_sets' && item.examKey) {
          const exam = await db.collection('exams').findOne({ examKey: item.examKey }, { projection: { _id: 1 } });
          if (!exam) throw new Error(`Không tìm thấy exam ${item.examKey}`);
          row.examId = String(exam._id);
        }
        if (name === 'problems') {
          const set = await db.collection('content_sets').findOne({ key: item.setKey }, { projection: { _id: 1, examKey: 1 } });
          if (!set) throw new Error(`Không tìm thấy set ${item.setKey}`);
          row.setId = set._id;
          if (set.examKey) {
            const exam = await db.collection('exams').findOne({ examKey: set.examKey }, { projection: { _id: 1 } });
            if (!exam) throw new Error(`Không tìm thấy exam ${set.examKey}`);
            row.examKey = set.examKey;
            row.examId = String(exam._id);
            row.orderNumber = item.order;
          }
        }
        const result = await db.collection(name).updateOne({ [field]: item[field] }, { $setOnInsert: row }, { upsert: true });
        if (result.upsertedCount) report.writes++;
      }
    }
    console.log(JSON.stringify(report, null, 2));
  }
} finally { await client.close(); }
