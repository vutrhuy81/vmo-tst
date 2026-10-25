import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { readFile } from 'node:fs/promises';
import { universityCourse, UNIVERSITY_COURSES } from './university-courses.js';
import { allows } from './education-access.js';
const cache = new Map();
const identity = key => new ObjectId(crypto.createHash('sha256').update(key).digest('hex').slice(0,24));
async function insertOnly(collection,key,doc) {
  const _id=identity(key);
  try { return await collection.findOneAndUpdate({_id},{$setOnInsert:{...doc,_id}},{upsert:true,returnDocument:'after'}); }
  catch(error) { if(error.code!==11000)throw error;const existing=await collection.findOne({_id});if(!existing)throw error;return existing; }
}
const load = async id => {
  if (!cache.has(id)) cache.set(id, JSON.parse(await readFile(new URL(`../data/university-materials/${id}.json`,import.meta.url),'utf8')));
  return cache.get(id);
};
export async function universityMaterialCatalog() {
  const courses=await Promise.all(UNIVERSITY_COURSES.map(async course=>{const book=await load(course.id);return {...course,sectionCount:book.sections.length,exampleCount:book.sections.reduce((n,s)=>n+s.examples.length,0)};}));
  return {courses,sources:await load('sources')};
}
function solution(example) {
  return example.steps.map((step,i)=>`Bước ${i+1}. ${step}`).join('\n\n')+`\n\nKết luận: ${example.result}\n\nGiải thích: ${example.insight}`;
}
// Install only immutable, reviewed curriculum shipped in the release. The request may
// choose a whitelisted course, never arbitrary text. $setOnInsert preserves admin edits.
async function ensureCourse(db, course, book) {
  const blockKey=`university-materials:${book.revision}:${course.id}`;
  const existing=await db.collection('content_blocks').findOne({blockKey});
  if(existing)return existing;
  const now=new Date(), setKey=`university-materials:${course.id}`;
  const metadata={educationLevel:'university',courseId:course.id,courseCode:course.code,courseName:course.name};
  const set=await insertOnly(db.collection('content_sets'),setKey,{...metadata,key:setKey,group:'university_materials',contentType:'university_materials',title:`${course.code}: ${course.nameVi}`,status:'published',createdAt:now});
  const examples=book.sections.flatMap((section,sectionIndex)=>section.examples.map((example,index)=>({
    ...metadata,contentKey:`${setKey}:${section.id}:example-${index+1}`,setKey,setId:set._id,setTitle:`${course.code}: ${course.nameVi}`,
    sourceGroup:'university_materials',sourceType:'university_material_example',contentType:'university_materials',
    questionNumber:sectionIndex*5+index+1,orderNumber:sectionIndex*5+index+1,order:sectionIndex*5+index+1,title:`${sectionIndex+1}.${index+1}. ${section.title}`,shortLabel:`Ví dụ ${sectionIndex+1}.${index+1}`,topic:section.title,
    content:example.statement,referenceSolution:solution(example),referenceSolutionVerified:false,referenceLinks:[],
    materialSectionId:section.id,materialExampleNumber:index+1,materialRevision:book.revision,
    maxScore:5,version:1,status:'published',allowSubmission:true,allowAiEvaluation:true,createdAt:now,updatedAt:now
  })));
  for(let i=0;i<examples.length;i+=5)await Promise.all(examples.slice(i,i+5).map(doc=>insertOnly(db.collection('problems'),doc.contentKey,doc)));
  return insertOnly(db.collection('content_blocks'),blockKey,{...metadata,blockKey,group:'university_materials',status:'published',setKey,book,createdAt:now});
}
export async function getUniversityMaterials(db,session,courseId) {
  if(!allows(session,'university'))throw Object.assign(new Error('Tài liệu thuộc cấp Đại học'),{code:'EDUCATION_ACCESS_DENIED'});
  const course=universityCourse(courseId);if(!course)throw Object.assign(new Error('Học phần không hợp lệ'),{code:'INVALID_COURSE'});
  const book=await load(course.id);
  const block=await ensureCourse(db,course,book);
  const set=await db.collection('content_sets').findOne({key:block.setKey});
  if(block.status!=='published'||set?.status!=='published')throw Object.assign(new Error('Học liệu chưa được công khai'),{code:'EDUCATION_ACCESS_DENIED'});
  const problems=await db.collection('problems').find({setKey:block.setKey,status:'published'}).toArray();
  return {course,book:block.book,problems};
}
