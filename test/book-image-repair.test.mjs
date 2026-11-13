import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {restoreBookImages,repairBookImagePlaceholders} from '../lib/book-image-repair.js';

let total=0;
for(const key of ['5-1','5-2']){
 const section=JSON.parse(await readFile(new URL(`../data/books/imports/stewart-${key}.json`,import.meta.url)));
 const catalog=JSON.parse(await readFile(new URL(`../data/books/exercises/stewart-${key}.json`,import.meta.url)));
 for(const canonical of [section.content,...catalog.exercises.map(e=>e.content)]){
  const expected=new JSDOM(canonical).window.document;
  const images=[...expected.querySelectorAll('img')];
  total+=images.length;
  for(const bracketed of [true,false]){
   const old=canonical.replace(/<p>\s*<img\b[^>]*alt="5-[12] (chapter|fig\d+|ex\d+)"[^>]*>[\s\S]*?<\/p>/g,(_,name)=>bracketed?`<p><em>[Hình ${name}: Chú thích \\(x^2\\) — chưa có tệp ảnh PNG trong nguồn đính kèm.]</em></p>`:`<p><em>Hình ${name}: Chú thích (chưa có tệp ảnh gốc).</em></p>`);
   const edited='<p>Ghi chú riêng của Admin.</p>'+old+'<p>Giữ nguyên kết luận đã sửa.</p>';
   const repaired=restoreBookImages(edited,canonical);
   assert.equal(repaired,'<p>Ghi chú riêng của Admin.</p>'+canonical+'<p>Giữ nguyên kết luận đã sửa.</p>');
   assert.equal(restoreBookImages(repaired,canonical),repaired,'Repair is idempotent');
   const actual=new JSDOM(repaired).window.document;
   assert.deepEqual([...actual.querySelectorAll('img')].map(e=>e.src),images.map(e=>e.src));
  }
 }
}
assert.equal(total,49,'All 49 image placements are repaired');
assert.equal(restoreBookImages('<p>Hình ex99: chưa có tệp ảnh gốc.</p>',''),'<p>Hình ex99: chưa có tệp ảnh gốc.</p>','Unknown figures are preserved');
assert.equal(restoreBookImages('<p>Admin removed the illustration.</p>',''),'<p>Admin removed the illustration.</p>');
const canonical='<p><img src="/api/data?resource=book_asset&amp;asset=stewart-5-1-bf26edcf/ex01.png" alt="5-1 ex01" loading="lazy"><br><span>Hình</span></p>';
const row={_id:'existing-id',status:'published',version:7,content:'<p><em>[Hình ex01: chưa có tệp ảnh PNG.]</em></p>',referenceLinks:[{url:'https://example.test'}],referenceSolution:'verified solution',contentKey:'stable-key'};
let writes=0;
const collection={async findOneAndUpdate(filter,update){writes++;assert.equal(filter.content,row.content);assert.equal(filter.version,7);assert.deepEqual(Object.keys(update.$set).sort(),['content','updatedAt']);return {...row,...update.$set,version:8};}};
const saved=await repairBookImagePlaceholders(collection,row,canonical);
assert.equal(saved.version,8);assert.equal(saved.content,canonical);assert.equal(saved.contentKey,row.contentKey);assert.deepEqual(saved.referenceLinks,row.referenceLinks);assert.equal(saved.referenceSolution,row.referenceSolution);
await repairBookImagePlaceholders(collection,saved,canonical);assert.equal(writes,1,'Second read must not write again');
const concurrent={...row,version:8,content:'Concurrent Admin change'};
const race={async findOneAndUpdate(){return null;},async findOne(){return concurrent;}};
assert.equal(await repairBookImagePlaceholders(race,row,canonical),concurrent,'A concurrent edit wins');
assert.equal(await repairBookImagePlaceholders(collection,{...row,status:'deleted'},canonical).then(x=>x.status),'deleted');assert.equal(writes,1);
console.log('49 image placements, Admin edits, stable identities, idempotency, CAS race and deleted records: OK');
