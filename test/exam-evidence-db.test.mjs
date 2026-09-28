import assert from 'node:assert/strict';
import { loadExamEvidence } from '../lib/exam-evidence-db.js';
import { selectPredictionEvidence, predictionSettings } from '../lib/exam-prediction.js';
import { selectTrendEvidence, trendAnalysisSettings } from '../lib/exam-trends.js';

const exams = [
  { _id: 'a', category: 'vmo-official', year: '2024-2025', province: 'VMO', title: 'VMO 2024', targetAnchor: 'vmo-vmo-2024-2025', dayNumber: 2 },
  { _id: 'b', category: 'tst-national', year: '2025-2026', province: 'Đà Nẵng', title: 'TST Đà Nẵng', targetAnchor: 'tst-da-nang', dayNumber: 1 },
  { _id: 'c', category: 'history-dn-qn', year: '2024-2025', province: 'Quảng Nam', title: 'Quảng Nam', targetAnchor: 'hist-qn-2024-2025', dayNumber: 1 }
];
const problems = exams.map((exam, i) => ({ _id: i, examId: exam._id,
  questionNumber: 1, topic: 'Số học', content: `<p>Câu ${i + 1}</p>` }));
let query;
const db = { collection(name) { return { find(filter) {
  if (name === 'exams') query = filter;
  const items = name === 'exams'
    ? exams.filter(item => filter.category.$in.includes(item.category) && (!filter.year || filter.year.$in.includes(item.year)))
    : problems.filter(item => filter.examId.$in.includes(item.examId));
  return { sort() { return this; }, limit(n) { return { toArray: async () => items.slice(0, n) }; } };
} }; } };
const evidence = await loadExamEvidence(db, { years: ['2024-2025', '2025-2026'],
  categories: ['tst-national', 'vmo-official', 'history-dn-qn'] });
assert.equal(evidence.length, 3);
assert.deepEqual(query.category.$in, ['tst-national', 'vmo-official', 'history-dn-qn']);
assert.equal(evidence.find(item => item.category === 'vmo').problems[0].excerpt, 'Câu 1');
const vmo = selectPredictionEvidence(predictionSettings({ targetType: 'vmo', year: '2026-2027', dayNumber: 2, lookback: 3 }), evidence);
assert.equal(vmo.ownExamCount, 1);
assert.deepEqual(vmo.missingYears, ['2025-2026', '2023-2024']);
const trend = selectTrendEvidence(trendAnalysisSettings({ mode: 'target', targetType: 'vmo', year: '2026-2027', lookback: 3 }), evidence);
assert.equal(trend.examCount, 1);
assert.equal(trend.questionCount, 1);
assert.equal(trend.yearCounts[0].year, '2024-2025');
assert.deepEqual(trend.missingYears, ['2025-2026', '2023-2024']);
console.log('Atlas-only exam evidence: OK');
