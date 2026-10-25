import { UNIVERSITY_COURSES, universityCourse } from '../lib/university-courses.js';
import { educationDb } from '../lib/education-db.js';
import { allows } from '../lib/education-access.js';
import { canAccessProblem, supportVisibility } from '../lib/problem-access.js';
import { handleMathSupport } from '../lib/math-support.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ObjectId } from 'mongodb';
import { JSDOM } from 'jsdom';

// Execute the real route against isolated collections; never connect to Atlas.
const stores = new Map();
let role = 'admin';
let educationLevels;
const matches = (doc, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$and') return value.every(part => matches(doc, part));
  if (key === '$or') return value.some(part => matches(doc, part));
  if (value && typeof value === 'object' && !(value instanceof ObjectId)) {
    if ('$exists' in value) return (doc[key] !== undefined) === value.$exists;
    if ('$nin' in value) return !value.$nin.some(item => String(item) === String(doc[key]));
    if ('$ne' in value) return doc[key] !== value.$ne;
    if ('$in' in value) return value.$in.some(item => String(item) === String(doc[key]));
    return true;
  }
  return String(doc[key]) === String(value);
});
const db = { collection(name) {
  if (!stores.has(name)) stores.set(name, []);
  const rows = stores.get(name);
  return {
    async findOne(query) { return rows.find(row => matches(row, query)); },
    async findOneAndUpdate(query, update) {
      let row = rows.find(row => matches(row, query));
      if (!row) { row = { _id: new ObjectId(), ...update.$setOnInsert, ...query }; rows.push(row); }
      Object.assign(row, update.$set);
      return row;
    },
    async deleteMany() {}, async createIndex() {},
    find(query, options = {}) {
      return { sort() { return this; }, limit() { return this; }, async toArray() {
        return rows.filter(row => matches(row, query)).map(row => options.projection ? Object.fromEntries(Object.entries(row).filter(([key]) => key === '_id' || options.projection[key])) : row);
      } };
    },
    aggregate(pipeline) { return { async toArray() {
      const counts = new Map();
      rows.filter(row => matches(row, pipeline[0].$match)).forEach(row => counts.set(row.examId, (counts.get(row.examId) || 0) + 1));
      return [...counts].map(([_id, count]) => ({ _id, count }));
    } }; }
  };
} };
const source = fs.readFileSync(new URL('../api/data.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async function handler', 'async function handler');
const handler = new Function('universityCourse', 'educationDb', 'allows', 'getDb', 'getSession', 'ObjectId', 'recordActivity', 'canAccessProblem', 'supportVisibility', 'handleMathSupport', `${source}\nreturn handler;`)(
  universityCourse, educationDb, allows,   async () => db, () => ({ role, username: 'tester', ...(educationLevels ? {educationLevels} : {}) }), ObjectId, async () => {}, canAccessProblem, supportVisibility, handleMathSupport);
async function call(payload, query) {
  const res = { code: 0, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: query ? 'GET' : 'POST', query, body: { action: 'create_exam_from_ocr', payload } }, res);
  return res;
}
for (const [destination, category] of [['olympic30', 'olympic-30-4'], ['duyenhai', 'duyen-hai-bac']]) {
  const payload = grade => ({ destination, grade, province: 'Kỳ thi', year: '2026-2027', dayNumber: 1,
    targetAnchor: `${destination}-ky-thi-2026-2027-grade-${grade}`, sourceImageCount: 1,
    questions: [{ questionNumber: 1, content: 'Chứng minh bất đẳng thức.' }] });
  for (const invalid of [undefined, 9, 12, '10abc']) {
    assert.equal((await call(payload(invalid))).code, 400, 'Invalid grade is rejected before writing');
  }
  assert.equal((await call({ ...payload(10), targetAnchor: payload(11).targetAnchor })).code, 400);
  const ten = await call(payload(10)), eleven = await call(payload(11));
  assert.equal(ten.code, 201); assert.equal(eleven.code, 201);
  assert.notEqual(ten.body.item.examKey, eleven.body.item.examKey);
  assert.notEqual(ten.body.item.setKey, eleven.body.item.setKey);
  assert.notEqual(ten.body.item.problems[0].contentKey, eleven.body.item.problems[0].contentKey);
  assert.equal(ten.body.item.problems[0].grade, 10);
  assert.equal(eleven.body.item.problems[0].grade, 11);
  assert.equal((await call(payload(10))).code, 409, 'Same grade duplicate still requires confirmation');
  const summary = await call(null, { resource: 'exam_catalog', view: 'summary', category, grade: '11' });
  assert.equal(summary.code, 200); assert.equal(summary.body.items.length, 1);
  assert.equal(summary.body.items[0].grade, 11);
  assert.equal(summary.body.items[0].problemCount, 1);
  assert.equal((await call(null, { resource: 'exam_catalog', view: 'summary', category, grade: '12' })).code, 400);
  role = 'student';
  assert.equal((await call(payload(10))).code, 403, 'Students cannot create exams');
  role = 'admin';
}
assert.equal(stores.get('exams').length, 4);
assert.equal(stores.get('content_sets').length, 4);
assert.equal(stores.get('problems').length, 4);

// University course identity, question metadata, summaries and education-level boundaries.
assert.equal(UNIVERSITY_COURSES.length,10);
const universityResults=[];
for (const course of UNIVERSITY_COURSES) {
 const payload={destination:'university',courseId:course.id,province:course.code,year:'2026-2027',dayNumber:1,
  targetAnchor:`university-${course.id}-2026-2027`,sourceImageCount:1,questions:[{questionNumber:1,topic:course.nameVi,content:'Prove the stated result.'}]};
 const result=await call(payload);assert.equal(result.code,201);universityResults.push(result.body.item);
 assert.equal(result.body.item.category,'university');assert.equal(result.body.item.courseId,course.id);
 assert.equal(result.body.item.problems[0].educationLevel,'university');assert.equal(result.body.item.problems[0].courseId,course.id);
 assert.equal((await call(payload)).code,409,'Same course/year/paper needs explicit replace confirmation');
 assert.equal((await call({...payload,province:'Forged course'})).code,400);
}
assert.equal(new Set(universityResults.map(exam=>exam.examKey)).size,10,'Courses never overwrite each other');
assert.equal(new Set(universityResults.map(exam=>exam.problems[0].contentKey)).size,10);
assert.equal((await call({destination:'university',courseId:'fake'})).code,400);
role='student';educationLevels=['university'];
let courseSummary=await call(null,{resource:'exam_catalog',category:'university',courseId:'mth-141',view:'summary'});
assert.equal(courseSummary.code,200);assert.equal(courseSummary.body.items.length,1);assert.equal(courseSummary.body.items[0].courseCode,'MTH 141');
assert.equal((await call(null,{resource:'exam_catalog',category:'university',courseId:'fake',view:'summary'})).code,400);
for(const grants of [['upper_secondary'],['lower_secondary'],['primary']]){
 educationLevels=grants;
 assert.equal((await call(null,{resource:'exam_catalog',category:'university',view:'summary'})).body.items.length,0,'Other levels cannot read university exams');
}
educationLevels=['university'];
assert.equal((await call(null,{resource:'exam_catalog',category:'olympic-30-4',view:'summary'})).body.items.length,0,'University alone does not open THPT exams');
role='teacher';educationLevels=['upper_secondary'];
assert.equal((await call({destination:'university',courseId:'mth-141'})).code,403,'A THPT Teacher cannot upload University content');
role='admin';educationLevels=undefined;
const addQuestionRes={code:0,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
await handler({method:'POST',body:{action:'add_exam_question',payload:{examId:String(universityResults[0]._id),questionNumber:2,content:'Compute the derivative.',topic:'Calculus'}}},addQuestionRes);
assert.equal(addQuestionRes.code,201);assert.equal(addQuestionRes.body.item.courseId,'mth-141');assert.equal(addQuestionRes.body.item.educationLevel,'university');


// Grade pills compose with search, and clearing search retains the grade selection.
const template = fs.readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
const dom = new JSDOM(template, { runScripts: 'outside-only', url: 'https://example.test' });
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {} });
window.scrollTo = () => {};
for (const id of ['olympic30', 'duyenhai']) {
  const pane = window.document.createElement('div'); pane.className = 'tab-pane'; pane.id = `tab-${id}`;
  pane.innerHTML = [10,11].map(grade => `<article class="exam-card" data-filter="GRADE${grade}" data-search="Bất đẳng thức Lớp ${grade}">Đề lớp ${grade}</article>`).join('');
  window.document.body.append(pane);
}
window.eval(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
for (const id of ['olympic30', 'duyenhai']) {
  await window.switchTab(`tab-${id}`);
  assert.equal(window.document.getElementById(`sidebar-${id}`).style.display, 'block');
  assert.equal(window.document.getElementById(`sidebar-${id === 'olympic30' ? 'duyenhai' : 'olympic30'}`).style.display, 'none');
  window.document.querySelector(`#${id}FilterPills [data-filter="GRADE11"]`).click();
  const cards = [...window.document.querySelectorAll(`#tab-${id} .exam-card`)];
  assert.equal(cards[0].classList.contains('hidden-by-search'), true);
  assert.equal(cards[1].classList.contains('hidden-by-search'), false);
  const input = window.document.getElementById('searchInput');
  input.value = 'Bất đẳng thức'; input.dispatchEvent(new window.Event('input'));
  assert.equal(cards[0].classList.contains('hidden-by-search'), true);
  input.value = ''; input.dispatchEvent(new window.Event('input'));
  assert.equal(cards[0].classList.contains('hidden-by-search'), true);
  window.document.querySelector(`#${id}FilterPills [data-filter="ALL"]`).click();
  assert.ok(cards.every(card => !card.classList.contains('hidden-by-search')));
}
// All ten University banks share the proven lazy exam renderer and question actions.
window.CSS ||= {};window.CSS.escape ||= value=>String(value);
window.VMOAuth={getSession:()=>({role:'admin',username:'tester'})};window.alert=()=>{};
window.VMODataService={
 getExamCatalog:async()=>[],
 getExamCatalogSummary:async category=>category==='university'?universityResults.map(({problems,...exam})=>({...exam,problemCount:1})):[],
 getExamCatalogDetail:async(category,anchor)=>universityResults.filter(exam=>exam.targetAnchor===anchor),
 getCatalogProblems:async()=>[],getContentSets:async()=>[],getEvents:async()=>[],getDocuments:async()=>[],getExams:async()=>[]
};
window.eval(fs.readFileSync(new URL('../university_courses.js',import.meta.url),'utf8'));
window.eval(fs.readFileSync(new URL('../university.js',import.meta.url),'utf8'));
window.eval(fs.readFileSync(new URL('../vmo_db_ui.js',import.meta.url),'utf8'));
window.eval(fs.readFileSync(new URL('../ai_guide_engine.js',import.meta.url),'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await window.switchTab('tab-university');
await window.loadDatabaseCompetitionExams('tab-university');
assert.equal(window.document.querySelectorAll('#universityCourseSelect option').length,10);
assert.equal(window.document.querySelectorAll('#universityCourseList button').length,10);
assert.equal(window.document.querySelectorAll('#tab-university .exam-card').length,10);
for(const course of UNIVERSITY_COURSES){
 window.selectUniversityCourse(course.id);
 const visible=[...window.document.querySelectorAll('#tab-university .exam-card')].filter(card=>!card.classList.contains('hidden-by-search'));
 assert.equal(visible.length,1);assert.equal(visible[0].dataset.courseId,course.id);
 await window.loadDatabaseExamDetail('university',visible[0].id);
 assert.ok(visible[0].querySelector('.problem-item'));
 assert.ok(visible[0].querySelector('.btn-submit-solution'),'Standard submission action is retained');
 assert.equal(window.document.querySelectorAll('#universityExamLinks a:not([hidden])').length,1);
}
window.openDataHubModal();
window.document.getElementById('docDestination').value='university';window.syncDocumentDestination();
assert.equal(window.document.getElementById('docCourseId').options.length,10);
assert.equal(window.document.getElementById('docProvince').value,'MTH 141');
assert.equal(window.document.getElementById('docCourseWrap').style.display,'block');
window.switchHubTab('docs');await new Promise(resolve=>window.setTimeout(resolve,0));
assert.equal(window.document.querySelectorAll('#hubDocsList .hub-managed-exam').length,10);
window.close();
console.log('Grade and ten University catalogs: identities, authorization, lazy questions, course filters and OCR form: OK');
