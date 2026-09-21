import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  TREND_TOPICS, approvedTrendReview, classifyTrendTopic, normalizeTrendReport,
  selectTrendEvidence, trendAnalysisSettings
} from '../lib/exam-trends.js';

assert.equal(classifyTrendTopic('Phương trình hàm – Cauchy'), 'Phương trình hàm');
assert.equal(classifyTrendTopic('Số học – Dãy số nguyên'), 'Số học và dãy số');
assert.equal(classifyTrendTopic('Dãy số – Giới hạn'), 'Dãy số và Giới hạn dãy số');
assert.equal(classifyTrendTopic('Hình học đường tròn'), 'Hình học phẳng');
assert.equal(classifyTrendTopic('Đa thức – nghiệm'), 'Đa thức');
assert.equal(classifyTrendTopic('Tổ hợp – Trò chơi'), 'Tổ hợp');
assert.equal(classifyTrendTopic('Bất đẳng thức'), '');

const yearSettings = trendAnalysisSettings({ mode: 'year', year: '2026-2027' });
const yearEvidence = selectTrendEvidence(yearSettings);
assert.equal(yearEvidence.examCount, 25, 'Phân tích theo năm phải dùng đủ 25 đề TST tĩnh');
assert.equal(yearEvidence.topicStats.length, 6);
assert.equal(yearEvidence.topicStats.reduce((sum, item) => sum + item.questionCount, 0) + yearEvidence.otherQuestionCount,
  yearEvidence.questionCount, 'Mỗi câu phải được tính đúng một lần hoặc nằm ngoài 6 tiêu chí');
assert.ok(yearEvidence.samples.every(item => item.sourceId && item.excerpt));

const targetSettings = trendAnalysisSettings({
  mode: 'target', year: '2026-2027', targetType: 'tst', targetAnchor: 'tst-da-nang',
  province: 'Đà Nẵng', lookback: 10
});
const targetEvidence = selectTrendEvidence(targetSettings);
assert.ok(targetEvidence.examCount >= 5, 'Có dữ liệu lịch sử Đà Nẵng để phân tích');
assert.deepEqual(targetEvidence.historyMembers, ['Quảng Nam', 'Đà Nẵng']);
assert.deepEqual(new Set(targetEvidence.sources.map(item => item.historicalUnit)), new Set(['ĐÀ NẴNG', 'QUẢNG NAM']),
  'Phân tích Đà Nẵng phải bao gồm dữ liệu lịch sử Quảng Nam');
assert.equal(targetEvidence.unitCount, 1, 'Đà Nẵng và Quảng Nam phải được quy về một đơn vị hiện hành');
assert.ok(targetEvidence.years.every(year => Number(year.slice(0, 4)) < 2026 && Number(year.slice(0, 4)) >= 2016));
assert.throws(() => trendAnalysisSettings({ mode: 'target', year: '2026-2027', targetType: 'tst', lookback: 10 }));
assert.throws(() => trendAnalysisSettings({ mode: 'year', year: '2026-2030' }));

const practiceSample = yearEvidence.samples.find(item => item.criterion === 'Dãy số và Giới hạn dãy số');
assert.ok(practiceSample, 'Cần có câu nguồn để kiểm thử chế độ luyện tập');
const rawReport = {
  title: 'Xu hướng thử', executiveSummary: 'Tóm tắt',
  topicTrends: TREND_TOPICS.map(topic => ({ topic, questionCount: 999, prevalencePercent: 999,
    trendLevel: 'Cao', observations: 'Nhận xét', frequentMethods: topic === practiceSample.criterion ? [{
      name: 'Dãy số xác định bởi nghiệm duy nhất của dãy phương trình', frequency: 99,
      evidenceIds: [practiceSample.sourceId, practiceSample.sourceId, 'khong-ton-tai:2026-2027:0:1'], note: 'Luyện tập'
    }] : [] })),
  recurringPatterns: [], unitInsights: [], limitations: [], conclusion: 'Kết luận'
};
const normalizedReport = normalizeTrendReport(rawReport, yearEvidence);
assert.deepEqual(normalizedReport.topicTrends.map(item => item.questionCount), yearEvidence.topicStats.map(item => item.questionCount),
  'Số liệu do server tính phải ghi đè số liệu AI');
const normalizedMethod = normalizedReport.topicTrends.find(item => item.topic === practiceSample.criterion).frequentMethods[0];
assert.deepEqual(normalizedMethod.evidenceIds, [practiceSample.sourceId], 'Phải bỏ mã trùng và mã không tồn tại');
assert.equal(normalizedMethod.frequency, 1, 'Tần suất phải bằng số câu truy nguyên được');
const validReview = {
  approved: true, score: 4.6, countsConsistent: true, evidenceFaithful: true,
  sixTopicsCovered: true, noUnsupportedClaims: true, criticalIssues: [],
  topicChecks: TREND_TOPICS.map(topic => ({ topic, valid: true }))
};
assert.equal(approvedTrendReview(validReview), true);
assert.equal(approvedTrendReview({ ...validReview, criticalIssues: ['Dẫn chứng sai'] }), false);
assert.equal(approvedTrendReview({ ...validReview, topicChecks: validReview.topicChecks.slice(0, 5) }), false);

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="dataHubModal"><div class="vmo-modal-container"><div class="vmo-modal-title"><span></span><span></span></div><div class="vmo-modal-body"><div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div><div id="hub-panel-events"></div>
  <form id="formAddDoc" style="display:none"></form><form id="formAddExam" style="display:none"></form></div></div></div>
</body></html>`, { url: 'https://example.test', runScripts: 'outside-only' });
const { window } = dom;
window.CSS ||= {};
window.CSS.escape ||= value => value;
window.VMOAuth = { getSession: () => ({ username: 'admin', role: 'admin' }) };
window.confirm = () => true;
window.alert = () => {};
let savedPayload;
window.VMODataService = {
  getCatalogProblems: async () => [], getContentSets: async () => [], getEvents: async () => [],
  getDocuments: async () => [], getExams: async () => [], getExamCatalog: async () => [],
  getExamTrendReports: async () => [], saveExamTrendReport: async payload => {
    savedPayload = payload; return { id: '507f1f77bcf86cd799439011', createdAt: new Date().toISOString() };
  }
};
const root = new URL('../', import.meta.url);
window.eval(fs.readFileSync(new URL('tst-locations.js', root), 'utf8'));
window.eval(fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
window.openDataHubModal();
assert.ok(window.document.getElementById('hub-tab-trends'), 'Admin phải thấy tab AI xu hướng đề');
window.switchHubTab('trends');
const byId = id => window.document.getElementById(id);
assert.equal(byId('trendTarget').options.length, 38);
const resultData = {
  settings: yearSettings, evidence: yearEvidence, report: normalizedReport, model: 'gemini-test',
  generatedAt: new Date().toISOString(), quality: {
    status: 'rejected', verified: false, score: 3.5, summary: 'Một dẫn chứng chưa đủ mạnh.',
    criticalIssues: ['Tần suất phương pháp A chưa được chứng minh.'], corrections: ['Bổ sung mã nguồn.'],
    topicChecks: [], verifierModel: 'gpt-test', pipeline: 'Gemini → GPT'
  }
};
let requestBody;
window.fetch = async (_, options) => {
  requestBody = JSON.parse(options.body);
  return { ok: true, json: async () => ({ success: true, data: resultData }) };
};
await window.runExamTrendAnalysis();
assert.equal(requestBody.mode, 'year');
assert.equal(requestBody.year, '2026-2027');
assert.equal(byId('trendSaveButton').disabled, false, 'GPT bác vẫn phải cho admin lưu báo cáo Gemini');
assert.match(byId('trendResult').textContent, /GPT chưa duyệt/);
assert.match(byId('trendResult').textContent, /Tần suất phương pháp A/);
const parsedPracticeId = practiceSample.sourceId.split(':');
const practiceQuestionNumber = Number(parsedPracticeId.pop());
parsedPracticeId.pop();
parsedPracticeId.pop();
const practiceAnchor = parsedPracticeId.join(':');
const sourceRoot = window.document.createElement('div');
sourceRoot.id = 'tab-tst';
sourceRoot.className = 'tab-pane';
sourceRoot.innerHTML = `<article class="exam-card" id="${practiceAnchor}"><div class="exam-header"><div class="exam-top-tags"><span class="tag tag-year">2026-2027</span><span class="tag tag-province">ĐƠN VỊ THỬ</span></div><h3 class="exam-title">ĐỀ NGUỒN THỬ</h3></div><div class="exam-body">${Array.from({ length: practiceQuestionNumber }, (_, index) => `<div class="problem-item"><div class="problem-header"><div class="problem-id"><span>Câu ${index + 1}</span><span class="badge-topic">Dãy số</span></div><button class="btn-copy">📋 Sao chép</button></div><div class="problem-content">Nội dung đầy đủ câu ${index + 1}</div>${index + 1 === practiceQuestionNumber ? '<div class="solution-box source-solution-box"><button class="toggle-btn">🔗 Lời giải tham khảo</button><div class="solution-content"><a href="https://example.test/solution">Nguồn thử</a></div></div>' : ''}</div>`).join('')}</div></article>`;
window.document.body.appendChild(sourceRoot);
window.ensureVMOTabContent = async () => sourceRoot;
window.injectTstSources = () => {};
window.toggleSolution = () => {};
window.renderMathInContainer = async () => {};
window.reinitAIGuide = rootElement => rootElement.querySelectorAll('.problem-header').forEach(header => {
  if (!header.querySelector('.btn-ai-guide')) header.insertAdjacentHTML('beforeend', '<button class="btn-ai-guide">AI Hướng dẫn giải</button>');
});
const practiceButton = byId('trendResult').querySelector('.trend-practice-button');
assert.ok(practiceButton, 'Vi chủ đề phải có nút luyện tập');
practiceButton.click();
await new Promise(resolve => setTimeout(resolve, 20));
const practiceModal = byId('trendPracticeModal');
assert.ok(practiceModal.classList.contains('active'));
assert.match(practiceModal.textContent, /Nội dung đầy đủ câu/);
assert.ok(practiceModal.querySelector('.btn-ai-guide'), 'Phải giữ AI Hướng dẫn giải');
assert.ok(practiceModal.querySelector('.btn-submit-solution'), 'Phải giữ Nộp bài giải');
assert.ok(practiceModal.querySelector('.source-solution-box'), 'Phải giữ Lời giải tham khảo');
assert.ok(practiceModal.querySelector('.btn-manage-reference-links'), 'Admin phải có Quản lý nguồn');
await window.saveExamTrendReport();
assert.equal(savedPayload.quality.status, 'rejected');
assert.equal(savedPayload.report.topicTrends.length, 6);
console.log('Exam trend analysis and admin UI: OK');
