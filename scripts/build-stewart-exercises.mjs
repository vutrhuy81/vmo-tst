// Offline conversion of reviewed Stewart HTML. Never parse arbitrary requests here.
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const section=process.argv[2]||'1-1';if(!['1-1','1-2','1-3','1-4','1-5','1-review','1-principles','2-1','2-2','2-3','2-4','2-5','2-6','2-7','2-8','2-review','2-plus','3-2','3-3','3-4','3-5','3-6','3-7','3-8','3-9','3-10','3-11','3-review','3-plus','4-1','4-2','4-3','4-4','4-5','4-6','4-7','4-8','4-9','4-review','4-plus'].includes(section))throw Error('Unknown section');
const headingText=['2-plus','3-plus','4-plus'].includes(section)?'Bài toán':['1-review','1-principles','2-review','3-review','4-review'].includes(section)?'Bài tập':section.replace('-','.')+'. Bài tập',count={'1-1':88,'1-2':37,'1-3':71,'1-4':35,'1-5':83,'1-review':38,'1-principles':22,'2-1':9,'2-2':51,'2-3':68,'2-4':44,'2-5':76,'2-6':81,'2-7':60,'2-8':68,'2-review':56,'2-plus':14,'3-2':66,'3-3':68,'3-4':102,'3-5':67,'3-6':88,'3-7':43,'3-8':22,'3-9':53,'3-10':52,'3-11':67,'3-review':116,'3-plus':35,'4-1':82,'4-2':42,'4-3':99,'4-4':92,'4-5':80,'4-6':40,'4-7':88,'4-8':42,'4-9':85,'4-review':87,'4-plus':26}[section];
const source=JSON.parse(fs.readFileSync(`data/books/imports/stewart-${section}.json`,'utf8'));
const dom=new JSDOM(source.content),doc=dom.window.document;
if(['2-review','3-2','3-3','3-4','3-5','3-6','3-7','3-8','3-9','3-10','3-11','3-review','3-plus','4-1','4-2','4-3','4-4','4-5','4-6','4-7','4-8','4-9','4-review','4-plus'].includes(section))for(const wrapper of doc.querySelectorAll(['3-4','3-5','3-7','3-8','3-9','3-10','3-11','3-review','3-plus','4-1','4-2','4-3','4-4','4-5','4-6','4-7','4-8','4-9','4-review','4-plus'].includes(section)?'div.samepage, div.minipage':'div.samepage'))wrapper.replaceWith(...wrapper.childNodes);
const heading=[...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x=>x.textContent===headingText);
const nodes=[];for(let x=heading.nextSibling;x&&!/^H[1-6]$/.test(x.nodeName);x=x.nextSibling)nodes.push(x);
const anchors=nodes.flatMap((x,i)=>{const label=x.nodeName==='P'?x.querySelector(':scope > strong')?.textContent:'';const m=/^(\d+)(?:[–−-](\d+))?\./.exec(label||'');return m?[{i,a:+m[1],b:+(m[2]||m[1]),node:x}]:[];});
// Exercises 5–8 are numbered only inside the original shared image.
if(section==='1-5'){
 const i=nodes.findIndex(x=>x.querySelector?.('img[src$="/e05_08.png"]'));
 if(i<0)throw Error('Missing shared figure for exercises 5–8');
 anchors.push({i,a:5,b:8,node:nodes[i]});anchors.sort((a,b)=>a.i-b.i);
}
const html=x=>x.outerHTML??x.textContent,exercises=[];let group;
for(const [j,entry]of anchors.entries()){
 const {i,a,b,node}=entry;const end=anchors[j+1]?.i??nodes.length;
 let content=nodes.slice(i,end).map(html).join('').trim();
 if(a!==b){
  if(anchors[j+1]&&anchors[j+1].a>=a&&anchors[j+1].a<=b){group={a,b,content};continue;}
  for(let n=a;n<=b;n++){
   const panels=section==='1-5'?{5:'hình trên bên trái (nhãn 5)',6:'hình trên bên phải (nhãn 6)',7:'hình dưới bên trái (nhãn 7)',8:'hình dưới bên phải (nhãn 8)',33:'hình bên trái',34:'hình bên phải'}:section==='1-4'?{19:'hình bên trái',20:'hình bên phải'}:section==='1-3'?{6:'hình bên trái',7:'hình bên phải'}:section==='1-2'?{11:'hình bên trái',12:'hình bên phải',27:'hai biểu đồ ở hàng trên',28:'hai biểu đồ ở hàng dưới'}:{15:'đường cong thứ nhất',16:'đường cong thứ hai',17:'đường cong thứ ba',18:'đường cong thứ tư',63:'hình bên trái',64:'hình bên phải',77:'hình bên trái',78:'hình bên phải',79:'hình phía trên',80:'hình phía dưới'};const panel=panels[n];
   if(!panel)throw Error('Unreviewed shared figure '+n);
   exercises.push({number:n,content:(group&&n>=group.a&&n<=group.b?group.content:'')+`<p><strong>Bài tập ${n} — ${panel}.</strong></p>`+content});
  }if(!(section==='1-5'&&group&&b<group.b))group=null;
 }else{
  if(group&&a>=group.a&&a<=group.b)content=group.content+content;
  if(section==='1-1'&&a===5)content+=doc.querySelector('img[src$="/f01.png"]').parentElement.parentElement.outerHTML;
  if(section==='1-3'){
   for(const name of ({8:['f04','f06'],27:['f09']}[a]||[]))content+=doc.querySelector(`img[src$="/${name}.png"]`).parentElement.parentElement.outerHTML;
   if(a===64)content+='<p>Định nghĩa ở Bài 63: <span class="math inline">\\(H(t)=\\begin{cases}0 &amp; t&lt;0,\\\\1 &amp; t\\ge0.\\end{cases}\\)</span></p>';
  }
  if(section==='1-4'){
   for(const name of (a>=9&&a<=14?['f03','f15']:a===31?['f11']:[]))content+=doc.querySelector(`img[src$="/${name}.png"]`).parentElement.parentElement.outerHTML;
  }
  if(section==='1-5'){
   if(a===53||a===54)for(const name of ['f12','f13'])content+=doc.querySelector(`img[src$="/${name}.png"]`).parentElement.parentElement.outerHTML;
   if(a>=47&&a<=50)content+='<p><strong>Công thức 11 — Đổi cơ số.</strong> Với <span class="math inline">\\(b&gt;0,\\ b\\ne1,\\ x&gt;0\\)</span>: <span class="math display">\\[\\log_b x=\\frac{\\ln x}{\\ln b}.\\]</span></p>';
  }
  if(section==='2-3'){
   if(a>=55&&a<=57)content+='<p><strong>Ký hiệu trong Ví dụ 10.</strong> Hàm phần nguyên của x là số nguyên lớn nhất không vượt quá x.</p>';
   if(a===50)content+='<p><strong>Định nghĩa hàm dấu.</strong> sgn(u) = −1 khi u &lt; 0; sgn(u) = 0 khi u = 0; sgn(u) = 1 khi u &gt; 0.</p>';
  }
  if(section==='2-4'){
   if(a>=15&&a<=18)content+=doc.querySelector('img[src$="/f09.png"]').parentElement.parentElement.outerHTML;
   if(a===38)content+='<p><strong>Hàm Heaviside ở §2.2.</strong> H(t) = 0 khi t &lt; 0; H(t) = 1 khi t ≥ 0.</p>';
  }
  if(section==='2-5'&&(a===66||a===67)){
   const formula=[...doc.querySelectorAll('p')].find(p=>p.textContent.includes('\\tag{6}'));
   if(!formula)throw Error('Missing formula 6');
   content+='<p><strong>Công thức (6).</strong></p>'+formula.outerHTML;
  }
  if(section==='2-6'&&a>=60&&a<=64)content+=doc.querySelector('img[src$="/f13.png"]').parentElement.parentElement.outerHTML;
  if(section==='2-7'&&[3,4,21,22].includes(a)){
   const number=a<=4?2:5;
   const formula=[...doc.querySelectorAll('p')].find(p=>p.textContent.includes('\\tag{'+number+'}'));
   if(!formula)throw Error('Missing formula '+number);
   content+=`<p><strong>Công thức (${number}).</strong></p>`+formula.outerHTML;
  }
  if(section==='2-8'&&a===60)content+='<p><strong>Hàm phần nguyên.</strong> Giá trị tại x là số nguyên lớn nhất không vượt quá x.</p>';
  if(section==='2-review'&&a===56)content+='<p><strong>Hàm phần nguyên.</strong> Giá trị tại x là số nguyên lớn nhất không vượt quá x.</p>';
  if(section==='2-plus'&&a>=5&&a<=7)content+='<p><strong>Hàm phần nguyên.</strong> Giá trị tại x là số nguyên lớn nhất không vượt quá x.</p>';
  if(section==='3-2'&&a===58)content+='<p><strong>Phương pháp ở Bài tập 57.</strong> Gọi f(x) là tử số, g(x) là mẫu số; tính giá trị của f, g và các đạo hàm cấp một tại 0 rồi áp dụng quy tắc thương tại 0.</p>';
  if(section==='3-4'&&a===70){const table=exercises.find(e=>e.number===69)?.content.match(/<table[\s\S]*?<\/table>/)?.[0];if(!table)throw Error('Missing exercise 69 table');content+='<p><strong>Bảng dữ liệu của Bài tập 69.</strong></p>'+table;}
  if(section==='3-5'&&a===47)content+='<p><strong>Phương trình đường lemniscate — Bài tập 35.</strong> <span class="math display">\\[2(x^2+y^2)^2=25(x^2-y^2).\\]</span></p>';
  if(section==='3-6'&&((a>=84&&a<=86)||a===88)){const n=a===88?87:83;const ref=exercises.find(e=>e.number===n);if(!ref)throw Error('Missing referenced exercise '+n);content+=`<aside><p><strong>Nội dung tham chiếu — Bài tập ${n}.</strong></p>${ref.content}</aside>`;}
  if(section==='3-7'){
   if(a>=1&&a<=4)content+=doc.querySelector('img[src$="/f02.png"]').parentElement.parentElement.outerHTML;
   if(a===8)content+=doc.querySelector('img[src$="/e07.png"]').parentElement.parentElement.outerHTML;
   if(a===19)content+='<p><strong>Khối lượng riêng theo chiều dài.</strong> Là tốc độ biến thiên khối lượng theo vị trí: ρ(x) = dm/dx.</p>';
   if(a===31){const formula=[...doc.querySelectorAll('p')].find(p=>p.textContent.includes('\\tag{1}'));if(!formula)throw Error('Missing flow formula');content+='<p><strong>Định luật dòng chảy tầng — Ví dụ 7.</strong></p>'+formula.outerHTML;content+=doc.querySelector('img[src$="/f08.png"]').parentElement.parentElement.outerHTML;}
  }
  if(section==='3-9'&&(a===35||a===36)){
   const statement=[...doc.querySelectorAll('p')].find(p=>p.querySelector(':scope > strong')?.textContent==='Ví dụ 2.');
   if(!statement)throw Error('Missing ladder example');
   content+='<p><strong>Dữ kiện tham chiếu — Ví dụ 2.</strong></p>'+statement.outerHTML;
   content+=doc.querySelector('img[src$="/fig2.png"]').parentElement.parentElement.outerHTML;
  }
  if(section==='3-10'&&a>=23&&a<=26)content+=doc.querySelector('img[src$="/fig5.png"]').parentElement.parentElement.outerHTML;
  if(section==='3-11'){
   const image=name=>{const img=doc.querySelector(`img[src$="/${name}.png"]`);if(!img)throw Error('Missing image '+name);return img.parentElement.parentElement.outerHTML;};
   const tagged=n=>{const p=[...doc.querySelectorAll('p')].find(p=>p.textContent.includes('\\tag{'+n+'}'));if(!p)throw Error('Missing formula '+n);return p.outerHTML;};
   const table=n=>{const label=[...doc.querySelectorAll('p')].find(p=>p.querySelector(':scope > strong')?.textContent.startsWith(n+'. Đạo hàm'));if(!label)throw Error('Missing derivative table '+n);return label.outerHTML+label.nextElementSibling.outerHTML;};
   const example=n=>{const p=[...doc.querySelectorAll('p')].find(p=>p.querySelector(':scope > strong')?.textContent==='Ví dụ '+n+'.');if(!p)throw Error('Missing example '+n);return p.outerHTML;};
   const prior=n=>{const e=exercises.find(e=>e.number===n);if(!e)throw Error('Missing exercise '+n);return '<p><strong>Dữ kiện tham chiếu — Bài tập '+n+'.</strong></p>'+e.content;};
   if(a===26)for(const name of ['fig1','fig2','fig3'])content+=image(name);
   if(a===28)content+=table(1);
   if(a===29)content+=example(3)+example(1)+prior(13);
   if(a===30)content+=tagged(4);
   if(a===31)content+=tagged(5)+example(3)+prior(22);
   if(a===32)content+=tagged(2)+tagged(3);
   if(a===33||a===34)content+=table(6);
   if(a===56)content+=image('arch');
   if(a===57)content+=image('fig5');
   if(a===58)content+=image('fig4');
   if(a===61)content+=prior(60);
  }
  if(section==='4-2'){
   if(a===36){const p=[...doc.querySelectorAll('p')].find(p=>p.querySelector(':scope > strong')?.textContent==='7. Hệ quả');if(!p)throw Error('Missing corollary 7');content+=p.outerHTML+p.nextElementSibling.outerHTML;}
   if(a===38||a===39)content+='<p><strong>Phương pháp của Ví dụ 6.</strong> Chứng minh đạo hàm của hiệu hai vế bằng 0 trên khoảng xác định, rồi xác định hằng số bằng một giá trị đặc biệt.</p>';
  }
  if(section==='4-5'&&a===79){const ref=exercises.find(e=>e.number===78);if(!ref)throw Error('Missing exercise 78');content+='<aside><p><strong>Nội dung tham chiếu — Bài tập 78.</strong></p>'+ref.content+'</aside>';}
  if(section==='4-6'){
   content='<p><em>Các bài tập trong mục này sử dụng máy tính đồ thị hoặc máy tính; những câu có yêu cầu hệ thống đại số máy tính được ghi rõ trong đề.</em></p>'+content;
   if(a===15){
    const start=[...doc.querySelectorAll('p')].find(p=>p.querySelector(':scope > strong')?.textContent==='Ví dụ 3.');if(!start)throw Error('Missing example 3');
    let ref='';for(let p=start;p&&!p.querySelector?.(':scope > strong')?.textContent.startsWith('Ví dụ 4.');p=p.nextElementSibling)ref+=p.outerHTML;
    content+='<aside><p><strong>Nội dung tham chiếu — Ví dụ 3.</strong></p>'+ref+'</aside>';
   }
   if(a===16){const ref=exercises.find(e=>e.number===14);if(!ref)throw Error('Missing exercise 14');content+='<aside><p><strong>Nội dung tham chiếu — Bài tập 14.</strong></p>'+ref.content+'</aside>';}
  }
  if(section==='4-7'){
   const n=({16:15,22:21,24:23,44:43,58:57,72:57})[a];
   if(n){const ref=exercises.find(e=>e.number===n);if(!ref)throw Error('Missing referenced exercise '+n);content+='<aside><p><strong>Dữ kiện gốc — Bài tập '+n+' (thay đổi theo đề hiện tại).</strong></p>'+ref.content+'</aside>';}
   if(a===55){const ref=[...doc.querySelectorAll('p')].find(p=>p.querySelector(':scope > strong')?.textContent==='Ví dụ 4.');if(!ref)throw Error('Missing example 4');content+='<aside><p><strong>Dữ kiện gốc — Ví dụ 4 (thay đổi kích thước theo đề hiện tại).</strong></p>'+ref.outerHTML+doc.querySelector('img[src$="/fig07.png"]').parentElement.parentElement.outerHTML+'</aside>';}
  }
  if(section==='4-8'&&a===2){content+='<p><strong>Yêu cầu Bài tập 1(a).</strong> Vẽ các tiếp tuyến dùng để tìm các xấp xỉ thứ hai và thứ ba, rồi ước lượng giá trị của chúng.</p>'+doc.querySelector('img[src$="/ex01.png"]').parentElement.parentElement.outerHTML;}
  if(section==='4-9'&&a===74)content+='<p><strong>Dữ kiện tham chiếu — Ví dụ 7.</strong> Mép vách đá cao 432 ft so với mặt đất; lấy chiều dương hướng lên và gia tốc trọng trường bằng −32 ft/s².</p>';
  if(section==='4-review'&&a===56){const ref=exercises.find(e=>e.number===55);if(!ref)throw Error('Missing exercise 55');content+='<aside><p><strong>Dữ kiện gốc — Bài tập 55 (thay chiều cao theo đề hiện tại).</strong></p>'+ref.content+'</aside>';}
  exercises.push({number:a,content});
 }
}
if(exercises.length!==count||exercises.some((e,i)=>e.number!==i+1))throw Error('Missing/duplicate exercise');
fs.writeFileSync(`data/books/exercises/stewart-${section}.json`,JSON.stringify({bookKey:'stewart-9',sectionKey:section,heading:headingText,sourceSha256:source.sourceInfo.sha256,exercises},null,2)+'\n');
dom.window.close();console.log(`Prepared ${count} exercises for ${section}.`);

