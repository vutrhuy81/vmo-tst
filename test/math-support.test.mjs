import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { JSDOM } from 'jsdom';
import { handleMathSupport } from '../lib/math-support.js';
import { canAccessProblem, supportVisibility } from '../lib/problem-access.js';
import { retrieveVerifiedContext } from '../lib/rag-retrieval.js';
import { sourceFresh } from '../lib/rag-core.js';

// Isolated database with real BSON identities and the operators used by the routes.
const rows = new Map();
let failImageOnce = false;
function match(row, query = {}) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(part => match(row, part));
    if (key === '$and') return value.every(part => match(row, part));
    const actual = key.split('.').reduce((item, path) => item?.[path], row);
    if (value && typeof value === 'object' && !(value instanceof ObjectId) && !(value instanceof Date)) {
      if ('$regex' in value) return new RegExp(value.$regex, value.$options).test(actual || '');
      return Object.entries(value).every(([op, operand]) => {
        if (op === '$ne') return String(actual) !== String(operand);
        if (op === '$in') return operand.some(item => String(item) === String(actual));
        if (op === '$exists') return (actual !== undefined) === operand;
        throw new Error(`Unsupported operator ${op}`);
      });
    }
    return String(actual) === String(value);
  });
}
const cursor = items => ({ items: items.slice(), sort(spec) { this.items.sort((a,b) => { for (const [key, dir] of Object.entries(spec)) { if (a[key] > b[key]) return dir; if (a[key] < b[key]) return -dir; } return 0; }); return this; },
  skip(n) { this.items = this.items.slice(n); return this; }, limit(n) { this.items = this.items.slice(0,n); return this; }, async toArray() { return this.items; } });
const db = { collection(name) {
  if (!rows.has(name)) rows.set(name, []);
  const items = rows.get(name);
  function update(query, changes, options = {}) {
    let row = items.find(item => match(item, query));
    if (!row && options.upsert) { row = { _id: new ObjectId(), ...query, ...changes.$setOnInsert }; items.push(row); }
    if (!row) return null;
    Object.assign(row, changes.$set); return row;
  }
  return {
    createIndex: async () => {}, find: query => cursor(items.filter(item => match(item, query))),
    findOne: async query => items.find(item => match(item, query)) || null,
    countDocuments: async query => items.filter(item => match(item, query)).length,
    findOneAndUpdate: async (query, changes, options) => update(query, changes, options),
    updateOne: async (query, changes, options) => {
      if (name === 'math_support_images' && failImageOnce) { failImageOnce = false; throw new Error('Simulated interrupted image save'); }
      return { matchedCount: update(query, changes, options) ? 1 : 0 };
    },
    insertOne: async row => { row._id ||= new ObjectId(); items.push(row); return { insertedId: row._id }; }
  };
} };
let session = { sub: 'owner-1', username: 'student1', role: 'student' };
const owner = { ...session }, other = { sub: 'owner-2', username: 'student2', role: 'student' }, admin = { sub: 'admin-1', username: 'admin', role: 'admin' };
const routeSource = fs.readFileSync(new URL('../api/data.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export default async function handler', 'async function handler');
const handler = new Function('getDb','getSession','ObjectId','recordActivity','handleMathSupport','canAccessProblem','supportVisibility', `${routeSource}\nreturn handler;`)(
  async () => db, () => session, ObjectId, async () => {}, handleMathSupport, canAccessProblem, supportVisibility);
async function call({ action, payload, query } = {}) {
  const res = { code: 0, setHeader() {}, status(n) { this.code = n; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
  await handler({ method: action ? 'POST' : 'GET', query, body: { action, payload } }, res);
  return res;
}
const image = 'data:image/png;base64,iVBORw0KGgo=';
const payload = { uploadKey: randomUUID(), title: 'Bất đẳng thức', topic: 'Đại số', maxScore: 5, image, content: 'Chứng minh $a^2+b^2\\ge 2ab$.' };
const create = value => call({ action: 'create_math_support', payload: value });
const first = await create({ ...payload, ownerId: other.sub });
assert.equal(first.code, 201); assert.equal(first.body.item.ownerId, owner.sub, 'Ownership is taken from signed session');
assert.equal(first.body.item.referenceSolutionVerified, false);
assert.equal((await create({ ...payload, content: 'Retry cannot overwrite saved statement' })).body.item.content, payload.content);
assert.equal(rows.get('problems').length, 1, 'Saving twice does not duplicate the problem');
assert.equal(rows.get('math_support_images').length, 1);
for (const invalid of [{ content: '' }, { image: 'data:text/html;base64,YQ==' }, { image: `data:image/png;base64,${'a'.repeat(3_000_000)}` }, { uploadKey: '../other' }, { maxScore: 0 }, { maxScore: 21 }]) {
  assert.equal((await create({ ...payload, ...invalid })).code, 400);
}
const p = first.body.item, id = p._id;
session = other;
assert.equal((await call({ query: { resource: 'math_support' } })).body.items.length, 0);
assert.equal((await call({ query: { resource: 'problems', contentKey: p.contentKey } })).body.items.length, 0, 'Generic catalog endpoint also respects ownership');
assert.equal((await call({ query: { resource: 'math_support_image', problemId: id } })).code, 404);
assert.equal((await call({ action: 'submit_solution', payload: { problemId: p.contentKey, solutionContent: 'Bài giải' } })).code, 403);
assert.equal((await call({ action: 'update_catalog_content', payload: { id, content: 'Bài sửa' } })).code, 403);
assert.equal((await retrieveVerifiedContext({ problemRef: p.contentKey, statement: 'client', session }, { db })).blocked, true, 'Other accounts cannot fetch canonical statement through AI');
session = owner;
assert.equal((await call({ query: { resource: 'math_support_image', problemId: id } })).body.item.image, image);
const submitted = await call({ action: 'submit_solution', payload: { problemId: p.contentKey, solutionContent: 'Ta có $(a-b)^2\\ge0$.' } });
assert.equal(submitted.code, 201); assert.equal(submitted.body.item.problemSnapshot.content, payload.content);
assert.equal(submitted.body.item.sourceGroup, 'math_support');
const updated = await call({ action: 'update_catalog_content', payload: { id, content: 'Nội dung đã sửa $x^2$.', expectedVersion: 1,
  referenceLinks: [{ label: 'Nguồn', url: 'https://example.test/math' }], referenceSolution: 'Bài giải', referenceSolutionVerified: true } });
assert.equal(updated.code, 200); assert.equal(updated.body.item.version, 2);
assert.equal(rows.get('problems')[0].referenceSolutionVerified, false, 'Owner cannot mark a solution verified');
assert.equal((await call({ action: 'update_catalog_content', payload: { id, content: 'Stale edit', expectedVersion: 1 } })).code, 409);
assert.equal(rows.get('content_revisions').length, 1);
rows.get('problems').push({ _id: new ObjectId(), contentKey: 'exam:regular', status: 'published', sourceGroup: 'tst' });
assert.equal((await call({ action: 'update_catalog_content', payload: { id: String(rows.get('problems')[1]._id), content: 'Unauthorized' } })).code, 403, 'Owners cannot edit exam catalogs');
for (let i = 0; i < 10; i++) assert.equal((await create({ ...payload, uploadKey: randomUUID(), title: `Bài ${i}` })).code, 201);
const page = await call({ query: { resource: 'math_support', page: '2' } });
assert.equal(page.body.pagination.total, 11); assert.equal(page.body.items.length, 1);
assert.equal(page.body.items[0].image, undefined, 'List does not include image bytes');
assert.equal((await call({ query: { resource: 'math_support', q: 'Bài 9' } })).body.items.length, 1);
session = other;
await create({ ...payload, uploadKey: randomUUID() });
session = admin;
assert.equal((await call({ query: { resource: 'math_support' } })).body.pagination.total, 12);
assert.equal((await call({ query: { resource: 'math_support_image', problemId: id } })).code, 200);
assert.equal(sourceFresh({}, { adminVerified: true, solutionContent: 'Verified' }, rows.get('problems')[0]), false, 'Private uploads never become shared RAG sources');
session = null;
assert.equal((await create(payload)).code, 401);
session = owner;
const interruptedUpload = { ...payload, uploadKey: randomUUID() };
const countBeforeRetry = rows.get('problems').length;
failImageOnce = true;
const originalError = console.error;
try { console.error = () => {}; assert.equal((await create(interruptedUpload)).code, 500); }
finally { console.error = originalError; }
assert.equal((await create(interruptedUpload)).code, 201);
assert.equal(rows.get('problems').length, countBeforeRetry + 1, 'Retry after image-save failure repairs the upload without duplicating the problem');

// Real client service -> real route -> isolated DB -> rendered card and existing actions.
const html = fs.readFileSync(new URL('../src/content/tab-support.html', import.meta.url), 'utf8');
const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: 'outside-only', url: 'https://math.test' });
const { window } = dom;
window.CSS ||= {}; window.CSS.escape ||= value => String(value);
window.VMOAuth = { getSession: () => ({ username: owner.username, role: owner.role }) };
window.confirm = () => true; window.alert = () => {};
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.scrollTo = () => {};
window.fetch = async (url, options = {}) => {
  let res;
  if (String(url).startsWith('/api/ai-ocr-math')) {
    assert.equal(JSON.parse(options.body).image, image);
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true, data: { latexText: payload.content, confidence: 'high' } }) };
  }
  const parsed = new URL(url, window.location.href);
  res = await call(options.method === 'POST' ? JSON.parse(options.body) : { query: Object.fromEntries(parsed.searchParams) });
  return { ok: res.code < 400, status: res.code, headers: { get: () => 'application/json' }, json: async () => res.body };
};
window.eval(fs.readFileSync(new URL('../vmo_data_service.js', import.meta.url), 'utf8').replace(/^export /gm, ''));
window.eval(fs.readFileSync(new URL('../vmo_db_ui.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../ai_guide_engine.js', import.meta.url), 'utf8'));
window.eval(fs.readFileSync(new URL('../math_support.js', import.meta.url), 'utf8'));
await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
window.document.body.insertAdjacentHTML('beforeend', '<div id="sidebar-support" style="display:none"></div><div id="sidebar-danang"></div>');
window.eval(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
await window.switchTab('tab-support');
assert.equal(window.document.getElementById('sidebar-support').style.display, 'block');
assert.equal(window.document.getElementById('sidebar-danang').style.display, 'none');
assert.ok(window.document.getElementById('tab-support').classList.contains('active'));
// Bypass browser image decoding only; all OCR/save/service/actions below remain real.
const safePreview = window.document.createElement('div');
window.safeRenderMathJaxToElement(safePreview, '$<img src=x onerror=alert(1)>$');
assert.equal(safePreview.querySelector('img'), null, 'Math delimiters must not allow HTML injection');
window.prepareMathSupportImage = async () => image;
const fileInput = window.document.getElementById('supportImage');
Object.defineProperty(fileInput, 'files', { value: [new window.File(['png'], 'math.png', { type: 'image/png' })] });
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
fileInput.dispatchEvent(new window.Event('change')); await tick();
window.document.getElementById('supportOcrButton').click(); await tick();
assert.equal(window.document.getElementById('supportContent').value, payload.content);
assert.equal(window.document.getElementById('supportOcrEditor').hidden, false);
window.document.getElementById('supportContent').value = 'Đề đã được kiểm tra $a+b$.';
window.document.getElementById('mathSupportForm').reportValidity = () => true;
window.document.getElementById('mathSupportForm').dispatchEvent(new window.Event('submit', { cancelable: true })); await tick(); await tick();
assert.match(window.document.getElementById('supportUploadStatus').textContent, /Đã lưu bài toán/);
const card = window.document.querySelector('#supportProblems .problem-item');
assert.ok(card); assert.equal(card.dataset.sourceGroup, 'math_support');
assert.ok(card.querySelector('.btn-copy')); assert.ok(card.querySelector('.btn-submit-solution'));
assert.ok(card.querySelector('.btn-ai-guide')); assert.ok(card.querySelector('.btn-manage-reference-links'), 'Regular uploader has source manager');
assert.match(card.querySelector('.problem-content').textContent, /Đề đã được kiểm tra/);
card.querySelector('.btn-manage-reference-links').click(); await tick();
assert.equal(window.document.getElementById('referenceManagerProblemContent').value, 'Đề đã được kiểm tra $a+b$.');
window.document.getElementById('referenceManagerProblemContent').value = 'Đề được sửa trong Quản lý nguồn $a-b$.';
await window.saveReferenceLinksManager();
assert.match(card.querySelector('.problem-content').textContent, /Đề được sửa trong Quản lý nguồn/);
window.close();
console.log('Math support: OCR -> client service -> route -> DB -> actions, owner isolation, revisions, pagination and retry safety: OK');
