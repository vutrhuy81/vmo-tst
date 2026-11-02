import {ObjectId} from 'mongodb';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {allows} from './education-access.js';
const group='university_books';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const id=value=>typeof value==='string'&&/^[a-f0-9]{24}$/i.test(value)?new ObjectId(value):null;
const stable=value=>new ObjectId(crypto.createHash('sha256').update(`books:${value}`).digest('hex').slice(0,24));
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())throw fail('Nội dung thiếu hoặc vượt độ dài cho phép.');return value.trim();};
function access(session,write=false){if(!allows(session,'university')||write&&session.role!=='admin')throw fail(write?'Chỉ Admin được quản lý Sách học.':'Sách học thuộc cấp Đại học.',403);}
const view=({_id,...doc})=>({...doc,id:String(_id)});
let seedPromise;
async function seed(db){
 const col=db.collection('content_blocks');
 const marker=stable('seed-stewart-9-v1');
 if(await col.findOne({_id:marker}))return;
 const defaults=['Giải tích','Đại số tuyến tính','Toán rời rạc','Xác suất thống kê','Toán học khác'];
 const insert=async(key,doc)=>{const _id=stable(key);try{await col.findOneAndUpdate({_id},{$setOnInsert:{...doc,_id,group,educationLevel:'university',status:'published',version:1,createdAt:new Date()}},{upsert:true,returnDocument:'after'});}catch(e){if(e.code!==11000)throw e;}};
 for(const [order,name]of defaults.entries())await insert(`category-${order}`,{bookType:'category',name,order});
 seedPromise ||= readFile(new URL('../data/books/stewart-9-toc.json',import.meta.url),'utf8').then(JSON.parse).catch(e=>{seedPromise=null;throw e;});
 const data=await seedPromise,bookId=String(stable('stewart-9'));
 await insert('stewart-9',{bookType:'book',categoryId:String(stable('category-0')),title:data.title,authors:data.authors,edition:data.edition,sourceNote:data.sourceNote});
 for(const row of data.sections)await insert(`stewart-9:${row.key}`,{bookType:'section',bookId,parentId:row.parent?String(stable(`stewart-9:${row.parent}`)):'',title:row.title,originalTitle:row.originalTitle,printedPage:row.page,order:row.order,content:''});
 await insert('seed-stewart-9-v1',{bookType:'seed'});
}
async function get(col,kind,value,deleted=false){const _id=id(value);if(!_id)throw fail('Mã dữ liệu không hợp lệ.');const row=await col.findOne({_id,group,bookType:kind,...(deleted?{}:{status:'published'})});if(!row)throw fail('Không tìm thấy dữ liệu.',404);return row;}
export async function readBooks(db,session,query={}){
 access(session);await seed(db);const col=db.collection('content_blocks');
 if(!query.bookId){const rows=await col.find({group,bookType:{$in:['category','book']},status:'published'},{projection:{content:0}}).sort({order:1,createdAt:1,_id:1}).limit(1500).toArray();return{categories:rows.filter(r=>r.bookType==='category').map(view),books:rows.filter(r=>r.bookType==='book').map(view)};}
 const book=await get(col,'book',query.bookId);
 if(query.sectionId){const section=await get(col,'section',query.sectionId,session.role==='admin'&&query.includeDeleted==='1');if(section.bookId!==String(book._id))throw fail('Mục không thuộc sách.',404);return{book:view(book),section:view(section)};}
 const rows=await col.find({group,bookType:'section',bookId:String(book._id),...(session.role==='admin'&&query.includeDeleted==='1'?{}:{status:'published'})},{projection:{content:0}}).sort({order:1,_id:1}).limit(1000).toArray();return{book:view(book),sections:rows.map(view)};
}
export async function mutateBooks(db,session,action,payload={}){
 access(session,true);await seed(db);const col=db.collection('content_blocks');
 const saveKind={'books_save_category':'category','books_save_book':'book','books_save_section':'section'}[action];
 if(saveKind){
  const existing=payload.id?await get(col,saveKind,payload.id):null;
  let fields;
  if(saveKind==='category'){const name=text(payload.name,160,true);const rows=await col.find({group,bookType:'category',status:'published'}).limit(201).toArray();if(!existing&&rows.length>=200)throw fail('Tối đa 200 nhóm sách.');if(rows.some(r=>String(r._id)!==payload.id&&r.name.toLocaleLowerCase('vi')===name.toLocaleLowerCase('vi')))throw fail('Tên nhóm đã tồn tại.',409);fields={name};}
  if(saveKind==='book'){if(!existing&&(await col.find({group,bookType:'book'}).limit(1001).toArray()).length>=1000)throw fail('Tối đa 1000 sách.');const category=await get(col,'category',payload.categoryId);fields={categoryId:String(category._id),title:text(payload.title,300,true),authors:text(payload.authors||'',300),edition:text(payload.edition||'',120)};}
  if(saveKind==='section'){
   const book=await get(col,'book',existing?.bookId||payload.bookId);const bookId=String(book._id);
   const rows=await col.find({group,bookType:'section',bookId}).limit(1001).toArray();if(!existing&&rows.length>=1000)throw fail('Tối đa 1000 mục trong một sách.');
   const parentId=existing?existing.parentId:(payload.parentId||'');
   if(parentId){let parent=await get(col,'section',parentId);if(parent.bookId!==bookId)throw fail('Mục cha không thuộc sách.');let depth=1;while(parent.parentId){if(++depth>=6)throw fail('Mục lục tối đa 6 cấp.');parent=await get(col,'section',parent.parentId);} }
   const order=Number(payload.order??existing?.order??rows.length+1);if(!Number.isInteger(order)||order<0||order>100000)throw fail('Thứ tự không hợp lệ.');
   fields={bookId,parentId,title:text(payload.title,300,true),content:text(payload.content||'',100000),order};
  }
  if(existing){if(!Number.isInteger(payload.expectedVersion)||payload.expectedVersion!==existing.version)throw fail('Dữ liệu đã thay đổi. Hãy tải lại trước khi lưu.',409);
   const saved=await col.findOneAndUpdate({_id:existing._id,group,status:'published',version:payload.expectedVersion},{$set:{...fields,updatedAt:new Date(),updatedBy:session.username},$inc:{version:1}},{returnDocument:'after'});if(!saved)throw fail('Dữ liệu đã thay đổi. Hãy tải lại.',409);return view(saved);}
  const _id=new ObjectId(),doc={...fields,_id,group,educationLevel:'university',bookType:saveKind,status:'published',version:1,createdAt:new Date(),createdBy:session.username};await col.insertOne(doc);return view(doc);
 }
 if(['books_delete_section','books_restore_section'].includes(action)){
  const row=await get(col,'section',payload.id,true);if(!Number.isInteger(payload.expectedVersion)||row.version!==payload.expectedVersion)throw fail('Dữ liệu đã thay đổi. Hãy tải lại.',409);
  const restore=action==='books_restore_section';if(restore&&row.parentId)await get(col,'section',row.parentId);
  const rows=await col.find({group,bookType:'section',bookId:row.bookId}).limit(1000).toArray();
  const affected=new Set([String(row._id)]);let added=true;while(added){added=false;for(const item of rows)if(affected.has(item.parentId)&&!affected.has(String(item._id))){affected.add(String(item._id));added=true;}}
  // Soft-delete/restore a subtree, retaining content and identity for recovery.
  const update={$set:{status:restore?'published':'deleted',updatedBy:session.username,updatedAt:new Date()},$inc:{version:1}};
  const changed=await col.findOneAndUpdate({_id:row._id,group,version:payload.expectedVersion},update,{returnDocument:'after'});if(!changed)throw fail('Dữ liệu đã thay đổi. Hãy tải lại.',409);
  await col.updateMany({group,bookType:'section',_id:{$in:[...affected].filter(value=>value!==String(row._id)).map(value=>new ObjectId(value))}},update);
  return{id:payload.id,affected:affected.size};
 }
 throw fail('Thao tác Sách học không hợp lệ.');
}
