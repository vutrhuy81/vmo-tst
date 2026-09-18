import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const locationsSource = fs.readFileSync(new URL('tst-locations.js', root), 'utf8');
const uiSource = fs.readFileSync(new URL('vmo_db_ui.js', root), 'utf8');

const dom = new JSDOM(`<!doctype html><html><body>
  <div id="sidebar-tst"><div class="nav-year-group"><div class="nav-year-title">TST</div></div></div>
  <div id="tab-tst"></div>
  <div id="dataHubModal">
    <div class="vmo-modal-body">
      <div class="hub-tabs"><button class="hub-tab-btn" id="hub-tab-events"></button></div>
      <div id="hub-panel-events"><div id="hubEventsList"></div></div>
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
  getExamCatalog: async () => [{
    id: 'exam-quang-tri', examKey: 'tst:quang-tri:2026-2027:day-1',
    targetAnchor: 'tst-quang-tri', province: 'Quảng Trị', provinceOrder: 21,
    region: 'TRUNG', title: 'Đề TST Quảng Trị', year: '2026-2027', dayNumber: 1,
    problems: [{ contentKey: 'tst:tst-quang-tri:day-1:question-1', questionNumber: 1, content: 'Bài toán thử nghiệm' }]
  }]
};
window.eval(locationsSource);
window.eval(uiSource);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

assert.equal(window.VMO_TST_LOCATIONS.filter(item => item.type === 'province').length, 34);
assert.equal(window.VMO_TST_LOCATIONS.filter(item => item.type === 'university_school').length, 4);

window.openDataHubModal();
window.toggleAddExamForm();
const select = window.document.getElementById('examTargetAnchor');
assert.equal(select.options.length, 38, 'Dropdown phải đủ 34 tỉnh/thành và 4 trường chuyên đại học');
assert.deepEqual(Array.from(select.querySelectorAll('optgroup')).map(group => group.label), [
  '34 tỉnh/thành phố',
  'Trường chuyên trực thuộc đại học'
]);

select.value = 'tst-quang-tri';
window.syncExamProvinceFromTarget();
assert.equal(window.document.getElementById('examProvince').value, 'Quảng Trị');
assert.equal(window.document.getElementById('examRegion').value, 'TRUNG');
assert.equal(window.document.getElementById('examRegionDisplay').value, 'Miền Trung');

await window.loadDatabaseTstExams(true);
const newCard = window.document.getElementById('tst-quang-tri');
assert.ok(newCard, 'Đề của tỉnh mới phải tự tạo card frontend');
assert.equal(newCard.dataset.filter, 'TRUNG');
assert.ok(window.document.querySelector('#sidebar-tst a[href="#tst-quang-tri"]'), 'Tỉnh mới phải tự sinh liên kết sidebar');

console.log('TST locations smoke test: OK');
