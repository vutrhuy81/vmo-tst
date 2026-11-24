import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ObjectId} from 'mongodb';
import {JSDOM} from 'jsdom';
import {readBooks,readBookAsset,readBookProblemImages} from '../lib/books.js';
const rows=[];
const eq=(a,b)=>String(a)===String(b);
function match(row,q){return Object.entries(q).every(([k,v])=>{if(k==='$and')return v.every(x=>match(row,x));if(k==='$or')return v.some(x=>match(row,x));if(v&&typeof v==='object'&&!(v instanceof ObjectId)){if('$in'in v)return v.$in.some(x=>eq(x,row[k]));if('$nin'in v)return !v.$nin.some(x=>eq(x,row[k]));if('$ne'in v)return !eq(row[k],v.$ne);if('$exists'in v)return(row[k]!==undefined)===v.$exists;}return eq(row[k],v);});}
function change(row,u,insert=false){if(insert)Object.assign(row,u.$setOnInsert);Object.assign(row,u.$set);for(const[k,v]of Object.entries(u.$inc||{}))row[k]=(row[k]||0)+v;}
const col={async findOne(q){return rows.find(r=>match(r,q))?{...rows.find(r=>match(r,q))}:null;},async findOneAndUpdate(q,u,o){let row=rows.find(r=>match(r,q));if(!row){if(!o?.upsert)return null;row={...q};change(row,u,true);rows.push(row);}else change(row,u);return{...row};},async insertOne(doc){const row={_id:new ObjectId(),...doc};rows.push(row);return{insertedId:row._id};},async createIndex(){},async updateOne(q,u){const row=rows.find(r=>match(r,q));if(!row)return{matchedCount:0};change(row,u);return{matchedCount:1};},async updateMany(q,u){rows.filter(r=>match(r,q)).forEach(r=>change(r,u));},find(q,options={}){let limit=Infinity;return{sort(){return this;},limit(n){limit=n;return this;},async toArray(){return rows.filter(r=>match(r,q)).slice(0,limit).map(r=>{const copy={...r};for(const[k,v]of Object.entries(options.projection||{}))if(v===0)delete copy[k];return copy;});}};}};
const db={collection:()=>col},admin={role:'admin',username:'admin'},student={role:'student',educationLevels:['university']},teacher={role:'teacher',educationLevels:['university']},other={role:'student',educationLevels:['upper_secondary']};

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const data=JSON.parse(read('data/books/imports/stewart-8-2.json'));
const catalog=await readBooks(db,student), book=catalog.books[0];
const detail=await readBooks(db,student,{bookId:book.id});
const chapter=detail.sections.find(s=>s.title.startsWith('Chương 8.'));
const section=detail.sections.find(s=>s.title.startsWith('8.2.')&&s.parentId===chapter.id);
assert.ok(section);
const result=await readBooks(db,student,{bookId:book.id,sectionId:section.id});
assert.equal(result.exerciseHeading,'8.2. Bài tập');
assert.equal(result.section.content,data.content);
const exercises=result.exercises;
assert.deepEqual(exercises.map(e=>e.questionNumber),Array.from({length:52},(_,i)=>i+1));
assert.equal(new Set(exercises.map(e=>e.contentKey)).size,52);
assert.ok(exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation));
assert.equal(data.sourceInfo.exampleCount,4);
assert.ok(exercises[0].content.includes('Yêu cầu chung (1–4)'));
assert.ok(exercises[41].content.includes('đới cầu'));
for(const [n,image] of [[33,'ex33'],[35,'ex35'],[36,'ex36'],[47,'proj02'],[48,'proj03'],[50,'proj03']])assert.ok(exercises[n-1].content.includes(image+'.png'));
assert.equal(data.sourceInfo.assetCount,15);
assert.equal(data.sourceInfo.lastExercise,46);
assert.equal(data.sourceInfo.projectExerciseCount,6);
const dom=new JSDOM(read('index.html'),{url:'https://example.test',runScripts:'outside-only'}),{window}=dom;
window.eval(read('education_access.js'));window.VMOAuth={getSession:()=>admin};window.confirm=()=>true;
window.fetch=async url=>({ok:true,json:async()=>({success:true,item:await readBooks(db,admin,Object.fromEntries(new URL(url,'https://example.test').searchParams))})});
window.eval(read('vmo_db_ui.js'));window.eval(read('books.js'));window.eval(read('ai_guide_engine.js'));
await window.loadBooks();
const chapterNode=[...window.document.querySelectorAll('#booksToc details')].find(d=>d.querySelector(':scope > summary')?.textContent===chapter.title);
await [...chapterNode.querySelectorAll('button')].find(b=>b.textContent.startsWith('8.2.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,52,selector);
const images=[...window.document.querySelectorAll('#booksContent img')];assert.ok(images.length>=15);assert.equal(new Set(images.map(i=>i.src)).size,15);
const card=window.document.querySelectorAll('.book-exercise')[17];
let selected;window.openAIGuide=button=>{selected=button.closest('.book-exercise').dataset.contentKey;};card.querySelector('.btn-ai-guide').onclick();assert.equal(selected,exercises[17].contentKey);
card.querySelector('.btn-submit-solution').onclick();assert.ok(window.document.getElementById('submissionModal').textContent.includes('Bài tập 18'));window.closeSubmissionModal();
window.VMODataService={getCatalogProblems:async({contentKey})=>exercises.filter(e=>e.contentKey===contentKey)};
await window.openReferenceLinksManager(exercises[17].contentKey);assert.equal(window.document.getElementById('referenceManagerProblemContent').value,exercises[17].content);window.closeReferenceLinksManager();
const again=await readBooks(db,student,{bookId:book.id,sectionId:section.id});assert.deepEqual(again.exercises.map(e=>e.id),exercises.map(e=>e.id));
const edited=rows.find(r=>String(r._id)===exercises[19].id);edited.content+='<p>Admin edit</p>';edited.version=2;edited.referenceLinks=[{url:'https://example.test/reference'}];
const reread=await readBooks(db,student,{bookId:book.id,sectionId:section.id});assert.ok(reread.exercises[19].content.endsWith('<p>Admin edit</p>'));assert.equal(reread.exercises[19].referenceLinks.length,1);
// ORIGINAL_MIGRATION_CHECK
const originalSection=rows.find(r=>String(r._id)===section.id);
const savedContent=originalSection.content;
originalSection.content='<p>Admin theory edit</p>';
await readBooks(db,student,{bookId:book.id,sectionId:section.id});
assert.equal(originalSection.content,'<p>Admin theory edit</p>');
originalSection.content=savedContent;
const manifest=JSON.parse(read('data/books/asset-manifest.json'));
for(const name of Object.keys(manifest).filter(k=>k.startsWith('stewart-8-2-47f88c07/')).map(k=>k.split('/')[1])){
 const key='stewart-8-2-47f88c07/'+name;
 const asset=await readBookAsset(student,key);
 assert.equal(crypto.createHash('sha256').update(asset.bytes).digest('hex'),manifest[key].sha256);
}
console.log('Stewart 8.2: 46 exercises + 6 project questions, 156 action buttons, 15 original figures and modal bindings passed.');
dom.window.close();
