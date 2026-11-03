// Offline conversion of reviewed Stewart HTML. Never parse arbitrary requests here.
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const section=process.argv[2]||'1-1';if(!['1-1','1-2'].includes(section))throw Error('Unknown section');
const headingText=section.replace('-','.')+'. Bài tập',count=section==='1-1'?88:37;
const source=JSON.parse(fs.readFileSync(`data/books/imports/stewart-${section}.json`,'utf8'));
const dom=new JSDOM(source.content),doc=dom.window.document;
const heading=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x=>x.textContent===headingText);
const nodes=[];for(let x=heading.nextSibling;x&&!/^H[1-6]$/.test(x.nodeName);x=x.nextSibling)nodes.push(x);
const anchors=nodes.flatMap((x,i)=>{const label=x.nodeName==='P'?x.querySelector(':scope > strong')?.textContent:'';const m=/^(\d+)(?:[–−-](\d+))?\./.exec(label||'');return m?[{i,a:+m[1],b:+(m[2]||m[1]),node:x}]:[];});
const html=x=>x.outerHTML??x.textContent,exercises=[];let group;
for(const [j,entry]of anchors.entries()){
 const {i,a,b,node}=entry;const end=anchors[j+1]?.i??nodes.length;
 let content=nodes.slice(i,end).map(html).join('').trim();
 if(a!==b){
  if(anchors[j+1]&&anchors[j+1].a>=a&&anchors[j+1].a<=b){group={a,b,content:html(node)};continue;}
  for(let n=a;n<=b;n++){
   const panels=section==='1-2'?{11:'hình bên trái',12:'hình bên phải',27:'hai biểu đồ ở hàng trên',28:'hai biểu đồ ở hàng dưới'}:{15:'đường cong thứ nhất',16:'đường cong thứ hai',17:'đường cong thứ ba',18:'đường cong thứ tư',63:'hình bên trái',64:'hình bên phải',77:'hình bên trái',78:'hình bên phải',79:'hình phía trên',80:'hình phía dưới'};const panel=panels[n];
   if(!panel)throw Error('Unreviewed shared figure '+n);
   exercises.push({number:n,content:(group&&n>=group.a&&n<=group.b?group.content:'')+`<p><strong>Bài tập ${n} — ${panel}.</strong></p>`+content});
  }group=null;
 }else{
  if(group&&a>=group.a&&a<=group.b)content=group.content+content;
  if(section==='1-1'&&a===5)content+=doc.querySelector('img[src$="/f01.png"]').parentElement.parentElement.outerHTML;
  exercises.push({number:a,content});
 }
}
if(exercises.length!==count||exercises.some((e,i)=>e.number!==i+1))throw Error('Missing/duplicate exercise');
fs.writeFileSync(`data/books/exercises/stewart-${section}.json`,JSON.stringify({bookKey:'stewart-9',sectionKey:section,heading:headingText,sourceSha256:source.sourceInfo.sha256,exercises},null,2)+'\n');
dom.window.close();console.log(`Prepared ${count} exercises for ${section}.`);
