import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const locationsSource = fs.readFileSync(new URL('tst-locations.js', root), 'utf8');
const uiSource = fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="sidebar-tst"><div class="nav-year-group"><div class="nav-year-title">TST</div></div></div>
  <div id="sidebar-mock"><nav class="book-toc"></nav></div>
  <div id="sidebar-history"><div class="nav-year-group"><div class="nav-year-title">📙 QUẢNG NAM</div></div><div class="nav-year-group"><div class="nav-year-title">📘 ĐÀ NẴNG</div></div></div>
  <div id="tab-mock"><div class="feed-container"></div></div>
  <div id="tab-tst"><div class="feed-container"></div></div>
  <div id="tab-history"><div class="feed-container"></div></div>
  <div id="dataHubModal">
    <div class="vmo-modal-body">
      <div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div>
      <div id="hub-panel-events"><div id="hubEventsList"></div></div>
      <div id="hub-panel-docs"><div id="hubDocsList"></div></div>
      <div id="hub-panel-exams"><div id="hubExamsList"></div></div>
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
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb', examKey: 'mock:set-3:2026-2027:day-1',
    targetAnchor: 'mock-set3-day1', setNumber: 3, province: 'Đà Nẵng', year: '2026-2027', dayNumber: 1, title: 'Bộ 3',
    problems: [{ contentKey: 'mock:mock-set3-day1:question-1', questionNumber: 1, content: 'Đề thử' }]
  }, ...[[2, 2], [5, 1], [1, 2], [2, 1], [1, 1], [4, 1], [3, 2]].map(([setNumber, dayNumber]) => ({
    id: `mock-${setNumber}-${dayNumber}`, targetAnchor: `mock-set${setNumber}-day${dayNumber}`,
    setNumber, dayNumber, title: `Bộ ${setNumber}`,
    problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }))] : category === 'history-dn-qn' ? [{
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa', examKey: 'regional:da-nang:2026-2027:day-1',
    targetAnchor: 'hist-dn-2026-2027', province: 'Đà Nẵng', provinceOrder: 1,
    region: 'TRUNG', title: 'Đề Đà Nẵng 2026–2027', year: '2026-2027', dayNumber: 1,
    problems: [{ contentKey: 'danang_quangnam:hist-dn-2026-2027:day-1:question-1', questionNumber: 1,
      sourceGroup: 'danang_quangnam', sourceType: 'regional_question', content: 'Bài toán Đà Nẵng' }]
  }, ...[['Quảng Nam', '2017-2018', 'qn'], ['Đà Nẵng', '2015-2016', 'dn'],
    ['Quảng Nam', '2015-2016', 'qn'], ['Đà Nẵng', '2014-2015', 'dn']].map(([province, year, short]) => ({
    id: `regional-${short}-${year}`, targetAnchor: `hist-${short}-${year}`,
    province, year, region: 'TRUNG', title: `Đề ${province} ${year}`,
    problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }))] : [{
    id: 'exam-quang-tri', examKey: 'tst:quang-tri:2026-2027:day-1',
    targetAnchor: 'tst-quang-tri', province: 'Quảng Trị', provinceOrder: 21,
    region: 'TRUNG', title: 'Đề TST Quảng Trị', year: '2026-2027', dayNumber: 1,
    problems: [
      { contentKey: 'tst:tst-quang-tri:day-1:question-1', questionNumber: 1, content: 'Bài toán thử nghiệm',
        shortLabel: 'Câu 1 Đa thức – Dãy số', topic: 'Đa thức – Dãy số', maxScore: 5 },
      { contentKey: 'tst:tst-quang-tri:day-1:question-2', questionNumber: 2, content: 'Bài toán khác',
        shortLabel: 'Câu 2 (5,0đ) Phương trình hàm', topic: 'Phương trình hàm (5đ) Phương trình hàm' }
    ]
  }, {
    id: 'exam-thai-nguyen', examKey: 'tst:thai-nguyen:2026-2027:day-1',
    targetAnchor: 'tst-thai-nguyen', province: 'Tỉnh THÁI NGUYÊN', provinceOrder: 10,
    region: 'BAC', title: 'Đề Thái Nguyên', problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }, {
    id: 'exam-chuyen-khtn', examKey: 'tst:chuyen-khtn:2026-2027:day-1',
    targetAnchor: 'tst-chuyen-khtn', province: 'Tỉnh CHUYÊN KHTN HÀ NỘI', provinceOrder: 26,
    region: 'BAC', title: 'Đề Chuyên KHTN', problems: [{ questionNumber: 1, content: 'Đề thử' }]
  }, {
    id: 'exam-hung-yen', examKey: 'tst:hung-yen:2026-2027:day-1',
    targetAnchor: 'tst-hung-yen', province: 'Tỉnh Hưng Yên', provinceOrder: 14,
    region: 'BAC', title: 'Đề Hưng Yên', problems: [{ contentKey: 'tst:tst-hung-yen:question-1', questionNumber: 1, content: 'Đề thử' }]
  }]
};
const detailRequests = [];
window.VMODataService.getExamCatalogSummary = async category =>
  (await window.VMODataService.getExamCatalog(category)).map(({ problems, ...exam }) => ({
    ...exam, problemCount: problems.length
  }));
window.VMODataService.getExamCatalogDetail = async (category, anchor) => {
  detailRequests.push(`${category}:${anchor}`);
  return (await window.VMODataService.getExamCatalog(category)).filter(exam => exam.targetAnchor === anchor);
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
assert.deepEqual(detailRequests, ['tst-national:tst-quang-tri'], 'Lần mở tab chỉ tải chi tiết đề đầu tiên');
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
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-tst a.nav-link'), link => link.textContent), [
  '01. CHUYÊN KHTN HÀ NỘI', '02. Hưng Yên', '03. Quảng Trị', '04. THÁI NGUYÊN'
], 'Tên bỏ tiền tố Tỉnh, sắp theo chữ cái tiếng Việt và đánh số lại');
assert.equal(window.document.querySelector('#tst-hung-yen .problem-item'), null, 'Đề khác chỉ có metadata');
const hungYenPlaceholder = window.document.getElementById('tst-hung-yen');
await window.loadDatabaseExamDetail('tst-national', 'tst-hung-yen');
assert.equal(window.document.getElementById('tst-hung-yen'), hungYenPlaceholder, 'Chi tiết được gắn vào card đã hiện');
assert.ok(window.document.querySelector('#tst-hung-yen .problem-item'), 'Chọn đề sẽ tải câu hỏi');
await window.loadDatabaseExamDetail('tst-national', 'tst-hung-yen');
assert.equal(detailRequests.filter(key => key === 'tst-national:tst-hung-yen').length, 1, 'Chi tiết đã tải được tái sử dụng');
await window.loadDatabaseTstExams(true);
assert.equal(window.document.querySelectorAll('#sidebar-tst a[href="#tst-quang-tri"]').length, 1);
assert.equal(window.document.querySelector('#sidebar-tst a[href="#tst-quang-tri"]').textContent, '03. Quảng Trị');
await window.loadDatabaseMockExams(true);
assert.equal(detailRequests.filter(key => key.startsWith('vmo-mock:')).length, 1,
  'Mở tab thi thử chỉ lấy chi tiết một đề');
assert.ok(window.document.getElementById('mock-set3-day1'));
assert.ok(window.document.querySelector('#sidebar-mock a[href="#mock-set3-day1"]'));
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-mock .nav-year-title'), x => x.textContent),
  [1, 2, 3, 4, 5].map(n => `🎯 BỘ THI THỬ SỐ ${n}`));
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-mock a.nav-link'), x => x.getAttribute('href')),
  ['#mock-set1-day1', '#mock-set1-day2', '#mock-set2-day1', '#mock-set2-day2',
    '#mock-set3-day1', '#mock-set3-day2', '#mock-set4-day1', '#mock-set5-day1']);
await window.loadDatabaseMockExams(true);
assert.equal(window.document.querySelectorAll('#sidebar-mock a.nav-link').length, 8);
await window.loadDatabaseRegionalExams(true);
assert.equal(detailRequests.filter(key => key.startsWith('history-dn-qn:')).length, 1,
  'Mở tab khu vực chỉ lấy chi tiết một đề');
const regionalCard = window.document.getElementById('hist-dn-2026-2027');
assert.ok(regionalCard, 'Đề lưu trữ mới phải tự tạo card trong tab Đà Nẵng–Quảng Nam');
assert.equal(regionalCard.dataset.filter, 'DANANG');
assert.equal(regionalCard.querySelector('.problem-item').dataset.sourceType, 'regional_question');
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-history .nav-year-title'), x => x.textContent),
  ['📘 ĐÀ NẴNG', '📙 QUẢNG NAM']);
assert.deepEqual(Array.from(window.document.querySelectorAll('#sidebar-history a.nav-link'), x => x.getAttribute('href')),
  ['#hist-dn-2014-2015', '#hist-dn-2015-2016', '#hist-dn-2026-2027',
    '#hist-qn-2015-2016', '#hist-qn-2017-2018']);
assert.equal(window.document.querySelector('#sidebar-history a[href="#hist-dn-2026-2027"]').textContent,
  '03. Đà Nẵng 2026–2027');
await window.loadDatabaseRegionalExams(true);
assert.equal(window.document.querySelectorAll('#sidebar-history a.nav-link').length, 5);
const initialCatalog = window.VMODataService.getExamCatalog;
window.VMODataService.getExamCatalog = async category => category === 'tst-national'
  ? [...await initialCatalog(category), ...[
    ['tst-ptnk', 'PTNK TP.HCM', [1, 2]],
    ['tst-truong-he-danang', 'TRƯỜNG HÈ ĐÀ NẴNG', [1, 2]],
    ['tst-khtn', 'CHUYÊN KHTN HÀ NỘI', [1, 2, 3, 4]]
  ].flatMap(([anchor, province, days]) => days.map(dayNumber => ({
    id: `${anchor}-${dayNumber}`, examKey: `tst-national:${anchor}:day-${dayNumber}`,
    targetAnchor: anchor, province, dayNumber, region: 'BAC', title: province,
    problems: [{ contentKey: `tst:${anchor}:day-${dayNumber}:question-1`,
      questionNumber: 1, content: `Đề ngày ${dayNumber}` }]
  }))), {
    id: 'hanoi-full', examKey: 'tst:hanoi:2026-2027:day-1',
    targetAnchor: 'tst-ha-noi', province: 'HÀ NỘI', dayNumber: 1, region: 'BAC',
    problems: Array.from({ length: 8 }, (_, index) => ({
      contentKey: `tst:hanoi:full:${index + 1}`, questionNumber: index + 1, content: `Câu ${index + 1}`
    }))
  }, {
    id: 'hanoi-extra', examKey: 'tst:hanoi:duplicate:day-1',
    targetAnchor: 'tst-ha-noi', province: 'HÀ NỘI', dayNumber: 1, region: 'BAC',
    problems: [6, 7].map(number => ({
      contentKey: `tst:hanoi:extra:${number}`, questionNumber: number, content: `Câu trùng ${number}`
    }))
  }] : initialCatalog(category);
await window.loadDatabaseTstExams(true);
await window.loadDatabaseExamDetail('tst-national', 'tst-ha-noi');
assert.equal(window.document.querySelectorAll('#tst-ha-noi .db-exam-day').length, 1,
  'Hà Nội chỉ hiển thị một khối ngày thứ 1 dù Atlas có hai bản ghi');
assert.deepEqual(Array.from(window.document.querySelectorAll('#tst-ha-noi .problem-item'),
  item => Number(item.dataset.questionNumber)), [1, 2, 3, 4, 5, 6, 7, 8]);
for (const [anchor, expectedDays] of [
  ['tst-ptnk', [1, 2]], ['tst-truong-he-danang', [1, 2]], ['tst-khtn', [1, 2, 3, 4]]
]) {
  await window.loadDatabaseExamDetail('tst-national', anchor);
  assert.deepEqual(Array.from(window.document.querySelectorAll(`#${anchor} .db-exam-day`),
    section => Number(section.dataset.dayNumber)), expectedDays, `${anchor} phải có đủ ngày theo thứ tự`);
  assert.equal(window.document.querySelectorAll(`#sidebar-tst a[href="#${anchor}"]`).length, 1,
    'Mỗi địa phương chỉ có một liên kết sidebar');
}
const scrollTargets = [];
window.HTMLElement.prototype.scrollIntoView = function(options) { scrollTargets.push({ id: this.id, options }); };
window.requestAnimationFrame = callback => setTimeout(callback, 0);
const originalDetail = window.VMODataService.getExamCatalogDetail;
let releaseThaiNguyen;
const thaiNguyenGate = new Promise(resolve => { releaseThaiNguyen = resolve; });
window.VMODataService.getExamCatalogDetail = async (category, anchor) => {
  if (anchor === 'tst-thai-nguyen') await thaiNguyenGate;
  return originalDetail(category, anchor);
};
const thaiNguyenLink = window.document.querySelector('#sidebar-tst a[href="#tst-thai-nguyen"]');
const firstClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
thaiNguyenLink.dispatchEvent(firstClick);
assert.equal(firstClick.defaultPrevented, true, 'Ngăn browser cuộn vào placeholder trước khi tải');
assert.deepEqual(scrollTargets, [], 'Không cuộn trước khi dữ liệu về');
releaseThaiNguyen();
await new Promise(resolve => setTimeout(resolve, 20));
assert.deepEqual(scrollTargets.map(target => target.id), ['tst-thai-nguyen'], 'Một lần nhấp cuộn đúng đề sau khi tải');
assert.equal(scrollTargets[0].options.behavior, 'instant', 'Cuộn tức thời, không kế thừa smooth scrolling');
assert.equal(window.location.hash, '#tst-thai-nguyen');
thaiNguyenLink.click();
await new Promise(resolve => setTimeout(resolve, 20));
assert.deepEqual(scrollTargets.map(target => target.id), ['tst-thai-nguyen', 'tst-thai-nguyen'], 'Nhấp lại đề đã tải vẫn cuộn đúng');
let releaseHungYen;
const hungYenGate = new Promise(resolve => { releaseHungYen = resolve; });
window.VMODataService.getExamCatalogDetail = async (category, anchor) => {
  if (anchor === 'tst-hung-yen') await hungYenGate;
  return originalDetail(category, anchor);
};
window.document.querySelector('#sidebar-tst a[href="#tst-hung-yen"]').click();
window.document.querySelector('#sidebar-tst a[href="#tst-ptnk"]').click();
releaseHungYen();
await new Promise(resolve => setTimeout(resolve, 25));
assert.equal(scrollTargets.at(-1).id, 'tst-ptnk', 'Nhấp liên tiếp ưu tiên mục mới nhất');
assert.equal(window.location.hash, '#tst-ptnk');
for (const [sidebar, category, anchor] of [
  ['sidebar-history', 'history-dn-qn', 'hist-qn-2017-2018'],
  ['sidebar-mock', 'vmo-mock', 'mock-set5-day1']
]) {
  let releaseDetail;
  const detailGate = new Promise(resolve => { releaseDetail = resolve; });
  window.VMODataService.getExamCatalogDetail = async (requestedCategory, requestedAnchor) => {
    if (requestedCategory === category && requestedAnchor === anchor) await detailGate;
    return originalDetail(requestedCategory, requestedAnchor);
  };
  const link = window.document.querySelector(`#${sidebar} a[href="#${anchor}"]`);
  assert.ok(link, `Sidebar ${sidebar} có liên kết ${anchor}`);
  const priorScrolls = scrollTargets.length;
  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true, `${sidebar}: chặn cuộn vào placeholder`);
  assert.equal(scrollTargets.length, priorScrolls, `${sidebar}: chờ dữ liệu trước khi cuộn`);
  releaseDetail();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(scrollTargets.length, priorScrolls + 1, `${sidebar}: cuộn đúng một lần`);
  assert.equal(scrollTargets.at(-1).id, anchor);
  assert.equal(scrollTargets.at(-1).options.behavior, 'instant');
  assert.equal(scrollTargets.at(-1).options.block, 'start');
  assert.equal(window.location.hash, `#${anchor}`);
  link.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(scrollTargets.at(-1).id, anchor, `${sidebar}: nhấp lại vẫn cuộn đúng`);
}
assert.equal(fullTabTypesets, 0, 'loader MongoDB không được typeset lại toàn bộ tab');

let updatedExam;
let deletedExam;
window.VMODataService.updateExam = async (id, fields) => { updatedExam = { id, ...fields }; return updatedExam; };
window.VMODataService.deleteExam = async id => { deletedExam = id; return true; };
window.VMODataService.getExamCatalogSummary = async category =>
  (await window.VMODataService.getExamCatalog(category)).map(({ problems, ...exam }) => ({ ...exam, problemCount: problems.length }));
window.VMODataService.getExams = category => window.VMODataService.getExamCatalog(category);
window.switchHubTab('docs');
await new Promise(resolve => setTimeout(resolve, 20));
assert.ok(window.document.querySelector('#hubDocsList button[onclick*="editManagedExam"]'),
  'Admin có nút chỉnh sửa đề trong danh sách TST/Đà Nẵng–Quảng Nam');
window.editManagedExam('aaaaaaaaaaaaaaaaaaaaaaaa');
const examEditor = window.document.getElementById('managedExamEditor');
assert.ok(examEditor);
examEditor.elements.title.value = 'Đề Đà Nẵng đã sửa';
examEditor.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(updatedExam.title, 'Đề Đà Nẵng đã sửa');
assert.equal(updatedExam.id, 'aaaaaaaaaaaaaaaaaaaaaaaa');
await window.deleteManagedExam('aaaaaaaaaaaaaaaaaaaaaaaa');
assert.equal(deletedExam, 'aaaaaaaaaaaaaaaaaaaaaaaa');
window.switchHubTab('exams');
await new Promise(resolve => setTimeout(resolve, 20));
assert.ok(window.document.querySelector('#hubExamsList button[onclick*="editManagedExam"]'),
  'Admin có nút quản lý bộ đề thi thử');

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
