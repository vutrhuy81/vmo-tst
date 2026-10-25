import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { getUniversityMaterials, universityMaterialCatalog } from '../lib/university-materials.js';
import { canAccessProblem } from '../lib/problem-access.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const catalog=await universityMaterialCatalog();
assert.equal(catalog.courses.length,10);assert.equal(catalog.courses.reduce((n,c)=>n+c.sectionCount,0),80);assert.equal(catalog.courses.reduce((n,c)=>n+c.exampleCount,0),400);
const ids=new Set(catalog.sources.map(source=>source.id));assert.equal(catalog.sources.filter(s=>s.kind==='uploaded').length,20);
const stores=new Map();
const matches=(row,q)=>Object.entries(q).every(([k,v])=>String(row[k])===String(v));
const db={collection(name){if(!stores.has(name))stores.set(name,[]);const rows=stores.get(name);return{
 async findOne(q){return rows.find(row=>matches(row,q))||null;},
 async findOneAndUpdate(q,update){let row=rows.find(row=>matches(row,q));if(!row){row={...q,...update.$setOnInsert};rows.push(row);}Object.assign(row,update.$set);return row;},
 find(q){return{async toArray(){return rows.filter(row=>matches(row,q));}};}
};}};
const user={role:'student',username:'uni',sub:'uni-id',educationLevels:['university']};
for(const course of catalog.courses){
 const data=await getUniversityMaterials(db,user,course.id);assert.equal(data.book.sections.length,8);assert.equal(data.problems.length,40);
 for(const section of data.book.sections){assert.equal(section.examples.length,5);assert.ok(section.theory.length>=2);assert.ok(section.method.length>=3);
  for(const ref of section.references)assert.ok(ids.has(ref.sourceId));
  for(const example of section.examples){assert.ok(example.steps.length>=3);assert.ok(example.result);assert.ok(example.insight);}
 }
 for(const problem of data.problems){assert.equal(problem.referenceSolutionVerified,false);assert.equal(canAccessProblem(problem,{role:'student',educationLevels:['upper_secondary']}),false);assert.equal(canAccessProblem(problem,user),true);}
}
assert.equal(stores.get('problems').length,400);
const key=stores.get('problems')[0].contentKey;stores.get('problems')[0].content='Admin edited statement';
await Promise.all([getUniversityMaterials(db,user,'mth-141'),getUniversityMaterials(db,user,'mth-141')]);
assert.equal(stores.get('problems').length,400);assert.equal(stores.get('problems').find(p=>p.contentKey===key).content,'Admin edited statement');
await assert.rejects(()=>getUniversityMaterials(db,{...user,educationLevels:['upper_secondary']},'mth-141'),/Đại học/);
await assert.rejects(()=>getUniversityMaterials(db,user,'../sources'),/Học phần/);
const dom=new JSDOM(read('index.html'),{url:'https://example.test/',runScripts:'outside-only'});const {window}=dom;
window.MathAppEducation={moduleAllowed:()=>true};let activeUser=user;window.VMOAuth={getSession:()=>activeUser};
window.CSS ||= {};window.CSS.escape ||= value=>String(value);
window.MathJax={typesetClear(){},typesetPromise:async()=>{}};
window.safeRenderMathJaxToElement=(el,text)=>{el.textContent=text;};window.reinitDatabaseUI=()=>{};window.reinitAIGuide=()=>{};
window.fetch=async url=>{const id=new URL(url,'https://example.test').searchParams.get('courseId');return{ok:true,json:async()=>({success:true,item:id?await getUniversityMaterials(db,user,id):catalog})};};
window.VMODataService={getCatalogProblems:async()=>[],getContentSets:async()=>[],getEvents:async()=>[]};
window.eval(read('vmo_db_ui.js'));window.eval(read('ai_guide_engine.js'));
window.eval(read('university_materials.js'));await window.loadUniversityMaterials();
assert.equal(window.document.querySelectorAll('#universityMaterialsCourse option').length,10);
for(const course of catalog.courses){window.document.getElementById('universityMaterialsCourse').value=course.id;await window.loadUniversityMaterials();assert.equal(window.document.querySelectorAll('#universityMaterialsContent .theorybox').length,8);assert.equal(window.document.querySelectorAll('#universityMaterialsContent .problem-item').length,40);}
assert.equal(window.document.querySelectorAll('#universityMaterialsContent .btn-ai-guide').length,40);
assert.equal(window.document.querySelectorAll('#universityMaterialsContent .btn-submit-solution').length,40);
activeUser={...user,role:'teacher'};window.reinitDatabaseUI(window.document.getElementById('universityMaterialsContent'));
assert.equal(window.document.querySelectorAll('#universityMaterialsContent .btn-manage-reference-links').length,40);
const search=window.document.getElementById('universityMaterialsSearch');search.value='zzzz-no-match';search.dispatchEvent(new window.Event('input'));assert.equal(window.document.querySelectorAll('.university-material-section[hidden]').length,8);
search.value='';search.dispatchEvent(new window.Event('input'));assert.equal(window.document.querySelectorAll('.university-material-section[hidden]').length,0);
window.document.getElementById('universityMaterialsSolutions').click();assert.equal(window.document.querySelectorAll('#universityMaterialsContent .example-solution.is-collapsed').length,40);
let prints=0;window.print=()=>{prints++;window.dispatchEvent(new window.Event('afterprint'));};window.document.getElementById('universityMaterialsPrint').click();await new Promise(resolve=>window.setTimeout(resolve,0));assert.equal(prints,1);assert.equal(window.document.querySelectorAll('#universityMaterialsContent .example-solution.is-collapsed').length,40);
window.close();console.log('University textbook: 10 courses / 80 theory sections / 400 worked examples; source integrity, DB initialization, permissions, preserved edits, search, solutions and print: OK');
