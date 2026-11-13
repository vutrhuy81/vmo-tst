import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ObjectId} from 'mongodb';
import {JSDOM} from 'jsdom';
import {readBooks,mutateBooks,readBookAsset,readBookProblemImages} from '../lib/books.js';
import {canAccessProblem} from '../lib/problem-access.js';
import {educationDb} from '../lib/education-db.js';
import {filterAppShell} from '../lib/app-shell.js';
const rows=[];
const eq=(a,b)=>String(a)===String(b);
function match(row,q){return Object.entries(q).every(([k,v])=>{if(k==='$and')return v.every(x=>match(row,x));if(k==='$or')return v.some(x=>match(row,x));if(v&&typeof v==='object'&&!(v instanceof ObjectId)){if('$in'in v)return v.$in.some(x=>eq(x,row[k]));if('$nin'in v)return !v.$nin.some(x=>eq(x,row[k]));if('$ne'in v)return !eq(row[k],v.$ne);if('$exists'in v)return(row[k]!==undefined)===v.$exists;}return eq(row[k],v);});}
function change(row,u,insert=false){if(insert)Object.assign(row,u.$setOnInsert);Object.assign(row,u.$set);for(const[k,v]of Object.entries(u.$inc||{}))row[k]=(row[k]||0)+v;}
const col={async findOne(q){return rows.find(r=>match(r,q))?{...rows.find(r=>match(r,q))}:null;},async findOneAndUpdate(q,u,o){let row=rows.find(r=>match(r,q));if(!row){if(!o?.upsert)return null;row={...q};change(row,u,true);rows.push(row);}else change(row,u);return{...row};},async insertOne(doc){const row={_id:new ObjectId(),...doc};rows.push(row);return{insertedId:row._id};},async createIndex(){},async updateOne(q,u){const row=rows.find(r=>match(r,q));if(!row)return{matchedCount:0};change(row,u);return{matchedCount:1};},async updateMany(q,u){rows.filter(r=>match(r,q)).forEach(r=>change(r,u));},find(q,options={}){let limit=Infinity;return{sort(){return this;},limit(n){limit=n;return this;},async toArray(){return rows.filter(r=>match(r,q)).slice(0,limit).map(r=>{const copy={...r};for(const[k,v]of Object.entries(options.projection||{}))if(v===0)delete copy[k];return copy;});}};}};
const db={collection:()=>col},admin={role:'admin',username:'admin'},student={role:'student',educationLevels:['university']},teacher={role:'teacher',educationLevels:['university']},other={role:'student',educationLevels:['upper_secondary']};
let catalog=await readBooks(db,student);assert.equal(catalog.categories.length,5);assert.equal(catalog.books.length,1);
const book=catalog.books[0],detail=await readBooks(db,student,{bookId:book.id});assert.equal(detail.sections.length,175);assert.equal(detail.sections.filter(s=>/^Chương \d+\./.test(s.title)).length,16);assert.ok(detail.sections.every(s=>s.content===undefined));
const first=detail.sections.find(s=>s.title.startsWith('Chương 1.')),child=detail.sections.find(s=>s.title.startsWith('1.1'));
const exerciseRead=await readBooks(db,student,{bookId:book.id,sectionId:child.id});
const exercises=exerciseRead.exercises;assert.equal(exercises.length,88);assert.deepEqual(exercises.map(e=>e.questionNumber),Array.from({length:88},(_,i)=>i+1));assert.equal(new Set(exercises.map(e=>e.contentKey)).size,88);
assert.ok(exercises[6].content.includes('Xác định phương trình'));assert.ok(exercises[14].content.includes('e15_18.png'));assert.ok(exercises[63].content.includes('hình bên phải'));assert.ok(exercises[4].content.includes('/f01.png'));assert.ok(exercises[30].content.includes('<table>'));assert.ok(exercises.every(e=>e.referenceSolutionVerified===false));
const imported=exerciseRead.section;assert.equal(imported.contentFormat,'html-latex');assert.equal(imported.version,2);assert.equal(imported.sourceInfo.assetCount,35);assert.ok(imported.content.includes('Ví dụ 11.'));assert.ok(imported.content.includes('88.'));assert.equal((imported.content.match(/<img /g)||[]).length,35);
const child12=detail.sections.find(s=>s.title.startsWith('1.2'));
const section12=await readBooks(db,student,{bookId:book.id,sectionId:child12.id});
assert.equal(section12.section.version,2);assert.equal(section12.section.sourceInfo.assetCount,33);assert.equal(section12.exerciseHeading,'1.2. Bài tập');
assert.equal(section12.exercises.length,37);assert.deepEqual(section12.exercises.map(e=>e.questionNumber),Array.from({length:37},(_,i)=>i+1));
assert.ok(section12.exercises[2].content.includes('Ghép từng phương trình'));assert.ok(section12.exercises[10].content.includes('hình bên trái'));assert.ok(section12.exercises[11].content.includes('hình bên phải'));assert.ok(section12.exercises[26].content.includes('hai biểu đồ ở hàng trên'));assert.ok(section12.exercises[27].content.includes('hai biểu đồ ở hàng dưới'));assert.ok(section12.exercises[28].content.includes('<table>'));
assert.equal(section12.exercises.some(e=>exercises.some(old=>old.contentKey===e.contentKey)),false,'Different sections never share exercise identity');
assert.equal((section12.section.content.match(/<img /g)||[]).length,33);assert.equal((section12.section.content.match(/<table/g)||[]).length,11);
const child13=detail.sections.find(s=>s.title.startsWith('1.3'));
const section13=await readBooks(db,student,{bookId:book.id,sectionId:child13.id});
assert.equal(section13.section.version,2);assert.equal(section13.section.sourceInfo.assetCount,19);assert.equal(section13.section.sourceInfo.exampleCount,9);assert.equal(section13.exerciseHeading,'1.3. Bài tập');
assert.equal(section13.exercises.length,71);assert.deepEqual(section13.exercises.map(e=>e.questionNumber),Array.from({length:71},(_,i)=>i+1));
assert.ok(section13.exercises[5].content.includes('hình bên trái'));assert.ok(section13.exercises[6].content.includes('hình bên phải'));
for(const n of [5,6]){assert.ok(section13.exercises[n].content.includes('e06_07_base.png'));assert.ok(section13.exercises[n].content.includes('e06_07.png'));}
for(const n of [54,55])assert.ok(section13.exercises[n].content.includes('<table>'),'Shared table must be in each problem');
assert.ok(section13.exercises[7].content.includes('/f04.png'));assert.ok(section13.exercises[7].content.includes('/f06.png'));assert.ok(section13.exercises[26].content.includes('/f09.png'));assert.ok(section13.exercises[63].content.includes('H(t)=\\begin{cases}'));
assert.equal(section13.exercises.some(e=>[...exercises,...section12.exercises].some(old=>old.contentKey===e.contentKey)),false);
assert.equal((section13.section.content.match(/<img /g)||[]).length,19);assert.equal((section13.section.content.match(/<table/g)||[]).length,4);
const child14=detail.sections.find(s=>s.title.startsWith('1.4'));
const section14=await readBooks(db,student,{bookId:book.id,sectionId:child14.id});
assert.equal(section14.section.version,2);assert.equal(section14.section.sourceInfo.assetCount,19);assert.equal(section14.section.sourceInfo.exampleCount,6);assert.equal(section14.exerciseHeading,'1.4. Bài tập');
assert.deepEqual(section14.exercises.map(e=>e.questionNumber),Array.from({length:35},(_,i)=>i+1));
assert.equal(new Set([...exercises,...section12.exercises,...section13.exercises,...section14.exercises].map(e=>e.contentKey)).size,231);
for(let n=9;n<=14;n++)for(const name of ['f03','f15'])assert.ok(section14.exercises[n-1].content.includes('/'+name+'.png'));
assert.ok(section14.exercises[18].content.includes('hình bên trái'));assert.ok(section14.exercises[19].content.includes('hình bên phải'));
for(const n of [18,19])assert.ok(section14.exercises[n].content.includes('e19_20.png'));
for(const n of [26,27])assert.ok(section14.exercises[n].content.includes('<table>'));
assert.ok(section14.exercises[30].content.includes('/f11.png'));
assert.equal((section14.section.content.match(/<img /g)||[]).length,19);assert.equal((section14.section.content.match(/<table/g)||[]).length,5);
const child15=detail.sections.find(s=>s.title.startsWith('1.5'));
const section15=await readBooks(db,student,{bookId:book.id,sectionId:child15.id});
assert.equal(section15.section.version,2);assert.equal(section15.section.sourceInfo.assetCount,29);assert.equal(section15.section.sourceInfo.exampleCount,14);assert.equal(section15.exerciseHeading,'1.5. Bài tập');
assert.deepEqual(section15.exercises.map(e=>e.questionNumber),Array.from({length:83},(_,i)=>i+1));
assert.equal(new Set([...exercises,...section12.exercises,...section13.exercises,...section14.exercises,...section15.exercises].map(e=>e.contentKey)).size,314);
for(let n=5;n<=8;n++){assert.ok(section15.exercises[n-1].content.includes('e05_08.png'));assert.ok(section15.exercises[n-1].content.includes('nhãn '+n));assert.ok(section15.exercises[n-1].content.includes('Xác định hàm có đơn ánh'));}
for(let n=9;n<=16;n++)assert.ok(section15.exercises[n-1].content.includes('Xác định hàm có đơn ánh'),'Shared instruction survives implicit image exercises');
assert.ok(!section15.exercises[3].content.includes('e05_08.png'),'Exercise 4 must not absorb exercises 5–8');
for(const n of [2,3])assert.ok(section15.exercises[n].content.includes('<table>'));
for(const n of [32,33])assert.ok(section15.exercises[n].content.includes('e33_34.png'));
for(let n=47;n<=50;n++)assert.ok(section15.exercises[n-1].content.includes('\\log_b x=\\frac{\\ln x}{\\ln b}'));
for(const n of [52,53])for(const name of ['f12','f13'])assert.ok(section15.exercises[n].content.includes('/'+name+'.png'));
assert.equal((section15.section.content.match(/<img /g)||[]).length,29);assert.equal((section15.section.content.match(/<table/g)||[]).length,5);
const childReview=detail.sections.find(s=>s.title==='Ôn tập'&&s.parentId===first.id);
const review=await readBooks(db,student,{bookId:book.id,sectionId:childReview.id});
assert.equal(review.section.version,2);assert.equal(review.section.sourceInfo.conceptCheckCount,13);assert.equal(review.section.sourceInfo.trueFalseCount,14);assert.equal(review.exerciseHeading,'Bài tập');
assert.deepEqual(review.exercises.map(e=>e.questionNumber),Array.from({length:38},(_,i)=>i+1));
assert.equal(new Set([...exercises,...section12.exercises,...section13.exercises,...section14.exercises,...section15.exercises,...review.exercises].map(e=>e.contentKey)).size,352);
for(const [n,image]of [[1,'ex01'],[2,'ex02'],[10,'ex10']])assert.ok(review.exercises[n-1].content.includes('/'+image+'.png'));
assert.ok(review.exercises[22].content.includes('<table>'));assert.ok(review.exercises[30].content.includes('ba chữ số'));
assert.equal((review.section.content.match(/<img /g)||[]).length,3);assert.equal((review.section.content.match(/<table/g)||[]).length,2);
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title==='Ôn tập'&&s.parentId===detail.sections.find(x=>x.title.startsWith('Chương 3.')).id).id})).exercises.length,116,'Chapter 3 review imports all exercises');
const childPrinciples=detail.sections.find(s=>s.title==='Các nguyên tắc giải toán'&&s.parentId===first.id);
const principles=await readBooks(db,student,{bookId:book.id,sectionId:childPrinciples.id});
assert.equal(principles.section.version,2);assert.equal(principles.section.sourceInfo.exampleCount,3);assert.equal(principles.exerciseHeading,'Bài tập');
assert.deepEqual(principles.exercises.map(e=>e.questionNumber),Array.from({length:22},(_,i)=>i+1));
assert.equal(new Set([...exercises,...section12.exercises,...section13.exercises,...section14.exercises,...section15.exercises,...review.exercises,...principles.exercises].map(e=>e.contentKey)).size,374);
for(const title of ['1. Hiểu bài toán','2. Lập kế hoạch','3. Thực hiện kế hoạch','4. Nhìn lại lời giải','Nguyên lý quy nạp toán học','D_n='])assert.ok(principles.section.content.replace(/\s+/g,' ').includes(title));
assert.ok(principles.exercises[3].content.includes('\\ge5'));assert.ok(principles.exercises[7].content.includes('\\le2'));assert.ok(principles.exercises[9].content.includes('\\le'));assert.ok(principles.exercises[14].content.includes('\\le0'));
assert.ok(principles.exercises[21].content.replace(/\s+/g,' ').includes('Dùng công cụ vẽ đồ thị.'));assert.ok(principles.exercises[21].content.includes('quy nạp'));
assert.equal((principles.section.content.match(/<img /g)||[]).length,1);assert.equal((principles.section.content.match(/<table/g)||[]).length,1);
await assert.rejects(()=>readBooks(educationDb(db,other),other),e=>e.status===403);
for(const user of[student,teacher])await assert.rejects(()=>mutateBooks(db,user,'books_save_category',{name:'No'}),e=>e.status===403);
const cat=await mutateBooks(db,admin,'books_save_category',{name:'Giải tích nâng cao'});await assert.rejects(()=>mutateBooks(db,admin,'books_save_category',{name:cat.name}),e=>e.status===409);
const newBook=await mutateBooks(db,admin,'books_save_book',{categoryId:cat.id,title:'Sách mới',authors:'Tác giả'});
const renamed=await mutateBooks(db,admin,'books_save_book',{id:newBook.id,expectedVersion:1,categoryId:cat.id,title:'Sách đã đổi tên'});assert.equal(renamed.version,2);
await assert.rejects(()=>mutateBooks(db,admin,'books_save_book',{id:newBook.id,expectedVersion:1,categoryId:cat.id,title:'Stale'}),e=>e.status===409);
const parent=await mutateBooks(db,admin,'books_save_section',{bookId:newBook.id,title:'Chương mới',order:1,content:''});
const section=await mutateBooks(db,admin,'books_save_section',{bookId:newBook.id,parentId:parent.id,title:'Ví dụ',order:1,content:String.raw`Điều kiện $x\neq1$. <script>alert(1)</script>`});
await assert.rejects(()=>mutateBooks(db,admin,'books_save_section',{bookId:book.id,parentId:parent.id,title:'Wrong parent'}),e=>e.status===400);
await assert.rejects(()=>readBooks(db,student,{bookId:book.id,sectionId:section.id}),e=>e.status===404);
const changed=await mutateBooks(db,admin,'books_save_section',{id:section.id,expectedVersion:1,title:section.title,order:1,content:'Edited $x=2$'});assert.equal(changed.version,2);
const deleted=await mutateBooks(db,admin,'books_delete_section',{id:parent.id,expectedVersion:1});assert.equal(deleted.affected,2);
assert.equal((await readBooks(db,student,{bookId:newBook.id})).sections.length,0);
await assert.rejects(()=>readBooks(db,teacher,{bookId:newBook.id,sectionId:section.id,includeDeleted:'1'}),e=>e.status===404);
const trash=await readBooks(db,admin,{bookId:newBook.id,includeDeleted:'1'});assert.equal(trash.sections.length,2);
await mutateBooks(db,admin,'books_restore_section',{id:parent.id,expectedVersion:trash.sections.find(s=>s.id===parent.id).version});assert.equal((await readBooks(db,student,{bookId:newBook.id})).sections.length,2);
// Initializer preserves edits/deletions and does not duplicate default records.
const edited=await mutateBooks(db,admin,'books_save_section',{id:child.id,expectedVersion:2,title:child.title,order:1,content:'Saved content'});
await readBooks(db,student);assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child.id})).section.content,'Saved content');
const fixture=JSON.parse(fs.readFileSync(new URL('../data/books/stewart-9-toc.json',import.meta.url)));assert.equal(fixture.sections.find(s=>s.key==='16-9').page,'1201');
// Real browser event handlers, scoped shell and safe text rendering.
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const dom=new JSDOM(filterAppShell(read('index.html'),admin),{url:'https://example.test',runScripts:'outside-only'}),{window}=dom;
let user=admin;window.eval(read('education_access.js'));window.VMOAuth={getSession:()=>user};window.confirm=()=>true;
window.eval(read('vmo_db_ui.js'));
window.fetch=async(url,options={})=>{try{const query=Object.fromEntries(new URL(url,'https://example.test').searchParams);const body=options.body?JSON.parse(options.body):null;return{ok:true,json:async()=>({success:true,item:body?await mutateBooks(db,user,body.action,body.payload):await readBooks(db,user,query)})};}catch(e){return{ok:false,json:async()=>({success:false,error:e.message})};}};
// Route integration: authentication and Admin-only writes are enforced server-side.
const apiSource=read('api/data.js').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
const handler=new Function('readBooks','mutateBooks','readBookAsset','educationDb','getDb','getSession','handleMathSupport','allows','ObjectId','canAccessProblem','recordActivity',apiSource+'\nreturn handler;')(readBooks,mutateBooks,readBookAsset,educationDb,async()=>db,async()=>user,async()=>false,(session,level)=>window.MathAppEducation.allows(session,level),ObjectId,canAccessProblem,async()=>{});
async function route(method,payload){const res={status(code){this.code=code;return this;},setHeader(){},json(body){this.body=body;return this;}};await handler({method,query:{resource:'books'},body:payload},res);return res;}
assert.equal((await route('GET')).code,200);
const sourceEdit={action:'update_catalog_content',payload:{id:exercises[6].id,content:exercises[6].content+'<p>Kiểm tra tập xác định.</p>',referenceLinks:[],expectedVersion:1}};
user=teacher;assert.equal((await route('POST',sourceEdit)).code,403);
user=admin;assert.equal((await route('POST',sourceEdit)).code,200);assert.equal((await route('POST',sourceEdit)).code,409);
user={...student,sub:'university-student',username:'student'};
const submitted=await route('POST',{action:'submit_solution',payload:{problemId:exercises[6].id,problemKey:exercises[6].contentKey,solutionContent:'$y=(3x-7)/5$, nên mỗi $x$ xác định đúng một $y$.'}});
assert.equal(submitted.code,201);assert.equal(submitted.body.item.problemKey,exercises[6].contentKey);assert.equal(submitted.body.item.sourceGroup,'university_books');
user=other;assert.equal((await route('POST',{action:'submit_solution',payload:{problemId:exercises[6].id,solutionContent:'Denied'}})).code,403);user=admin;
user=teacher;assert.equal((await route('POST',{action:'books_save_category',payload:{name:'Forbidden'}})).code,403);user=other;assert.equal((await route('GET')).code,403);user=admin;
await mutateBooks(db,admin,'books_save_section',{id:child.id,expectedVersion:edited.version,title:child.title,order:1,content:imported.content,contentFormat:'html-latex'});
window.eval(read('books.js'));window.eval(read('ai_guide_engine.js'));await window.loadBooks();
assert.ok(window.document.getElementById('booksToc').textContent.includes('Chương 16.'));
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('1.1')).onclick();
assert.equal(window.document.querySelectorAll('.book-exercise').length,88);
assert.equal(window.document.querySelectorAll('.book-exercise .btn-ai-guide').length,88);
assert.equal(window.document.querySelectorAll('.book-exercise .btn-submit-solution').length,88);
assert.equal(window.document.querySelectorAll('.book-exercise .btn-manage-reference-links').length,88);
const e7=window.document.querySelectorAll('.book-exercise')[6];assert.ok(e7.querySelector('.problem-content').textContent.includes('Xác định phương trình'));
let aiCard;const originalOpen=window.openAIGuide;window.openAIGuide=btn=>{aiCard=btn.closest('.book-exercise').dataset.contentKey;};e7.querySelector('.btn-ai-guide').onclick();assert.equal(aiCard,exercises[6].contentKey);window.openAIGuide=originalOpen;
e7.querySelector('.btn-submit-solution').onclick();assert.equal(window.document.getElementById('submissionModal').dataset.problemKey,undefined);assert.ok(window.document.getElementById('submissionModal').textContent.includes('Bài tập 7'));window.closeSubmissionModal();
// Source modal fetches this question, not another question with the same number.
window.VMODataService={getCatalogProblems:async({contentKey})=>exercises.filter(e=>e.contentKey===contentKey)};
await window.openReferenceLinksManager(exercises[6].contentKey);assert.equal(window.document.getElementById('referenceManagerProblemContent').value,exercises[6].content);window.closeReferenceLinksManager();
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('1.2')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,37);
assert.ok(window.document.querySelectorAll('.book-exercise')[11].querySelector('img').src.includes('stewart-1-2-a7a72f38/e11_12.png'));
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('1.3')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,71);
assert.equal(window.document.querySelectorAll('.book-exercise')[54].querySelectorAll('table').length,1);
assert.equal(window.document.querySelectorAll('.book-exercise')[5].querySelectorAll('img').length,2);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Thuật ngữ bổ sung'));
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('1.4')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,35);
assert.equal(window.document.querySelectorAll('.book-exercise')[8].querySelectorAll('img').length,2);
assert.equal(window.document.querySelectorAll('.book-exercise')[26].querySelectorAll('table').length,1);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Thuật ngữ bổ sung'));
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('1.5')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,83);
assert.equal(window.document.querySelectorAll('.book-exercise')[4].querySelectorAll('img').length,1);
assert.equal(window.document.querySelectorAll('.book-exercise')[2].querySelectorAll('table').length,1);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Thuật ngữ bổ sung'));
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent==='Ôn tập').onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,38);
for(const [title,count]of [['Kiểm tra khái niệm',13],['Câu hỏi đúng–sai',14]]){
 const heading=[...window.document.querySelectorAll('#booksContent h1')].find(h=>h.textContent===title);assert.ok(heading);let n=0;
 for(let x=heading.nextElementSibling;x&&!/^H[1-6]$/.test(x.tagName);x=x.nextElementSibling)if(x.tagName==='P'&&/^\d+\./.test(x.querySelector(':scope > strong')?.textContent||''))n++;
 assert.equal(n,count,'Review question groups retain independent numbering');
}
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent==='Các nguyên tắc giải toán').onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,22);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ví dụ 3.'));
// Chapter 2.1 uses the same independent exercise actions as Chapter 1.
const section21=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.1.')).id});
assert.equal(section21.exerciseHeading,'2.1. Bài tập');
assert.deepEqual(section21.exercises.map(e=>e.questionNumber),Array.from({length:9},(_,i)=>i+1));
assert.equal(new Set(section21.exercises.map(e=>e.contentKey)).size,9);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.1.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,9);
assert.equal(window.document.querySelectorAll('#booksContent img').length,8);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
// Chapter 2.2 uses the same independent exercise actions as Chapter 1.
const section22=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.2.')).id});
assert.equal(section22.exerciseHeading,'2.2. Bài tập');
assert.deepEqual(section22.exercises.map(e=>e.questionNumber),Array.from({length:51},(_,i)=>i+1));
assert.equal(new Set(section22.exercises.map(e=>e.contentKey)).size,51);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.2.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,51);
assert.equal(window.document.querySelectorAll('#booksContent img').length,22);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
// Chapter 2.3 uses the same independent exercise actions as Chapter 1.
const section23=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.3.')).id});
assert.equal(section23.exerciseHeading,'2.3. Bài tập');
assert.deepEqual(section23.exercises.map(e=>e.questionNumber),Array.from({length:68},(_,i)=>i+1));
assert.equal(new Set(section23.exercises.map(e=>e.contentKey)).size,68);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.3.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,68);
assert.equal(window.document.querySelectorAll('#booksContent img').length,10);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
// Chapter 2.4 uses the same independent exercise actions as Chapter 1.
const section24=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.4.')).id});
assert.equal(section24.exerciseHeading,'2.4. Bài tập');
assert.deepEqual(section24.exercises.map(e=>e.questionNumber),Array.from({length:44},(_,i)=>i+1));
assert.equal(new Set(section24.exercises.map(e=>e.contentKey)).size,44);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.4.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,44);
assert.equal(window.document.querySelectorAll('#booksContent img').length,19);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
// Chapter 2.5 uses the same independent exercise actions as Chapter 1.
const section25=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.5.')).id});
assert.equal(section25.exerciseHeading,'2.5. Bài tập');
assert.deepEqual(section25.exercises.map(e=>e.questionNumber),Array.from({length:76},(_,i)=>i+1));
assert.equal(new Set(section25.exercises.map(e=>e.contentKey)).size,76);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.5.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,76);
assert.equal(window.document.querySelectorAll('#booksContent img').length,15);
assert.ok(window.document.getElementById('booksContent').textContent.includes('Ghi chú biên tập'));
// Chapter 2.6 uses the same independent exercise actions as Chapter 1.
const section26=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.6.')).id});
assert.equal(section26.exerciseHeading,'2.6. Bài tập');
assert.deepEqual(section26.exercises.map(e=>e.questionNumber),Array.from({length:81},(_,i)=>i+1));
assert.equal(new Set(section26.exercises.map(e=>e.contentKey)).size,81);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.6.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,81);
assert.equal(window.document.querySelectorAll('#booksContent img').length,26);
assert.ok(window.document.getElementById('booksContent').textContent.replace(/\s+/g,' ').includes('Chú thích biên tập và thuật ngữ'));
// Chapter 2.7 uses the same independent exercise actions as Chapter 1.
const section27=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.7.')).id});
assert.equal(section27.exerciseHeading,'2.7. Bài tập');
assert.deepEqual(section27.exercises.map(e=>e.questionNumber),Array.from({length:60},(_,i)=>i+1));
assert.equal(new Set(section27.exercises.map(e=>e.contentKey)).size,60);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.7.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,60);
assert.equal(window.document.querySelectorAll('#booksContent img').length,16);
assert.ok(window.document.getElementById('booksContent').textContent.replace(/\s+/g,' ').includes('Chú thích biên tập và thuật ngữ'));
assert.ok(window.document.getElementById('booksContent').textContent.replace(/\s+/g,' ').includes('Chuyên đề viết: Các phương pháp ban đầu để tìm tiếp tuyến'));
// Chapter 2.8 uses the same independent exercise actions as Chapter 1.
const section28=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title.startsWith('2.8.')).id});
assert.equal(section28.exerciseHeading,'2.8. Bài tập');
assert.deepEqual(section28.exercises.map(e=>e.questionNumber),Array.from({length:68},(_,i)=>i+1));
assert.equal(new Set(section28.exercises.map(e=>e.contentKey)).size,68);
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent.startsWith('2.8.')).onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,68);
assert.equal(window.document.querySelectorAll('#booksContent img').length,36);
assert.ok(window.document.getElementById('booksContent').textContent.replace(/\s+/g,' ').includes('Chú thích biên tập và thuật ngữ'));
// Chapter 2 review uses the same independent exercise actions as Chapter 1.
const section2r=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title==='Ôn tập'&&s.parentId===detail.sections.find(x=>x.title.startsWith('Chương 2.')).id).id});
assert.equal(section2r.exerciseHeading,'Bài tập');
assert.deepEqual(section2r.exercises.map(e=>e.questionNumber),Array.from({length:56},(_,i)=>i+1));
assert.equal(new Set(section2r.exercises.map(e=>e.contentKey)).size,56);
await [...window.document.querySelectorAll('#booksToc button')].filter(b=>b.textContent==='Ôn tập')[1].onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,56);
assert.equal(window.document.querySelectorAll('#booksContent img').length,7);
assert.ok(window.document.getElementById('booksContent').textContent.replace(/\s+/g,' ').includes('Chú thích biên tập và thuật ngữ'));
for(const [title,count]of [['Kiểm tra khái niệm',16],['Câu hỏi đúng–sai',26]]){const h=[...window.document.querySelectorAll('#booksContent h1')].find(h=>h.textContent===title);let n=0;for(let x=h.nextElementSibling;x&&!/^H[1-6]$/.test(x.tagName);x=x.nextElementSibling){const ps=x.tagName==='P'?[x]:[...x.querySelectorAll('p')];n+=ps.filter(p=>/^\d+\./.test(p.querySelector(':scope > strong')?.textContent||'')).length;}assert.equal(n,count);}
// Chapter 2 Problems Plus keeps its example and independent exercise identities.
const section2p=await readBooks(db,student,{bookId:book.id,sectionId:detail.sections.find(s=>s.title==='Bài tập nâng cao'&&s.parentId===detail.sections.find(x=>x.title.startsWith('Chương 2.')).id).id});
assert.equal(section2p.exerciseHeading,'Bài toán');
assert.deepEqual(section2p.exercises.map(e=>e.questionNumber),Array.from({length:14},(_,i)=>i+1));
assert.equal(new Set(section2p.exercises.map(e=>e.contentKey)).size,14);
await [...[...window.document.querySelectorAll('#booksToc details')].find(d=>d.querySelector(':scope > summary')?.textContent.startsWith('Chương 2.')).querySelectorAll('button')].find(b=>b.textContent==='Bài tập nâng cao').onclick();
for(const selector of ['.book-exercise','.book-exercise .btn-ai-guide','.book-exercise .btn-submit-solution','.book-exercise .btn-manage-reference-links'])assert.equal(window.document.querySelectorAll(selector).length,14);
assert.equal(window.document.querySelectorAll('#booksContent img').length,2);
const plusText=window.document.getElementById('booksContent').textContent.replace(/\s+/g,' ');
assert.ok(plusText.includes('Ví dụ'));assert.ok(plusText.includes('Các bài toán sau nhằm kiểm tra'));assert.ok(plusText.includes('Chú thích biên tập và thuật ngữ'));
// Return to an unformatted legacy section to test the editor's default format.
await [...window.document.querySelectorAll('#booksToc button')].find(b=>b.textContent==='Khái quát về Giải tích').onclick();

await [...window.document.querySelectorAll('#booksContent button')].find(b=>b.textContent==='✏️ Chỉnh sửa nội dung').onclick();
assert.equal(window.document.querySelector('#booksEditor select[name=contentFormat]').value,'plain-latex');
[...window.document.querySelectorAll('#booksEditor button')].find(b=>b.textContent==='Hủy').onclick();
const buttons=()=>[...window.document.querySelectorAll('#tab-books button')];
await buttons().find(b=>b.textContent==='＋ Thêm nhóm sách').onclick();
let form=window.document.querySelector('#booksEditor form');form.elements.name.value='Nhóm từ giao diện';await form.onsubmit({preventDefault(){}});
assert.ok(window.document.getElementById('booksControls').textContent.includes('Nhóm từ giao diện'));
await buttons().find(b=>b.textContent==='＋ Thêm sách').onclick();form=window.document.querySelector('#booksEditor form');form.elements.title.value='Sách từ giao diện';await form.onsubmit({preventDefault(){}});
await buttons().find(b=>b.textContent==='＋ Thêm chương / mục').onclick();form=window.document.querySelector('#booksEditor form');assert.equal(form.elements.parentId.required,false);form.elements.title.value='Mục thử';form.elements.content.value=String.raw`$x\neq1$ <img src=x onerror=alert(1)>`;await form.onsubmit({preventDefault(){}});
assert.ok(window.document.getElementById('booksContent').textContent.includes(String.raw`\neq`));assert.equal(window.document.querySelector('#booksContent img'),null);
user=student;await window.loadBooks(true);assert.equal(buttons().some(b=>/Chỉnh sửa|Thêm|Đổi tên/.test(b.textContent)),false);
assert.equal(filterAppShell(read('index.html'),other).includes('id="tab-books"'),false);
// Render the entire imported section through the actual allowlisted HTML/MathJax path.
const importedTarget=window.document.createElement('div');await window.renderBookContent(importedTarget,imported);
assert.equal(importedTarget.querySelectorAll('img').length,35);assert.equal(importedTarget.querySelectorAll('table').length,9);
assert.ok(importedTarget.textContent.includes('Bảng thuật ngữ'));assert.ok(importedTarget.textContent.includes('Ví dụ 11.'));assert.ok(importedTarget.textContent.includes('88.'));
await window.renderBookContent(importedTarget,{contentFormat:'html-latex',content:'<script>alert(1)</script><svg onload="alert(1)"></svg><iframe src="https://evil.test"></iframe><img src="https://evil.test/steal"><img src="/api/data?resource=book_asset&asset=stewart-1-1-47c33e6c/f01.png" onerror="alert(1)"><p onclick="alert(1)">Safe $x=1$</p><a href="javascript:alert(1)">bad</a>'});
assert.equal(importedTarget.querySelectorAll('script,svg,iframe,[onclick],[onerror]').length,0);assert.equal(importedTarget.querySelectorAll('img').length,1);assert.equal(importedTarget.querySelector('a').hasAttribute('href'),false);
const asset=await readBookAsset(student,'stewart-1-1-47c33e6c/f01.png');assert.equal(asset.mime,'image/png');assert.equal(asset.bytes[0],137);
await assert.rejects(()=>readBookAsset(other,'stewart-1-1-47c33e6c/f01.png'),e=>e.status===403);
for(const value of ['../imports/Stewart_Ch01_1_1_VI.tex','unknown.png','stewart-1-1-47c33e6c/%2e%2e/source'])await assert.rejects(()=>readBookAsset(student,value),e=>e.status===404);
// Exercise identity and edits survive reinitialization; deleting the section disables its questions.
const editable=rows.find(r=>String(r._id)===exercises[6].id);editable.content='<p>Admin corrected $3x-5y=7$</p>';editable.version=2;
const reloaded=await readBooks(db,student,{bookId:book.id,sectionId:child.id});assert.equal(reloaded.exercises.length,88);assert.equal(reloaded.exercises.find(e=>e.id===exercises[6].id).content,editable.content);
const liveSection=reloaded.section;
await mutateBooks(db,admin,'books_delete_section',{id:child.id,expectedVersion:liveSection.version});
assert.equal(rows.find(r=>String(r._id)===exercises[6].id).status,'deleted');
const deletedSection=(await readBooks(db,admin,{bookId:book.id,sectionId:child.id,includeDeleted:'1'})).section;
await mutateBooks(db,admin,'books_restore_section',{id:child.id,expectedVersion:deletedSection.version});
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child.id})).exercises.find(e=>e.id===exercises[6].id).content,editable.content);
const images=await readBookProblemImages({bookAssetKeys:['stewart-1-1-47c33e6c/e03.png']},student);assert.ok(images[0].startsWith('data:image/png;base64,'));
await assert.rejects(()=>readBookProblemImages({bookAssetKeys:['stewart-1-1-47c33e6c/e03.png']},other),e=>e.status===403);
await assert.rejects(()=>readBookProblemImages({bookAssetKeys:['https://evil.test/image.png']},student),e=>e.status===404);
const image12=await readBookAsset(student,'stewart-1-2-a7a72f38/e03.png');assert.equal(image12.bytes[0],137);
await assert.rejects(()=>readBookAsset(other,'stewart-1-2-a7a72f38/e03.png'),e=>e.status===403);
const render12=window.document.createElement('div');await window.renderBookContent(render12,section12.section);assert.equal(render12.querySelectorAll('img').length,33);assert.equal(render12.querySelectorAll('table').length,11);
const changed12=await mutateBooks(db,admin,'books_save_section',{id:child12.id,expectedVersion:2,title:child12.title,order:2,content:section12.section.content+'<p>Admin edit.</p>',contentFormat:'html-latex'});
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child12.id})).section.content,changed12.content);
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child12.id})).exercises.length,37);
const image13=await readBookAsset(student,'stewart-1-3-65a41611/e03.png');assert.equal(image13.bytes[0],137);
await assert.rejects(()=>readBookAsset(other,'stewart-1-3-65a41611/e03.png'),e=>e.status===403);
const render13=window.document.createElement('div');await window.renderBookContent(render13,section13.section);assert.equal(render13.querySelectorAll('img').length,19);assert.equal(render13.querySelectorAll('table').length,4);
const changed13=await mutateBooks(db,admin,'books_save_section',{id:child13.id,expectedVersion:2,title:child13.title,order:3,content:section13.section.content+'<p>Admin edit.</p>',contentFormat:'html-latex'});
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child13.id})).section.content,changed13.content);assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child13.id})).exercises.length,71);
const image14=await readBookAsset(student,'stewart-1-4-c1a9f973/f11.png');assert.equal(image14.bytes[0],137);
await assert.rejects(()=>readBookAsset(other,'stewart-1-4-c1a9f973/f11.png'),e=>e.status===403);
const render14=window.document.createElement('div');await window.renderBookContent(render14,section14.section);assert.equal(render14.querySelectorAll('img').length,19);assert.equal(render14.querySelectorAll('table').length,5);
const changed14=await mutateBooks(db,admin,'books_save_section',{id:child14.id,expectedVersion:2,title:child14.title,order:4,content:section14.section.content+'<p>Admin edit.</p>',contentFormat:'html-latex'});
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child14.id})).section.content,changed14.content);assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child14.id})).exercises.length,35);
const image15=await readBookAsset(student,'stewart-1-5-6c69c192/e05_08.png');assert.equal(image15.bytes[0],137);
await assert.rejects(()=>readBookAsset(other,'stewart-1-5-6c69c192/e05_08.png'),e=>e.status===403);
const render15=window.document.createElement('div');await window.renderBookContent(render15,section15.section);assert.equal(render15.querySelectorAll('img').length,29);assert.equal(render15.querySelectorAll('table').length,5);
const changed15=await mutateBooks(db,admin,'books_save_section',{id:child15.id,expectedVersion:2,title:child15.title,order:5,content:section15.section.content+'<p>Admin edit.</p>',contentFormat:'html-latex'});
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child15.id})).section.content,changed15.content);assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:child15.id})).exercises.length,83);
const imageReview=await readBookAsset(student,'stewart-1-review-f5f8bf56/ex01.png');assert.equal(imageReview.bytes[0],137);
await assert.rejects(()=>readBookAsset(other,'stewart-1-review-f5f8bf56/ex01.png'),e=>e.status===403);
const renderReview=window.document.createElement('div');await window.renderBookContent(renderReview,review.section);assert.equal(renderReview.querySelectorAll('img').length,3);assert.equal(renderReview.querySelectorAll('table').length,2);
const changedReview=await mutateBooks(db,admin,'books_save_section',{id:childReview.id,expectedVersion:2,title:childReview.title,order:900,content:review.section.content+'<p>Admin edit.</p>',contentFormat:'html-latex'});
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:childReview.id})).section.content,changedReview.content);assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:childReview.id})).exercises.length,38);
const imagePrinciples=await readBookAsset(student,'stewart-1-principles-06d484fa/f01.png');assert.equal(imagePrinciples.bytes[0],137);
await assert.rejects(()=>readBookAsset(other,'stewart-1-principles-06d484fa/f01.png'),e=>e.status===403);
const renderPrinciples=window.document.createElement('div');await window.renderBookContent(renderPrinciples,principles.section);assert.equal(renderPrinciples.querySelectorAll('img').length,1);assert.equal(renderPrinciples.querySelectorAll('table').length,1);
const changedPrinciples=await mutateBooks(db,admin,'books_save_section',{id:childPrinciples.id,expectedVersion:2,title:childPrinciples.title,order:902,content:principles.section.content+'<p>Admin edit.</p>',contentFormat:'html-latex'});
assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:childPrinciples.id})).section.content,changedPrinciples.content);assert.equal((await readBooks(db,student,{bookId:book.id,sectionId:childPrinciples.id})).exercises.length,22);



// Section 3.2 uses the same persisted exercise/action path as section 1.1.
const child32=detail.sections.find(s=>s.title.startsWith('3.2'));
const section32=await readBooks(db,student,{bookId:book.id,sectionId:child32.id});
assert.equal(section32.exerciseHeading,'3.2. Bài tập');
assert.deepEqual(section32.exercises.map(e=>e.questionNumber),Array.from({length:66},(_,i)=>i+1));
assert.ok(section32.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
assert.ok(section32.exercises[2].content.includes('Tính đạo hàm'));
assert.ok(section32.exercises[30].content.includes('31–34.'));
assert.ok(section32.exercises[50].content.includes('/e51.png'));
assert.ok(section32.exercises[51].content.includes('/e52.png'));
assert.ok(section32.exercises[57].content.includes('Phương pháp ở Bài tập 57'));
assert.ok(section32.exercises[65].content.includes('Quy tắc nghịch đảo'));
const doc32=new JSDOM(section32.section.content);
assert.equal(doc32.window.document.querySelectorAll('img').length,6);
for(const image of doc32.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc32.window.close();
const repeat32=await readBooks(db,student,{bookId:book.id,sectionId:child32.id});
assert.deepEqual(repeat32.exercises.map(e=>e.contentKey),section32.exercises.map(e=>e.contentKey));

// Section 3.3 shares section 1.1's persisted problems and action initialization.
const child33=detail.sections.find(s=>s.title.startsWith('3.3'));
const section33=await readBooks(db,student,{bookId:book.id,sectionId:child33.id});
assert.equal(section33.exerciseHeading,'3.3. Bài tập');
assert.deepEqual(section33.exercises.map(e=>e.questionNumber),Array.from({length:68},(_,i)=>i+1));
assert.ok(section33.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,22])assert.ok(section33.exercises[n-1].content.includes('Tính đạo hàm'));
for(const n of [45,60])assert.ok(section33.exercises[n-1].content.includes('Tìm giới hạn'));
for(const n of [41,66,67])assert.ok(section33.exercises[n-1].content.includes('/e'+n+'.png'));
assert.ok(section33.exercises[67].content.includes('giới hạn bên trái'));
const doc33=new JSDOM(section33.section.content);
assert.equal(doc33.window.document.querySelectorAll('img').length,9);
assert.equal(section33.section.sourceInfo.exampleCount,7);
for(const image of doc33.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc33.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child33.id})).exercises.map(e=>e.contentKey),section33.exercises.map(e=>e.contentKey));

// Chain-rule exercises use the same action initialization as section 1.1.
const child34=detail.sections.find(s=>s.title.startsWith('3.4'));
const section34=await readBooks(db,student,{bookId:book.id,sectionId:child34.id});
assert.equal(section34.exerciseHeading,'3.4. Bài tập');
assert.deepEqual(section34.exercises.map(e=>e.questionNumber),Array.from({length:102},(_,i)=>i+1));
assert.ok(section34.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,6])assert.ok(section34.exercises[n-1].content.includes('Viết hàm hợp'));
for(const n of [7,52])assert.ok(section34.exercises[n-1].content.includes('Tìm đạo hàm'));
for(const n of [71,72,73,99])assert.ok(section34.exercises[n-1].content.includes('/e'+n+'.png'));
assert.ok(section34.exercises[69].content.includes('<table>'));
assert.ok(section34.exercises[93].content.includes('<table>'));
assert.ok(section34.section.content.includes('Dự án ứng dụng'));
const doc34=new JSDOM(section34.section.content);
assert.equal(doc34.window.document.querySelectorAll('img').length,6);
assert.equal(section34.section.sourceInfo.exampleCount,10);
for(const image of doc34.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc34.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child34.id})).exercises.map(e=>e.contentKey),section34.exercises.map(e=>e.contentKey));

// Implicit-differentiation exercises share section 1.1's persisted action path.
const child35=detail.sections.find(s=>s.title.startsWith('3.5'));
const section35=await readBooks(db,student,{bookId:book.id,sectionId:child35.id});
assert.equal(section35.exerciseHeading,'3.5. Bài tập');
assert.deepEqual(section35.exercises.map(e=>e.questionNumber),Array.from({length:67},(_,i)=>i+1));
assert.ok(section35.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,4])assert.ok(section35.exercises[n-1].content.includes('Giải phương trình'));
for(const n of [5,22])assert.ok(section35.exercises[n-1].content.includes('Tìm'));
for(const n of [25,26])assert.ok(section35.exercises[n-1].content.includes('biến độc lập'));
for(const n of [53,56])assert.ok(section35.exercises[n-1].content.includes('trực giao'));
for(const n of [33,34,35,36,67])assert.ok(section35.exercises[n-1].content.includes('/e'+n+'.png'));
assert.ok(section35.exercises[46].content.includes('25(x^2-y^2)'));
assert.ok(section35.exercises[46].content.includes('\\[2('));
assert.ok(section35.section.content.includes('Dự án khám phá'));
const doc35=new JSDOM(section35.section.content);
assert.equal(doc35.window.document.querySelectorAll('img').length,13);
assert.equal(section35.section.sourceInfo.exampleCount,4);
for(const image of doc35.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc35.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child35.id})).exercises.map(e=>e.contentKey),section35.exercises.map(e=>e.contentKey));

// Section 3.6 uses section 1.1's persisted problem/action initialization.
const child36=detail.sections.find(s=>s.title.startsWith('3.6'));
const section36=await readBooks(db,student,{bookId:book.id,sectionId:child36.id});
assert.equal(section36.exerciseHeading,'3.6. Bài tập');
assert.deepEqual(section36.exercises.map(e=>e.questionNumber),Array.from({length:88},(_,i)=>i+1));
assert.ok(section36.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [2,26])assert.ok(section36.exercises[n-1].content.includes('Tính đạo hàm'));
for(const n of [45,56])assert.ok(section36.exercises[n-1].content.includes('bằng logarit'));
for(const n of [63,78])assert.ok(section36.exercises[n-1].content.includes('rút gọn'));
for(const n of [84,85,86])assert.ok(section36.exercises[n-1].content.includes('Nội dung tham chiếu — Bài tập 83'));
assert.ok(section36.exercises[87].content.includes('Nội dung tham chiếu — Bài tập 87'));
assert.ok(section36.exercises[81].content.includes('|x|'));
const doc36=new JSDOM(section36.section.content);
assert.equal(doc36.window.document.querySelectorAll('img').length,5);
assert.equal(section36.section.sourceInfo.exampleCount,10);
for(const image of doc36.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc36.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child36.id})).exercises.map(e=>e.contentKey),section36.exercises.map(e=>e.contentKey));

// Rates-of-change exercises share section 1.1's persisted action initialization.
const child37=detail.sections.find(s=>s.title.startsWith('3.7'));
const section37=await readBooks(db,student,{bookId:book.id,sectionId:child37.id});
assert.equal(section37.exerciseHeading,'3.7. Bài tập');
assert.deepEqual(section37.exercises.map(e=>e.questionNumber),Array.from({length:43},(_,i)=>i+1));
assert.ok(section37.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,2,3,4]){
 assert.ok(section37.exercises[n-1].content.includes('tổng quãng đường'));
 assert.ok(section37.exercises[n-1].content.includes('nhanh dần'));
 assert.ok(section37.exercises[n-1].content.includes('/f02.png'));
}
for(const [n,name]of [[5,'e05'],[6,'e06'],[7,'e07'],[8,'e07'],[31,'f08']])assert.ok(section37.exercises[n-1].content.includes('/'+name+'.png'));
assert.ok(section37.exercises[30].content.includes('\\tag{1}'));
for(const n of [29,30])assert.ok(section37.exercises[n-1].content.includes('<table>'));
const doc37=new JSDOM(section37.section.content);
assert.equal(doc37.window.document.querySelectorAll('img').length,12);
assert.equal(section37.section.sourceInfo.exampleCount,8);
for(const image of doc37.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc37.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child37.id})).exercises.map(e=>e.contentKey),section37.exercises.map(e=>e.contentKey));

// Exponential growth/decay exercises share section 1.1's action initialization.
const child38=detail.sections.find(s=>s.title.startsWith('3.8'));
const section38=await readBooks(db,student,{bookId:book.id,sectionId:child38.id});
assert.equal(section38.exerciseHeading,'3.8. Bài tập');
assert.deepEqual(section38.exercises.map(e=>e.questionNumber),Array.from({length:22},(_,i)=>i+1));
assert.ok(section38.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [11,12,13]){
 assert.ok(section38.exercises[n-1].content.includes('5730'));
 assert.ok(section38.exercises[n-1].content.includes('carbon phóng xạ'));
}
for(const n of [5,6])assert.ok(section38.exercises[n-1].content.includes('<table>'));
assert.ok(section38.section.content.includes('Kiểm soát lượng hồng cầu'));
assert.ok(section38.section.content.includes('28 ngày'));
const doc38=new JSDOM(section38.section.content);
assert.equal(doc38.window.document.querySelectorAll('img').length,4);
assert.equal(section38.section.sourceInfo.exampleCount,4);
for(const image of doc38.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc38.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child38.id})).exercises.map(e=>e.contentKey),section38.exercises.map(e=>e.contentKey));

// Related-rates exercises share section 1.1's persisted action initialization.
const child39=detail.sections.find(s=>s.title.startsWith('3.9'));
const section39=await readBooks(db,student,{bookId:book.id,sectionId:child39.id});
assert.equal(section39.exerciseHeading,'3.9. Bài tập');
assert.deepEqual(section39.exercises.map(e=>e.questionNumber),Array.from({length:53},(_,i)=>i+1));
assert.ok(section39.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [13,14,15,16])assert.ok(section39.exercises[n-1].content.includes('Những đại lượng nào'));
for(const n of [20,22,29,30,39,44])assert.ok(section39.exercises[n-1].content.includes('/ex'+n+'.png'));
for(const n of [35,36]){
 assert.ok(section39.exercises[n-1].content.includes('Dữ kiện tham chiếu — Ví dụ 2'));
 assert.ok(section39.exercises[n-1].content.includes('/fig2.png'));
 assert.ok(section39.exercises[n-1].content.includes('10'));
}
const doc39=new JSDOM(section39.section.content);
assert.equal(doc39.window.document.querySelectorAll('img').length,11);
assert.equal(section39.section.sourceInfo.exampleCount,5);
for(const image of doc39.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc39.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child39.id})).exercises.map(e=>e.contentKey),section39.exercises.map(e=>e.contentKey));

// Linear approximation/differential exercises share section 1.1's action path.
const child310=detail.sections.find(s=>s.title.startsWith('3.10.'));
const section310=await readBooks(db,student,{bookId:book.id,sectionId:child310.id});
assert.equal(section310.exerciseHeading,'3.10. Bài tập');
assert.deepEqual(section310.exercises.map(e=>e.questionNumber),Array.from({length:52},(_,i)=>i+1));
assert.ok(section310.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,4])assert.ok(section310.exercises[n-1].content.includes('tuyến tính hóa'));
for(const n of [7,10])assert.ok(section310.exercises[n-1].content.includes('sai số nhỏ hơn'));
for(const n of [23,24,25,26])assert.ok(section310.exercises[n-1].content.includes('/fig5.png'));
assert.ok(section310.exercises[50].content.includes('/ex51.png'));
assert.ok(section310.section.content.includes('Dự án khám phá'));
const doc310=new JSDOM(section310.section.content);
assert.equal(doc310.window.document.querySelectorAll('img').length,7);
assert.equal(section310.section.sourceInfo.exampleCount,4);
for(const image of doc310.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc310.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child310.id})).exercises.map(e=>e.contentKey),section310.exercises.map(e=>e.contentKey));

// Hyperbolic functions use the same persisted exercises and actions as section 1.1.
const child311=detail.sections.find(s=>s.title.startsWith('3.11.'));
const section311=await readBooks(db,student,{bookId:book.id,sectionId:child311.id});
assert.equal(section311.exerciseHeading,'3.11. Bài tập');
assert.deepEqual(section311.exercises.map(e=>e.questionNumber),Array.from({length:67},(_,i)=>i+1));
assert.ok(section311.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,6])assert.ok(section311.exercises[n-1].content.includes('Tìm giá trị số'));
for(const n of [35,53])assert.ok(section311.exercises[n-1].content.includes('Tìm đạo hàm'));
for(const n of [30,31,32])assert.ok(section311.exercises[n-1].content.includes('\\tag{'));
for(const n of [28,33,34])assert.ok(section311.exercises[n-1].content.includes('Đạo hàm của các hàm'));
assert.ok(section311.exercises[60].content.includes('Dữ kiện tham chiếu — Bài tập 60'));
assert.ok(section311.exercises[58].content.includes('/ex59.png'));
assert.ok(section311.exercises[4].content.includes('\\operatorname{sech}'));
assert.equal(/\\(?:sech|csch)\b/.test(section311.section.content),false);
const doc311=new JSDOM(section311.section.content);
assert.equal(doc311.window.document.querySelectorAll('img').length,12);
assert.equal(section311.section.sourceInfo.exampleCount,5);
for(const image of doc311.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc311.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child311.id})).exercises.map(e=>e.contentKey),section311.exercises.map(e=>e.contentKey));

// Chapter 3 review keeps concept/true-false material and persists all 116 exercises.
const chapter3ReviewParent=detail.sections.find(s=>s.title.startsWith('Chương 3.'));
const child3Review=detail.sections.find(s=>s.title==='Ôn tập'&&s.parentId===chapter3ReviewParent.id);
const section3Review=await readBooks(db,student,{bookId:book.id,sectionId:child3Review.id});
assert.equal(section3Review.exerciseHeading,'Bài tập');
assert.deepEqual(section3Review.exercises.map(e=>e.questionNumber),Array.from({length:116},(_,i)=>i+1));
assert.ok(section3Review.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,54])assert.ok(section3Review.exercises[n-1].content.includes('Tính'));
for(const n of [75,82])assert.ok(section3Review.exercises[n-1].content.includes('theo'));
for(const n of [110,112])assert.ok(section3Review.exercises[n-1].content.includes('Biểu diễn giới hạn'));
for(const n of [74,104])assert.ok(section3Review.exercises[n-1].content.includes('/ex'+n+'.png'));
assert.equal(section3Review.section.sourceInfo.conceptCheckCount,7);
assert.equal(section3Review.section.sourceInfo.trueFalseCount,15);
assert.equal(/\\(?:cc|tf)\b/.test(section3Review.section.content),false);
const doc3Review=new JSDOM(section3Review.section.content);
for(const [label,count]of [['Kiểm tra khái niệm',7],['Trắc nghiệm đúng–sai',15]]){
 const h=[...doc3Review.window.document.querySelectorAll('h1')].find(h=>h.textContent===label);assert.ok(h);
 let found=0;for(let n=h.nextElementSibling;n&&!/^H[1-6]$/.test(n.nodeName);n=n.nextElementSibling)if(n.matches('p')&&/^\d+\.$/.test(n.querySelector(':scope > strong')?.textContent||''))found++;
 assert.equal(found,count);
}
assert.equal(doc3Review.window.document.querySelectorAll('img').length,2);
for(const image of doc3Review.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc3Review.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child3Review.id})).exercises.map(e=>e.contentKey),section3Review.exercises.map(e=>e.contentKey));

// Chapter 3 Problems Plus shares section 1.1's persisted actions.
const child3Plus=detail.sections.find(s=>s.title==='Bài tập nâng cao'&&s.parentId===chapter3ReviewParent.id);
const section3Plus=await readBooks(db,student,{bookId:book.id,sectionId:child3Plus.id});
assert.equal(section3Plus.exerciseHeading,'Bài toán');
assert.deepEqual(section3Plus.exercises.map(e=>e.questionNumber),Array.from({length:35},(_,i)=>i+1));
assert.ok(section3Plus.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,8,11,15,19,22,23])assert.ok(section3Plus.exercises[n-1].content.includes('/ex'+n+'.png'));
assert.equal(section3Plus.section.sourceInfo.exampleCount,2);
assert.ok(section3Plus.section.content.includes('Ví dụ 1.'));
assert.ok(section3Plus.section.content.includes('Ví dụ 2.'));
assert.ok(section3Plus.section.content.includes('Lời giải.'));
const doc3Plus=new JSDOM(section3Plus.section.content);
assert.equal(doc3Plus.window.document.querySelectorAll('img').length,11);
for(const image of doc3Plus.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc3Plus.window.close();
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child3Plus.id})).exercises.map(e=>e.contentKey),section3Plus.exercises.map(e=>e.contentKey));

// Exercise the actual browser sanitizer, not only source HTML or the asset API.
for(const name of fs.readdirSync(new URL('../data/books/imports/',import.meta.url)).filter(n=>n.endsWith('.json'))){
 const entry=JSON.parse(fs.readFileSync(new URL('../data/books/imports/'+name,import.meta.url),'utf8'));
 const original=new JSDOM(entry.content);const expected=[...original.window.document.querySelectorAll('img')].map(img=>img.getAttribute('src'));
 const target=window.document.createElement('div');await window.renderBookContent(target,entry,false);
 assert.deepEqual([...target.querySelectorAll('img')].map(img=>img.getAttribute('src')),expected,'All images survive browser rendering: '+name);
 original.window.close();
 const catalog=JSON.parse(fs.readFileSync(new URL('../data/books/exercises/'+name,import.meta.url),'utf8'));
 for(const exercise of catalog.exercises.filter(e=>e.content.includes('<img'))){
  const originalExercise=new JSDOM(exercise.content);const expectedExercise=[...originalExercise.window.document.querySelectorAll('img')].map(img=>img.getAttribute('src'));
  await window.renderBookContent(target,{contentFormat:'html-latex',content:exercise.content},false);
  assert.deepEqual([...target.querySelectorAll('img')].map(img=>img.getAttribute('src')),expectedExercise,'Exercise images survive: '+name+' #'+exercise.number);
  originalExercise.window.close();
 }
}
const blockedBookImages=window.document.createElement('div');
await window.renderBookContent(blockedBookImages,{contentFormat:'html-latex',content:'<img src="https://evil.test/api/data?resource=book_asset&asset=stewart-3-2-67883edf/f01.png"><img src="/api/data?resource=book_asset&asset=stewart-3-2-00000000/f01.png"><img src="/api/data?resource=book_asset&asset=stewart-3-2-67883edf/../secret.png">'},false);
assert.equal(blockedBookImages.querySelectorAll('img').length,0,'External, unapproved and traversal image paths stay blocked');



// Section 4.1 keeps graph-only questions and all source/project figures.
const child41=detail.sections.find(s=>s.title.startsWith('4.1'));
const section41=await readBooks(db,student,{bookId:book.id,sectionId:child41.id});
assert.equal(section41.exerciseHeading,'4.1. Bài tập');
assert.deepEqual(section41.exercises.map(e=>e.questionNumber),Array.from({length:82},(_,i)=>i+1));
assert.ok(section41.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [3,4,5,6])assert.ok(section41.exercises[n-1].content.includes('/ex0'+n+'.png'));
for(const n of [51,66])assert.ok(section41.exercises[n-1].content.includes('trên đoạn đã cho'));
assert.ok(section41.exercises[77].content.includes('<table>'));
assert.ok(section41.section.content.includes('cầu vồng'));
assert.equal(section41.section.sourceInfo.exampleCount,10);
const doc41=new JSDOM(section41.section.content);
assert.equal(doc41.window.document.querySelectorAll('img').length,26);
for(const image of doc41.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc41.window.close();
const rendered41=window.document.createElement('div');await window.renderBookContent(rendered41,section41.section,false);
assert.equal(rendered41.querySelectorAll('img').length,26,'All Chapter 4 figures survive the frontend sanitizer');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child41.id})).exercises.map(e=>e.contentKey),section41.exercises.map(e=>e.contentKey));


// Mean value theorem content and graph-based exercises survive the actual UI path.
const child42=detail.sections.find(s=>s.title.startsWith('4.2'));
const section42=await readBooks(db,student,{bookId:book.id,sectionId:child42.id});
assert.equal(section42.exerciseHeading,'4.2. Bài tập');
assert.deepEqual(section42.exercises.map(e=>e.questionNumber),Array.from({length:42},(_,i)=>i+1));
assert.ok(section42.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,3,5,6,7,8])assert.ok(section42.exercises[n-1].content.includes('/ex0'+n+'.png'));
for(const n of [5,8])assert.ok(section42.exercises[n-1].content.includes('giả thiết'));
assert.ok(section42.exercises[35].content.includes('7. Hệ quả'));
for(const n of [38,39])assert.ok(section42.exercises[n-1].content.includes('Phương pháp của Ví dụ 6'));
assert.equal(section42.section.sourceInfo.exampleCount,6);
const doc42=new JSDOM(section42.section.content);
assert.equal(doc42.window.document.querySelectorAll('img').length,12);
for(const image of doc42.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc42.window.close();
const rendered42=window.document.createElement('div');await window.renderBookContent(rendered42,section42.section,false);
assert.equal(rendered42.querySelectorAll('img').length,12,'All section 4.2 images survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child42.id})).exercises.map(e=>e.contentKey),section42.exercises.map(e=>e.contentKey));


// Derivatives and graph shapes: preserve shared tasks and every graph-only exercise.
const child43=detail.sections.find(s=>s.title.startsWith('4.3'));
const section43=await readBooks(db,student,{bookId:book.id,sectionId:child43.id});
assert.equal(section43.exerciseHeading,'4.3. Bài tập');
assert.deepEqual(section43.exercises.map(e=>e.questionNumber),Array.from({length:99},(_,i)=>i+1));
assert.ok(section43.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,2,5,6,7,8,42,43,44,75,80])assert.ok(section43.exercises[n-1].content.includes('/ex'+String(n).padStart(2,'0')+'.png'));
for(const n of [1,2])assert.ok(section43.exercises[n-1].content.includes('Tọa độ các điểm uốn'));
for(const n of [45,58])assert.ok(section43.exercises[n-1].content.includes('đồng biến'));
for(const n of [88,89,90])assert.ok(section43.exercises[n-1].content.includes('khả vi hai lần'));
assert.equal(section43.section.sourceInfo.exampleCount,8);
const doc43=new JSDOM(section43.section.content);
assert.equal(doc43.window.document.querySelectorAll('img').length,25);
for(const image of doc43.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc43.window.close();
const rendered43=window.document.createElement('div');await window.renderBookContent(rendered43,section43.section,false);
assert.equal(rendered43.querySelectorAll('img').length,25,'All section 4.3 figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child43.id})).exercises.map(e=>e.contentKey),section43.exercises.map(e=>e.contentKey));
// L’Hôpital: keep shared hypotheses and all source figures.
const child44=detail.sections.find(s=>s.title.startsWith('4.4'));
const section44=await readBooks(db,student,{bookId:book.id,sectionId:child44.id});
assert.equal(section44.exerciseHeading,'4.4. Bài tập');
assert.deepEqual(section44.exercises.map(e=>e.questionNumber),Array.from({length:92},(_,i)=>i+1));
assert.ok(section44.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [5,6,7,82,86])assert.ok(section44.exercises[n-1].content.includes('/ex'+String(n).padStart(2,'0')+'.png'));
for(const n of [1,2,3,4])assert.ok(section44.exercises[n-1].content.includes('h(x)=1')&&section44.exercises[n-1].content.includes('q(x)='));
for(const n of [8,70])assert.ok(section44.exercises[n-1].content.includes('khi thích hợp'));
assert.equal(section44.section.sourceInfo.exampleCount,10);
const doc44=new JSDOM(section44.section.content);
assert.equal(doc44.window.document.querySelectorAll('img').length,12);
for(const image of doc44.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc44.window.close();
const rendered44=window.document.createElement('div');await window.renderBookContent(rendered44,section44.section,false);
assert.equal(rendered44.querySelectorAll('img').length,12,'All section 4.4 figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child44.id})).exercises.map(e=>e.contentKey),section44.exercises.map(e=>e.contentKey));
// Curve-sketching synthesis: shared graph, requirements and referenced exercise.
const child45=detail.sections.find(s=>s.title.startsWith('4.5'));
const section45=await readBooks(db,student,{bookId:book.id,sectionId:child45.id});
assert.equal(section45.exerciseHeading,'4.5. Bài tập');
assert.deepEqual(section45.exercises.map(e=>e.questionNumber),Array.from({length:80},(_,i)=>i+1));
assert.ok(section45.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [1,54])assert.ok(section45.exercises[n-1].content.includes('Dùng các hướng dẫn'));
for(const n of [55,56,57,58]){
 assert.ok(section45.exercises[n-1].content.includes('/ex55_58.png'));
 for(const text of ['Miền xác định','Các số tới hạn',"g'(6)",'Mọi tiệm cận'])assert.ok(section45.exercises[n-1].content.includes(text));
}
for(const n of [63,64])assert.ok(section45.exercises[n-1].content.includes('/ex'+n+'.png'));
for(const n of [65,68])assert.ok(section45.exercises[n-1].content.includes('Không vẽ đường cong'));
for(const n of [69,74])assert.ok(section45.exercises[n-1].content.includes('Ở bước D'));
assert.ok(section45.exercises[78].content.includes('Nội dung tham chiếu — Bài tập 78'));
assert.equal(section45.section.sourceInfo.exampleCount,6);
const doc45=new JSDOM(section45.section.content);
assert.equal(doc45.window.document.querySelectorAll('img').length,16);
for(const image of doc45.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc45.window.close();
const rendered45=window.document.createElement('div');await window.renderBookContent(rendered45,section45.section,false);
assert.equal(rendered45.querySelectorAll('img').length,16,'All section 4.5 figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child45.id})).exercises.map(e=>e.contentKey),section45.exercises.map(e=>e.contentKey));
// Graphing with calculus and technology: shared instructions and referenced data.
const child46=detail.sections.find(s=>s.title.startsWith('4.6'));
const section46=await readBooks(db,student,{bookId:book.id,sectionId:child46.id});
assert.equal(section46.exerciseHeading,'4.6. Bài tập');
assert.deepEqual(section46.exercises.map(e=>e.questionNumber),Array.from({length:40},(_,i)=>i+1));
assert.ok(section46.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey&&e.content.includes('Các bài tập trong mục này sử dụng')));
for(const n of [1,8])assert.ok(section46.exercises[n-1].content.includes('các điểm uốn'));
for(const n of [11,12])assert.ok(section46.exercises[n-1].content.includes('Dùng quy tắc l’Hospital'));
for(const n of [25,26])assert.ok(section46.exercises[n-1].content.includes('hoành độ các điểm uốn'));
for(const n of [28,35])assert.ok(section46.exercises[n-1].content.includes('giá trị chuyển tiếp'));
assert.ok(section46.exercises[14].content.includes('Nội dung tham chiếu — Ví dụ 3'));
for(const name of ['fig10','fig11','fig12','fig13','fig14'])assert.ok(section46.exercises[14].content.includes('/'+name+'.png'));
assert.ok(section46.exercises[15].content.includes('Nội dung tham chiếu — Bài tập 14'));
assert.ok(section46.exercises[37].content.includes('/ex38.png'));
assert.equal(section46.section.sourceInfo.exampleCount,5);
const doc46=new JSDOM(section46.section.content);
assert.equal(doc46.window.document.querySelectorAll('img').length,22);
for(const image of doc46.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc46.window.close();
const rendered46=window.document.createElement('div');await window.renderBookContent(rendered46,section46.section,false);
assert.equal(rendered46.querySelectorAll('img').length,22,'All section 4.6 figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child46.id})).exercises.map(e=>e.contentKey),section46.exercises.map(e=>e.contentKey));
// Optimization: preserve illustrations, referenced data and both application projects.
const child47=detail.sections.find(s=>s.title.startsWith('4.7'));
const section47=await readBooks(db,student,{bookId:book.id,sectionId:child47.id});
assert.equal(section47.exerciseHeading,'4.7. Bài tập');
assert.deepEqual(section47.exercises.map(e=>e.questionNumber),Array.from({length:88},(_,i)=>i+1));
assert.ok(section47.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [14,20,23,40,41,46,47,53,56,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88])assert.ok(section47.exercises[n-1].content.includes('/ex'+n+'.png'));
for(const [n,ref] of [[16,15],[22,21],[24,23],[44,43],[58,57],[72,57]])assert.ok(section47.exercises[n-1].content.includes('Dữ kiện gốc — Bài tập '+ref));
assert.ok(section47.exercises[23].content.includes('/ex23.png'));
assert.ok(section47.exercises[54].content.includes('/fig07.png')&&section47.exercises[54].content.includes('tốc độ chèo là 6'));
assert.equal(section47.section.sourceInfo.exampleCount,6);
assert.ok(section47.section.content.includes('Dự án ứng dụng — Hình dạng của chiếc hộp'));
assert.ok(section47.section.content.includes('Dự án ứng dụng — Máy bay và chim'));
assert.equal((section47.section.content.match(/<strong>Câu [1-6]\.<\/strong>/g)||[]).length,11);
const doc47=new JSDOM(section47.section.content);
assert.equal(doc47.window.document.querySelectorAll('img').length,39);
for(const image of doc47.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc47.window.close();
const rendered47=window.document.createElement('div');await window.renderBookContent(rendered47,section47.section,false);
assert.equal(rendered47.querySelectorAll('img').length,39,'All section 4.7 figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child47.id})).exercises.map(e=>e.contentKey),section47.exercises.map(e=>e.contentKey));
// Newton: keep shared precision requirements and the graph needed by exercise 2.
const child48=detail.sections.find(s=>s.title.startsWith('4.8'));
const section48=await readBooks(db,student,{bookId:book.id,sectionId:child48.id});
assert.equal(section48.exerciseHeading,'4.8. Bài tập');
assert.deepEqual(section48.exercises.map(e=>e.questionNumber),Array.from({length:42},(_,i)=>i+1));
assert.ok(section48.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const [n,name] of [[1,'ex01'],[2,'ex01'],[4,'ex04'],[5,'ex05'],[40,'ex40'],[42,'ex42']])assert.ok(section48.exercises[n-1].content.includes('/'+name+'.png'));
assert.ok(section48.exercises[1].content.includes('Yêu cầu Bài tập 1(a)'));
for(const n of [6,8])assert.ok(section48.exercises[n-1].content.includes('bốn chữ số thập phân'));
for(const n of [11,12,23,28])assert.ok(section48.exercises[n-1].content.includes('tám chữ số thập phân'));
for(const n of [13,14,15,16,17,22])assert.ok(section48.exercises[n-1].content.includes('sáu chữ số thập phân'));
assert.ok(section48.exercises[31].content.includes('máy tính có thể lập trình'));
assert.equal(section48.section.sourceInfo.exampleCount,3);
const doc48=new JSDOM(section48.section.content);
assert.equal(doc48.window.document.querySelectorAll('img').length,12);
for(const image of doc48.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc48.window.close();
const rendered48=window.document.createElement('div');await window.renderBookContent(rendered48,section48.section,false);
assert.equal(rendered48.querySelectorAll('img').length,12,'All section 4.8 figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child48.id})).exercises.map(e=>e.contentKey),section48.exercises.map(e=>e.contentKey));
// Antiderivatives: keep graph exercises, initial conditions and referenced cliff height.
const child49=detail.sections.find(s=>s.title.startsWith('4.9'));
const section49=await readBooks(db,student,{bookId:book.id,sectionId:child49.id});
assert.equal(section49.exerciseHeading,'4.9. Bài tập');
assert.deepEqual(section49.exercises.map(e=>e.questionNumber),Array.from({length:85},(_,i)=>i+1));
assert.ok(section49.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [57,58,59,60,61,76])assert.ok(section49.exercises[n-1].content.includes('/ex'+n+'.png'));
for(const n of [5,26])assert.ok(section49.exercises[n-1].content.includes('Kiểm tra bằng cách lấy đạo hàm'));
for(const n of [57,58])assert.ok(section49.exercises[n-1].content.includes('Đồ thị nào là một nguyên hàm'));
for(const n of [63,64])assert.ok(section49.exercises[n-1].content.includes('đi qua gốc tọa độ'));
for(const n of [65,70])assert.ok(section49.exercises[n-1].content.includes('Tìm vị trí chất điểm'));
assert.ok(section49.exercises[73].content.includes('432 ft')&&section49.exercises[73].content.includes('−32 ft/s²'));
assert.equal(section49.section.sourceInfo.exampleCount,7);
const doc49=new JSDOM(section49.section.content);
assert.equal(doc49.window.document.querySelectorAll('img').length,11);
assert.ok(doc49.window.document.querySelector('table'),'Antiderivative table is preserved');
for(const image of doc49.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc49.window.close();
const rendered49=window.document.createElement('div');await window.renderBookContent(rendered49,section49.section,false);
assert.equal(rendered49.querySelectorAll('img').length,11,'All section 4.9 figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child49.id})).exercises.map(e=>e.contentKey),section49.exercises.map(e=>e.contentKey));
// Chapter 4 review: three numbered sections must remain separate.
const child4Review=detail.sections.find(s=>s.title==='Ôn tập'&&s.parentId===child49.parentId);
assert.ok(child4Review);
const section4Review=await readBooks(db,student,{bookId:book.id,sectionId:child4Review.id});
assert.equal(section4Review.exerciseHeading,'Bài tập');
assert.deepEqual(section4Review.exercises.map(e=>e.questionNumber),Array.from({length:87},(_,i)=>i+1));
assert.ok(section4Review.exercises.every(e=>e.allowSubmission&&e.allowAiEvaluation&&e.contentKey&&e.setKey));
for(const n of [18,79,80,85,87])assert.ok(section4Review.exercises[n-1].content.includes('/ex'+n+'.png'));
for(const n of [1,6])assert.ok(section4Review.exercises[n-1].content.includes('cực trị địa phương và tuyệt đối'));
for(const n of [7,14])assert.ok(section4Review.exercises[n-1].content.includes('Tính giới hạn'));
for(const n of [65,68])assert.ok(section4Review.exercises[n-1].content.includes('nguyên hàm tổng quát nhất'));
assert.ok(section4Review.exercises[55].content.includes('Dữ kiện gốc — Bài tập 55'));
assert.equal(section4Review.section.sourceInfo.conceptCheckCount,11);
assert.equal(section4Review.section.sourceInfo.trueFalseCount,21);
const doc4Review=new JSDOM(section4Review.section.content);
const review4Headings=[...doc4Review.window.document.querySelectorAll('h1')];
assert.deepEqual(review4Headings.map(h=>h.textContent),['Kiểm tra khái niệm','Trắc nghiệm đúng–sai','Bài tập']);
for(const [i,count] of [[0,11],[1,21]]){
 let labels=[];for(let p=review4Headings[i].nextElementSibling;p&&p!==review4Headings[i+1];p=p.nextElementSibling){const label=p.querySelector?.(':scope > strong')?.textContent;if(/^\d+\./.test(label||''))labels.push(parseInt(label));}
 assert.deepEqual(labels,Array.from({length:count},(_,i)=>i+1));
}
assert.equal(doc4Review.window.document.querySelectorAll('img').length,5);
for(const image of doc4Review.window.document.querySelectorAll('img')){
 const asset=new URL(image.src,'https://example.test').searchParams.get('asset');
 assert.equal((await readBookAsset(student,asset)).bytes[0],137);
 await assert.rejects(()=>readBookAsset(other,asset),e=>e.status===403);
}
doc4Review.window.close();
const rendered4Review=window.document.createElement('div');await window.renderBookContent(rendered4Review,section4Review.section,false);
assert.equal(rendered4Review.querySelectorAll('img').length,5,'All chapter 4 review figures survive frontend filtering');
assert.deepEqual((await readBooks(db,student,{bookId:book.id,sectionId:child4Review.id})).exercises.map(e=>e.contentKey),section4Review.exercises.map(e=>e.contentKey));
window.close();console.log('Books: seeded TOC, admin CRUD/CAS, scopes, subtree delete/restore, lazy bodies and UI actions OK');
