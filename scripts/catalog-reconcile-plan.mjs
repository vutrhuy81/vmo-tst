import fs from 'node:fs';

const input = process.argv[2];
if (!input) throw new Error('Dùng: npm run catalog:plan -- <catalog-report.json>');
const report = JSON.parse(fs.readFileSync(input, 'utf8'));
if (report.reportVersion !== 2 || report.mode !== 'dry-run' || report.writes !== 0 ||
    report.candidates?.length !== report.conflictCount) {
  throw new Error('Báo cáo không đầy đủ hoặc không phải dry-run chỉ đọc.');
}

const byType = type => report.candidates.filter(row => row.collection === type);
const problems = byType('problems');
const sets = byType('content_sets');
const exams = byType('exams');
const countTargets = rows => {
  const counts = new Map();
  rows.forEach(row => counts.set(row.existingKey, (counts.get(row.existingKey) || 0) + 1));
  return counts;
};
const duplicateSources = rows => rows.filter(row => rows.filter(x => x.sourceKey === row.sourceKey).length > 1);
if (duplicateSources(problems).length || [...countTargets(problems).values()].some(n => n !== 1)) {
  throw new Error('Ánh xạ câu không phải 1:1; cần rà soát thủ công.');
}
const sharedSets = [...countTargets(sets)].filter(([, n]) => n > 1).map(([existingKey, sourceCount]) => ({
  existingKey, sourceCount, sourceKeys: sets.filter(x => x.existingKey === existingKey).map(x => x.sourceKey)
}));
const sharedExams = [...countTargets(exams)].filter(([, n]) => n > 1).map(([existingKey, sourceCount]) => ({
  existingKey, sourceCount, sourceKeys: exams.filter(x => x.existingKey === existingKey).map(x => x.sourceKey)
}));
const plan = {
  policy: 'retain-atlas-content-and-id', database: report.database,
  retainExistingProblems: problems.length,
  exactContent: problems.filter(x => x.contentEqual).length,
  preserveAtlasDifferences: problems.filter(x => !x.contentEqual).length,
  aliasPairs: problems.map(x => ({ manifestKey: x.sourceKey, atlasKey: x.existingKey,
    manifestSetKey: x.sourceSetKey, atlasSetKey: x.existingSetKey,
    atlasContentHash: x.existingContentHash, contentEqual: x.contentEqual })),
  sharedSets, sharedExams,
  blockers: [
    'Chưa xác minh mọi khóa đề trùng anchor và quan hệ theo ngày.',
    'Chưa có ánh xạ setId/examId được kiểm tra trên Atlas.',
    'Chưa sao lưu và xác minh nội dung Admin/bài nộp.',
    'Chưa thử giao diện API-only trên Vercel Preview.'
  ],
  writes: 0
};
console.log(JSON.stringify(plan, null, 2));
