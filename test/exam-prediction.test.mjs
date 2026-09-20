import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { examStructure, predictionStructure, predictionSettings, selectPredictionEvidence } from '../lib/exam-prediction.js';
import { historicalExams } from '../data/exam-prediction-history.js';

const projectRoot = new URL('../', import.meta.url);
for (const path of ['src/content/tab-tst.html', 'src/content/tab-history.html']) {
  const source = new JSDOM(fs.readFileSync(new URL(path, projectRoot), 'utf8')).window.document;
  const present = new Set(Array.from(source.querySelectorAll('.exam-card[id]')).map(card => card.id));
  const category = path.includes('tab-tst') ? 'tst' : 'regional';
  assert.ok(historicalExams.filter(item => item.category === category).every(item => present.has(item.anchor)), 'Chỉ dùng nguồn lưu trữ còn trong ứng dụng');
}
assert.equal(historicalExams.filter(item => item.category === 'tst').length, 25);
assert.equal(examStructure[1].reduce((total, question) => total + question.maxScore, 0), 20);
assert.equal(examStructure[2].reduce((total, question) => total + question.maxScore, 0), 20);
assert.deepEqual(examStructure[2].map(item => item.questionNumber), [5, 6, 7]);
assert.deepEqual(predictionStructure('', 2), examStructure[2]);
assert.equal(predictionStructure('1 | 10 | Đại số\n2 | 10 | Hình học', 1).length, 2);
assert.throws(() => predictionStructure('1 | 10 | Đại số\n2 | 5 | Hình học', 1));

const settings = predictionSettings({ targetType: 'tst', targetAnchor: 'tst-da-nang', year: '2027-2028', dayNumber: 1, lookback: 10 });
settings.province = 'Đà Nẵng';
const evidence = selectPredictionEvidence(settings);
assert.ok(evidence.ownExamCount > 0, 'Đà Nẵng có đề lưu trữ trong 10 năm');
assert.ok(evidence.years.length < 10, 'Phải báo số năm có dữ liệu thực thay vì giả định đủ 10 năm');
assert.ok(evidence.years.every(year => Number(year.slice(0, 4)) < 2027 && Number(year.slice(0, 4)) >= 2017));
assert.ok(evidence.peerExamCount > 0, 'Dùng xu hướng TST 2026–2027');
const vmo = selectPredictionEvidence(predictionSettings({ targetType: 'vmo', year: '2027-2028', dayNumber: 2, lookback: 10 }));
assert.equal(vmo.ownExamCount, 0, 'Không nhầm đề thi thử với kho đề VMO chính thức');
assert.throws(() => predictionSettings({ targetType: 'tst', targetAnchor: 'tst-da-nang', year: '2027-2031', dayNumber: 1, lookback: 10 }));

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="sidebar-mock"><nav class="book-toc"><div class="nav-year-group"><a class="nav-link" href="#mock-set1-day1">01. Bộ 1</a><a class="nav-link" href="#mock-set2-day2">06. Bộ 2</a></div></nav></div>
  <div id="tab-mock"><div class="feed-container"></div></div>
  <div id="dataHubModal"><div class="vmo-modal-body"><div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div><div id="hub-panel-events"></div>
    <form id="formAddDoc" style="display:none"></form><form id="formAddExam" style="display:none"></form>
  </div></div>
</body></html>`, { url: 'https://example.test', runScripts: 'outside-only' });
const { window } = dom;
window.CSS ||= {};
window.CSS.escape ||= value => value;
window.VMOAuth = { getSession: () => ({ username: 'admin', role: 'admin' }) };
window.confirm = () => true;
window.alert = () => {};
window.VMODataService = {
  getCatalogProblems: async () => [], getContentSets: async () => [], getEvents: async () => [],
  getDocuments: async () => [], getExams: async () => [], getExamCatalog: async () => []
};
const root = new URL('../', import.meta.url);
window.eval(fs.readFileSync(new URL('tst-locations.js', root), 'utf8'));
window.eval(fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
window.openDataHubModal();
window.toggleAddExamForm();
const byId = id => window.document.getElementById(id);
assert.equal(byId('examPredictionTarget').options.length, 38);
byId('examCreationMode').value = 'prediction';
window.syncExamCreationMode();
assert.equal(byId('examImages').required, false);
assert.equal(byId('examImageBox').style.display, 'none');
byId('examPredictionType').value = 'tst';
byId('examPredictionTarget').value = 'tst-da-nang';
window.syncExamPredictionTarget();
assert.equal(byId('examRegion').value, 'TRUNG');
byId('examPredictionYear').value = '2027-2028';
byId('examDayNumber').value = '2';
let request;
window.fetch = async (_, options) => {
  request = JSON.parse(options.body);
  return { ok: true, json: async () => ({ success: true, data: {
    title: 'Đề dự đoán thử', model: 'test', reasoning: 'Có 3 năm nguồn.',
    evidence: { requestedYears: 10, years: ['2026-2027'], ownExamCount: 1, peerExamCount: 24, trendYear: '2026-2027', sources: [] },
    questions: examStructure[2].map(item => ({ ...item, content: `Xét bài toán mới ở câu ${item.questionNumber}: chứng minh kết luận này.` }))
  } }) };
};
await window.runPredictExam();
assert.equal(request.year, '2027-2028');
assert.equal(request.targetAnchor, 'tst-da-nang');
assert.equal(request.lookback, 10);
assert.equal(byId('examSaveButton').disabled, false);
let stored;
window.VMODataService.createExamFromOcr = async payload => { stored = payload; return { id: 'test', problemCount: 3 }; };
window.VMODataService.saveExamImage = async () => { throw new Error('Đề dự đoán không có ảnh OCR'); };
byId('examPredictionLookback').value = '9';
await window.handleCreateExam({ preventDefault() {}, target: byId('formAddExam') });
assert.equal(stored, undefined, 'Không lưu nếu đã đổi số năm sau khi AI tạo bản dự đoán');
byId('examPredictionLookback').value = '10';
await window.handleCreateExam({ preventDefault() {}, target: byId('formAddExam') });
assert.equal(stored.origin, 'prediction');
assert.equal(stored.sourceImageCount, 0);
assert.equal(stored.year, '2027-2028');
assert.equal(stored.questions.length, 3);
assert.equal(stored.predictionInfo.actualYears.length, 1);
console.log('Exam prediction evidence and form: OK');
