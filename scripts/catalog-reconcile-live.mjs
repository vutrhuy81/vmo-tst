import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId, EJSON } from 'mongodb';
import { assertManifest } from '../lib/catalog-manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = assertManifest(JSON.parse(fs.readFileSync(path.join(root, 'data/static-catalog-manifest.json'), 'utf8')));
if (!process.env.CATALOG_REPORT_PATH || !process.env.CATALOG_RELATIONS_PATH) {
  throw new Error('Cần CATALOG_REPORT_PATH và CATALOG_RELATIONS_PATH từ dry-run Atlas.');
}
const report = JSON.parse(fs.readFileSync(process.env.CATALOG_REPORT_PATH || '', 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(process.env.CATALOG_RELATIONS_PATH || '', 'utf8'));
const apply = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
if (!uri || new URL(uri).pathname.slice(1) !== 'vmo_tst') throw new Error('Cần MONGODB_URI cho /vmo_tst.');
if (report.mode !== 'dry-run' || report.writes !== 0 || report.reportVersion !== 2 ||
    report.candidates?.length !== report.conflictCount || snapshot.mode !== 'read-only-relations' ||
    snapshot.database !== 'vmo_tst' || report.database !== 'vmo_tst') throw new Error('Báo cáo/snapshot không hợp lệ.');
if (apply && (process.env.CATALOG_APPLY !== 'YES' || !process.env.CATALOG_BACKUP_PATH)) {
  throw new Error('Chế độ ghi cần CATALOG_APPLY=YES và CATALOG_BACKUP_PATH.');
}

const hash = value => createHash('sha256').update(value).digest('hex');
const aliases = report.candidates.filter(x => x.collection === 'problems');
const problemsByKey = new Map(manifest.problems.map(x => [x.contentKey, x]));
const setsByKey = new Map(manifest.contentSets.map(x => [x.key, x]));
const snapshotProblems = new Map(snapshot.problems.map(x => [x.contentKey, x]));
const oldSetById = new Map(snapshot.contentSets.map(x => [x.id, x]));
if (aliases.length !== manifest.problems.length ||
    new Set(aliases.map(x => x.sourceKey)).size !== aliases.length ||
    new Set(aliases.map(x => x.existingKey)).size !== aliases.length) {
  throw new Error('Ánh xạ câu phải đầy đủ và 1:1.');
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db('vmo_tst');
  const names = ['exams', 'content_sets', 'problems', 'content_blocks'];
  const live = Object.fromEntries(await Promise.all(names.map(async name => [name,
    await db.collection(name).find({}).toArray()
  ])));
  const liveProblemByKey = new Map(live.problems.map(x => [x.contentKey, x]));
  const liveSetById = new Map(live.content_sets.map(x => [String(x._id), x]));
  const sourceExamKeys = new Set(manifest.exams.map(x => x.examKey));
  const sourceSetKeys = new Set(manifest.contentSets.map(x => x.key));
  if (live.exams.some(x => sourceExamKeys.has(x.examKey)) ||
      live.content_blocks.some(x => manifest.contentBlocks.some(b => b.blockKey === x.blockKey))) {
    throw new Error('Atlas đã có một phần catalog mới; cần kiểm kê lại trước khi chạy.');
  }
  const existingSourceSets = live.content_sets.filter(x => sourceSetKeys.has(x.key));
  const snapshotSourceSets = snapshot.contentSets.filter(x => sourceSetKeys.has(x.key));
  if (existingSourceSets.length !== snapshotSourceSets.length ||
      existingSourceSets.some(x => !snapshotSourceSets.some(y => y.key === x.key && y.id === String(x._id)))) {
    throw new Error('Nhóm canonical đã thay đổi sau snapshot; cần kiểm kê lại.');
  }
  for (const alias of aliases) {
    const source = problemsByKey.get(alias.sourceKey);
    const old = liveProblemByKey.get(alias.existingKey);
    const saved = snapshotProblems.get(alias.existingKey);
    if (!source || !old || !saved || String(old._id) !== saved.id ||
        String(old.setId || '') !== saved.setId || old.setKey !== saved.setKey ||
        old.examId || old.sourceGroup !== source.sourceGroup ||
        hash(old.content || '') !== alias.existingContentHash ||
        oldSetById.get(saved.setId)?.key !== alias.existingSetKey ||
        liveSetById.get(saved.setId)?.key !== alias.existingSetKey ||
        !setsByKey.has(source.setKey) ||
        liveProblemByKey.has(source.contentKey)) {
      throw new Error(`Câu đã thay đổi hoặc ánh xạ không chắc chắn: ${alias.existingKey}`);
    }
  }
  const untouched = live.problems.filter(x => !aliases.some(a => a.existingKey === x.contentKey));
  if (untouched.some(x => !x.setId || !liveSetById.has(String(x.setId)) ||
      x.examId && !live.exams.some(e => String(e._id) === String(x.examId)))) {
    throw new Error('Câu ngoài manifest có liên kết không hợp lệ.');
  }
  const summary = { mode: apply ? 'apply' : 'preflight', database: 'vmo_tst',
    retainAtlasProblems: aliases.length, attachExam: aliases.filter(x =>
      setsByKey.get(problemsByKey.get(x.sourceKey).setKey).examKey).length,
    untouchedDynamicProblems: untouched.length,
    insertExams: manifest.exams.length,
    insertSets: manifest.contentSets.length - existingSourceSets.length,
    insertBlocks: manifest.contentBlocks.length, writes: 0 };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); }
  else {
    const backupPath = path.resolve(process.env.CATALOG_BACKUP_PATH);
    const fd = fs.openSync(backupPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, EJSON.stringify({ database: 'vmo_tst', createdAt: new Date(), collections: live }, null, 2));
      fs.fsyncSync(fd);
    }
    finally { fs.closeSync(fd); }
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        summary.writes = 0;
        for (const exam of manifest.exams) {
          await db.collection('exams').insertOne({ ...exam, importedFrom: 'static-catalog', importedAt: new Date() }, { session });
          summary.writes++;
        }
        const examIds = new Map((await db.collection('exams').find({ examKey: { $in: [...sourceExamKeys] } },
          { projection: { examKey: 1 }, session }).toArray()).map(x => [x.examKey, x._id]));
        for (const set of manifest.contentSets) {
          if (existingSourceSets.some(x => x.key === set.key)) continue;
          const row = { ...set, importedFrom: 'static-catalog', importedAt: new Date() };
          if (set.examKey) row.examId = String(examIds.get(set.examKey));
          await db.collection('content_sets').insertOne(row, { session });
          summary.writes++;
        }
        const setIds = new Map((await db.collection('content_sets').find({ key: { $in: [...sourceSetKeys] } },
          { projection: { key: 1 }, session }).toArray()).map(x => [x.key, x._id]));
        if (examIds.size !== manifest.exams.length || setIds.size !== manifest.contentSets.length) {
          throw new Error('Thiếu đề/nhóm trong transaction.');
        }
        for (const alias of aliases) {
          const source = problemsByKey.get(alias.sourceKey);
          const set = setsByKey.get(source.setKey);
          const old = liveProblemByKey.get(alias.existingKey);
          const changes = { setId: setIds.get(set.key), setKey: set.key, catalogSourceKey: source.contentKey };
          if (set.examKey) Object.assign(changes, { examId: String(examIds.get(set.examKey)),
            examKey: set.examKey, orderNumber: source.order });
          const result = await db.collection('problems').updateOne({ _id: new ObjectId(old._id),
            contentKey: old.contentKey, content: old.content, setId: old.setId },
            { $set: changes }, { session });
          if (result.matchedCount !== 1) throw new Error(`Câu thay đổi khi đang ghi: ${old.contentKey}`);
          summary.writes += result.modifiedCount;
        }
        for (const block of manifest.contentBlocks) {
          await db.collection('content_blocks').insertOne({ ...block, importedFrom: 'static-catalog', importedAt: new Date() }, { session });
          summary.writes++;
        }
      });
      console.log(JSON.stringify({ ...summary, backupPath }, null, 2));
    } finally { await session.endSession(); }
  }
} finally { await client.close(); }
