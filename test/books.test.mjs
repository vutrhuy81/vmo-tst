import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ObjectId} from 'mongodb';
import {JSDOM} from 'jsdom';
import {readBooks,mutateBooks,readBookAsset} from '../lib/books.js';
import {educationDb} from '../lib/education-db.js';
import {filterAppShell} from '../lib/app-shell.js';
const rows=[];
const eq=(a,b)=>String(a)===String(b);
function match(row,q){return Object.entries(q).every(([k,v])=>{if(k==='$and')return v.every(x=>match(row,x));if(k==='$or')return v.some(x=>match(row,x));if(v&&typeof v==='object'&&!(v instanceof ObjectId)){if('$in'in v)return v.$in.some(x=>eq(x,row[k]));if('$nin'in v)return !v.$nin.some(x=>eq(x,row[k]));if('$ne'in v)return !eq(row[k],v.$ne);if('$exists'in v)return(row[k]!==undefined)===v.$exists;}return eq(row[k],v);});}
function change(row,u,insert=false){if(insert)Object.assign(row,u.$setOnInsert);Object.assign(row,u.$set);for(const[k,v]of Object.entries(u.$inc||{}))row[k]=(row[k]||0)+v;}
const col={async findOne(q){return rows.find(r=>match(r,q))?{...rows.find(r=>match(r,q))}:null;},async findOneAndUpdate(q,u,o){let row=rows.find(r=>match(r,q));if(!row){if(!o?.upsert)return null;row={...q};change(row,u,true);rows.push(row);}else change(row,u);return{...row};},async insertOne(doc){rows.push({...doc});return{insertedId:doc._id};},async updateMany(q,u){rows.filter(r=>match(r,q)).forEach(r=>change(r,u));},find(q,options={}){let limit=Infinity;return{sort(){return this;},limit(n){limit=n;return this;},async toArray(){return rows.filter(r=>match(r,q)).slice(0,limit).map(r=>{const copy={...r};for(const[k,v]of Object.entries(options.projection||{}))if(v===0)delete copy[k];return copy;});}};}};
const db={collection:()=>col},admin={role:'admin',username:'admin'},student={role:'student',educationLevels:['university']},teacher={role:'teacher',educationLevels:['university']},other={role:'student',educationLevels:['upper_secondary']};
let catalog=await readBooks(db,student);assert.equal(catalog.categories.length,5);assert.equal(catalog.books.length,1);
const book=catalog.books[0],detail=await readBooks(db,student,{bookId:book.id});assert.equal(detail.sections.length,175);assert.equal(detail.sections.filter(s=>/^Chương \d+\./.test(s.title)).length,16);assert.ok(detail.sections.every(s=>s.content===undefined));
const first=detail.sections.find(s=>s.title.startsWith('Chương 1.')),child=detail.sections.find(s=>s.title.startsWith('1.1'));
const imported=(await readBooks(db,student,{bookId:book.id,sectionId:child.id})).section;assert.equal(imported.contentFormat,'html-latex');assert.equal(imported.version,2);assert.equal(imported.sourceInfo.assetCount,35);assert.ok(imported.content.includes('Ví dụ 11.'));assert.ok(imported.content.includes('88.'));assert.equal((imported.content.match(/<img /g)||[]).length,35);
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
const handler=new Function('readBooks','mutateBooks','readBookAsset','educationDb','getDb','getSession','handleMathSupport','allows',apiSource+'\nreturn handler;')(readBooks,mutateBooks,readBookAsset,educationDb,async()=>db,async()=>user,async()=>false,(session,level)=>window.MathAppEducation.allows(session,level));
async function route(method,payload){const res={status(code){this.code=code;return this;},setHeader(){},json(body){this.body=body;return this;}};await handler({method,query:{resource:'books'},body:payload},res);return res;}
assert.equal((await route('GET')).code,200);user=teacher;assert.equal((await route('POST',{action:'books_save_category',payload:{name:'Forbidden'}})).code,403);user=other;assert.equal((await route('GET')).code,403);user=admin;
window.eval(read('books.js'));await window.loadBooks();
assert.ok(window.document.getElementById('booksToc').textContent.includes('Chương 16.'));
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
window.close();console.log('Books: seeded TOC, admin CRUD/CAS, scopes, subtree delete/restore, lazy bodies and UI actions OK');
