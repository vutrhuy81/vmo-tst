// Repair only named legacy figure placeholders; never replace an entire edited body.
export function restoreBookImages(content, canonicalContent) {
 if(typeof content!=='string'||!content.includes('chưa có tệp ảnh'))return content;
 const figures=new Map();
 for(const match of canonicalContent.matchAll(/<p>\s*(<img\b[^>]*\balt="(5-[12]) (chapter|fig\d+|ex\d+)"[^>]*>)[\s\S]*?<\/p>/g))figures.set(match[3],match[0]);
 return content.replace(/<p>\s*(?:<em>\s*)?\[?Hình (chapter|fig\d+|ex\d+):(?:(?!<\/p>)[\s\S])*?chưa có tệp ảnh(?:(?!<\/p>)[\s\S])*?<\/p>/g,(placeholder,name)=>figures.get(name)||placeholder);
}

export async function repairBookImagePlaceholders(collection, row, canonicalContent) {
 if(!row||row.status!=='published')return row;
 const content=restoreBookImages(row.content,canonicalContent);
 if(content===row.content)return row;
 // Exact body + version guards prevent overwriting concurrent Admin changes.
 const filter={_id:row._id,status:'published',content:row.content,version:row.version};
 const saved=await collection.findOneAndUpdate(filter,{$set:{content,updatedAt:new Date()},$inc:{version:1}},{returnDocument:'after'});
 return saved||await collection.findOne({_id:row._id})||row;
}
