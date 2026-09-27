import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const locationsSource = fs.readFileSync(new URL('tst-locations.js', root), 'utf8');
const uiSource = fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="sidebar-tst"><div class="nav-year-group"><div class="nav-year-title">TST</div>${Array.from({ length: 25 }, (_, index) => `<a class="nav-link" href="#tst-existing-${index}">${String(index+1).padStart(2, '0')}. Tỉnh mẫu</a>`).join('')}</div></div>
  <div id="sidebar-mock"><nav class="book-toc"><div class="nav-year-group"><a class="nav-link" href="#mock-set1-day1">01. Bộ 1</a><a class="nav-link" href="#mock-set2-day2">06. Bộ 2</a></div></nav></div>
  <div id="sidebar-history"><div class="nav-year-group"><div class="nav-year-title">📘 ĐÀ NẴNG</div><a class="nav-link" href="#hist-dn-2025-2026">01. Đà Nẵng 2025–2026</a></div><div class="nav-year-group"><div class="nav-year-title">📙 QUẢNG NAM</div><a class="nav-link" href="#hist-qn-2022-2023">02. Quảng Nam 2022–2023</a></div></div>
  <div id="tab-mock"><div class="feed-container"></div></div>
  <div id="tab-tst"><div class="feed-container"></div></div>
  <div id="tab-history"><div class="feed-container"></div></div>
  <div id="dataHubModal">
    <div class="vmo-modal-body">
      <div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div>
      <div id="hub-panel-events"><div id="hubEventsList"></div></div>
      <form id="formAddDoc" style="display:none"></form>
      <form id="formAddExam" style="display:none"></form>
    </div>
  </div>
</body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });

const { window } = dom;
window.CSS ||= {};
window.CSS.escape ||= value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
window.VMOAuth = { getSession: () => ({ role: 'admin', username: 'admin' }) };
window.confirm = () => true;
window.alert = () => {};
window.VMODataService = {
  getCatalogProblems: async () => [],
  getContentSets: async () => [],
  getEvents: async () => [],
  getDocuments: async () => [],
  getExams: async () => [],
  getExamCatalog: async category => category === 'vmo-mock' ? [{
    id: 'mock-example', examKey: 'mock:set-3:2026-2027:day-1',
    targetAnchor: 'mock-set3-day1', setNumber: 3, province: 'Đà Nẵng', year: '2026-2027', dayNumber: 1, title: 'Bộ 3',
    problems: [{ contentKey: 'mock:mock-set3-day1:question-1', questionNumber: 1, content: 'Đề thử' }]
  }] : category === 'history-dn-qn' ? [{
    id: 'exam-danang-history', examKey: 'regional:da-nang:2026-2027:day-1',
    targetAnchor: 'hist-dn-2026-2027', province: 'Đà Nẵng', provinceOrder: 1,
    region: 'TRUNG', title: 'Đề Đà Nẵng 2026–2027', year: '2026-2027', dayNumber: 1,
    problems: [{ contentKey: 'danang_quangnam:hist-dn-2026-2027:day-1:question-1', questionNumber: 1,
      sourceGroup: 'danang_quangnam', sourceType: 'regional_question', content: 'Bài toán Đà Nẵng' }]
  }] : [{
    id: 'exam-quang-tri', examKey: 'tst:quang-tri:2026-2027:day-1',
    targetAnchor: 'tst-quang-tri', province: 'Quảng Trị', provinceOrder: 21,
    region: 'TRUNG', title: 'Đề TST Quảng Trị', year: '2026-2027', dayNumber: 1,
    problems: [
      { contentKey: 'tst:tst-quang-tri:day-1:question-1', questionNumber: 1, content: 'Bài toán thử nghiệm',
        shortLabel: 'Câu 1 Đa thức – Dãy số', topic: 'Đa thức – Dãy số', maxScore: 5 },
      { contentKey: 'tst:tst-quang-tri:day-1:question-2', questionNumber: 2, content: 'Bài toán khác',
        shortLabel: 'Câu 2 (5,0đ) Phương trình hàm', topic: 'Phương trình hàm (5đ) Phương trình hàm' }
    ]
  }]
};
window.eval(locationsSource);
window.eval(uiSource);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
let fullTabTypesets = 0;
window.renderMathInContainer = async () => { fullTabTypesets += 1; };

assert.equal(window.VMO_TST_LOCATIONS.filter(item => item.type === 'province').length, 34);
assert.equal(window.VMO_TST_LOCATIONS.filter(item => item.type === 'university_school').length, 4);

window.openDataHubModal();
window.toggleAddDocForm();
const select = window.document.getElementById('docTargetAnchor');
assert.equal(window.document.getElementById('docDayNumber').options.length, 4);
assert.deepEqual(Array.from(window.document.getElementById('docDestination').options).map(option => option.value), ['tst', 'regional']);
window.document.getElementById('docDestination').value = 'regional';
window.syncDocumentDestination();
assert.equal(window.document.getElementById('docRegionalTargetWrap').style.display, 'block');
assert.equal(select.required, false);
window.document.getElementById('docRegionalUnit').value = 'qn';
window.syncRegionalExamTarget();
assert.equal(window.document.getElementById('docProvince').value, 'Quảng Nam');
assert.equal(window.document.getElementById('docRegion').value, 'TRUNG');
window.document.getElementById('docDestination').value = 'tst';
window.syncDocumentDestination();
window.toggleAddExamForm();
assert.equal(window.document.getElementById('examDayNumber').options.length, 2);
assert.equal(window.document.getElementById('examSetNumber').value, '3');
assert.equal(select.options.length, 38, 'Dropdown phải đủ 34 tỉnh/thành và 4 trường chuyên đại học');
assert.deepEqual(Array.from(select.querySelectorAll('optgroup')).map(group => group.label), [
  '34 tỉnh/thành phố',
  'Trường chuyên trực thuộc đại học'
]);

select.value = 'tst-quang-tri';
window.syncExamProvinceFromTarget('doc');
assert.equal(window.document.getElementById('docProvince').value, 'Quảng Trị');
assert.equal(window.document.getElementById('docRegion').value, 'TRUNG');
assert.equal(window.document.getElementById('docRegionDisplay').value, 'Miền Trung');

await window.loadDatabaseTstExams(true);
const newCard = window.document.getElementById('tst-quang-tri');
assert.ok(newCard, 'Đề của tỉnh mới phải tự tạo card frontend');
assert.equal(newCard.dataset.filter, 'TRUNG');
const [firstQuestion, secondQuestion] = newCard.querySelectorAll('.problem-item');
assert.equal(firstQuestion.querySelector('.problem-id span:first-child').textContent, 'Câu 1 Đa thức – Dãy số');
assert.equal(firstQuestion.querySelector('.badge-topic').textContent, 'Đa thức – Dãy số');
assert.equal(firstQuestion.querySelector('.badge-topic').style.display, 'none', 'ẩn chuyên đề đã có trong nhãn');
assert.equal(firstQuestion.querySelector('.problem-header').textContent.match(/Đa thức – Dãy số/g).length, 2,
  'DOM giữ metadata chuyên đề cho AI');
assert.equal(secondQuestion.querySelector('.problem-id span:first-child').textContent, 'Câu 2 Phương trình hàm');
assert.equal(secondQuestion.querySelector('.badge-point').textContent.trim(), '(5đ)');
assert.equal(secondQuestion.querySelector('.badge-topic').textContent, 'Phương trình hàm');
assert.equal(secondQuestion.querySelector('.badge-topic').style.display, 'none');
assert.match(window.document.querySelector('#sidebar-tst a[href="#tst-quang-tri"]').textContent, /^26\. Tỉnh Quảng Trị$/, 'Tỉnh mới phải theo số thứ tự 25');
await window.loadDatabaseTstExams(true);
assert.equal(window.document.querySelectorAll('#sidebar-tst a[href="#tst-quang-tri"]').length, 1);
await window.loadDatabaseMockExams(true);
assert.ok(window.document.getElementById('mock-set3-day1'));
assert.ok(window.document.querySelector('#sidebar-mock a[href="#mock-set3-day1"]'));
await window.loadDatabaseRegionalExams(true);
const regionalCard = window.document.getElementById('hist-dn-2026-2027');
assert.ok(regionalCard, 'Đề lưu trữ mới phải tự tạo card trong tab Đà Nẵng–Quảng Nam');
assert.equal(regionalCard.dataset.filter, 'DANANG');
assert.equal(regionalCard.querySelector('.problem-item').dataset.sourceType, 'regional_question');
assert.match(window.document.querySelector('#sidebar-history a[href="#hist-dn-2026-2027"]').textContent, /^02\. Đà Nẵng 2026–2027$/);
assert.match(window.document.querySelector('#sidebar-history a[href="#hist-qn-2022-2023"]').textContent, /^03\. Quảng Nam 2022–2023$/);
assert.equal(fullTabTypesets, 0, 'loader MongoDB không được typeset lại toàn bộ tab');

const mathPreview = window.document.createElement('div');
window.document.body.appendChild(mathPreview);
window.MathJax = {
  typesetClear: () => {},
  typesetPromise: async nodes => {
    nodes[0].innerHTML = '<mjx-merror>Math input error</mjx-merror>';
  }
};
const rawFormula = 'Câu hỏi gốc: $\\badcommand{x}$';
window.safeRenderMathJaxToElement(mathPreview, rawFormula);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(mathPreview.textContent, rawFormula, 'công thức lỗi phải hiển thị nguyên bản gốc');
assert.ok(mathPreview.classList.contains('tex2jax_ignore'), 'fallback không bị typeset lại');

console.log('TST and Đà Nẵng–Quảng Nam dynamic exam smoke test: OK');
