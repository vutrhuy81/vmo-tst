import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const tstLinks = Array.from({ length: 25 }, (_, i) =>
  `<a class="nav-link" href="#tst-static-${i + 1}"></a>`).join('');
const regionalLinks = Array.from({ length: 15 }, (_, i) =>
  `<a class="nav-link" href="#hist-dn-static-${i + 1}"></a>`).join('');
const mockLinks = Array.from({ length: 2 }, (_, setIndex) =>
  Array.from({ length: 2 }, (_, dayIndex) =>
    `<a class="nav-link" href="#mock-set${setIndex + 1}-day${dayIndex + 1}"></a>`).join('')).join('');
const chapters = Array.from({ length: 9 }, (_, i) =>
  `<section class="chapter-block" data-chapter="${i + 1}"></section>`).join('');
const theory = '<div class="theorybox"></div>'.repeat(39);

const dom = new JSDOM(`<!doctype html><html><body>
  <span data-catalog-stat="tst"></span>
  <span data-catalog-stat="regional"></span>
  <span data-catalog-stat="chapters"></span>
  <span data-catalog-stat="theory"></span>
  <span data-catalog-stat="examples"></span>
  <span data-catalog-stat="mock"></span>
  <span data-catalog-stat="mockSets"></span>
  <nav id="sidebar-tst">${tstLinks}</nav>
  <nav id="sidebar-history">${regionalLinks}</nav>
  <nav id="sidebar-mock">${mockLinks}</nav>
  <main id="book-content">
    <section class="chapter-block" data-chapter="meta"></section>
    ${chapters}${theory}
  </main>
</body></html>`, { runScripts: 'outside-only', url: 'https://example.test/' });

const { window } = dom;
window.scrollTo = () => {};
window.VMODataService = {
  getHomeStats: async () => ({
    specialtyExamples: 78,
    exams: [
      { category: 'tst-national', targetAnchor: 'tst-static-1' }, // trùng catalog tĩnh
      ...Array.from({ length: 7 }, (_, i) => ({ category: 'tst-national', targetAnchor: `tst-dynamic-${i + 26}` })),
      { category: 'history-dn-qn', targetAnchor: 'hist-dn-static-1' }, // trùng catalog tĩnh
      { category: 'history-dn-qn', targetAnchor: 'hist-qn-dynamic-16' },
      { category: 'vmo-mock', targetAnchor: 'mock-set1-day1' }, // trùng catalog tĩnh
      { category: 'vmo-mock', targetAnchor: 'mock-set3-day1' },
      { category: 'vmo-mock', targetAnchor: 'mock-set4-day2' },
      { category: 'vmo-mock', targetAnchor: 'mock-set5-day1' }
    ]
  })
};
window.eval(appSource);
await window.refreshVMOCatalogStats();

const value = key => window.document.querySelector(`[data-catalog-stat="${key}"]`).textContent;
assert.equal(value('tst'), '08', 'chỉ đếm 8 đề TST từ MongoDB, không tính 25 link HTML');
assert.equal(value('regional'), '02', 'chỉ đếm 2 đề ĐN–QN từ MongoDB, không tính 15 link HTML');
assert.equal(value('chapters'), '09', 'không tính khối metadata là chương');
assert.equal(value('theory'), '39', 'phải đếm đúng mục lý thuyết thực tế');
assert.equal(value('examples'), '78', 'số ví dụ có lời giải trên MongoDB phải là nguồn chính thức');
assert.equal(value('mock'), '04', 'chỉ đếm bốn bộ đề thử từ MongoDB, không tính link HTML');
assert.equal(value('mockSets'), '04', 'dashboard phải dùng số bộ đề thi thử trong MongoDB');

const apiSource = fs.readFileSync(path.join(root, 'api/data.js'), 'utf8');
assert.match(apiSource, /resource === 'home_stats'/, 'API phải có tài nguyên thống kê nhẹ');
assert.match(apiSource, /projection:[\s\S]*targetAnchor:[\s\S]*setNumber:[\s\S]*dayNumber:/,
  'API thống kê không được tải toàn bộ nội dung đề/câu hỏi');
assert.match(apiSource, /sourceType: 'specialty_example'[\s\S]*referenceSolution:/,
  'API phải đếm ví dụ có lời giải trực tiếp trên MongoDB');

const templateSource = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
assert.match(templateSource, /data-catalog-stat="mock">—<\/span><span class="label">Bộ đề thi thử<\/span>/,
  'nhãn thống kê phải thể hiện số bộ đề, không phải số buổi/ngày');

console.log('catalog-stats tests passed');
