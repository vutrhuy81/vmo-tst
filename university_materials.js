/* University textbook: fetch one course, preserve canonical DB identities, reuse math/actions. */
(() => {
  const root=document.getElementById('universityMaterialsContent');
  const picker=document.getElementById('universityMaterialsCourse');
  const toc=document.getElementById('universityMaterialsToc');
  if(!root||!picker||!toc)return;
  let catalog=null,loaded='',requestVersion=0,showSolutions=true;
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  const paragraph=(parent,text)=>{const p=node('p',text);parent.appendChild(p);return p;};
  const allowed=()=>!window.MathAppEducation||window.MathAppEducation.moduleAllowed(window.VMOAuth?.getSession?.(),'university-materials');
  async function read(courseId='') {
    const query=new URLSearchParams({resource:'university_materials'});if(courseId)query.set('courseId',courseId);
    const response=await fetch('/api/data?'+query,{credentials:'same-origin',cache:'no-store'});
    const body=await response.json();if(!response.ok||!body.success)throw Error(body.error||'Không tải được học liệu');return body.item;
  }
  function math(el) {return window.renderMathInContainer?.(el)||window.MathJax?.typesetPromise?.([el])||Promise.resolve();}
  function sourceList(refs) {
    const div=node('div',undefined,'university-material-references');
    for(const ref of refs){const source=catalog.sources.find(item=>item.id===ref.sourceId);if(!source)continue;
      const p=node('p');if(source.url){const a=node('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);}else p.append(node('strong',source.title));
      p.append(document.createTextNode(` — ${source.authors}. ${ref.locator}.`));div.appendChild(p);
    }return div;
  }
  function render(data) {
    window.MathJax?.typesetClear?.([root]);root.replaceChildren();
    const {course,book,problems}=data;
    const byKey=new Map(problems.map(problem=>[problem.contentKey,problem]));
    if(!(window.mongoProblemsByContentKey instanceof Map))window.mongoProblemsByContentKey=new Map();
    if(!(window.mongoProblemReferenceLinks instanceof Map))window.mongoProblemReferenceLinks=new Map();
    problems.forEach(problem=>{window.mongoProblemsByContentKey.set(problem.contentKey,problem);window.mongoProblemReferenceLinks.set(problem.contentKey,problem.referenceLinks||[]);});
    const heading=node('h2',`${course.code}: ${course.nameVi}`,'chapter-heading');root.append(heading);
    paragraph(root,course.name);
    paragraph(root,'Kiến thức chuẩn bị: '+book.prerequisites.join('; '));
    const goals=node('ul');book.outcomes.forEach(goal=>goals.appendChild(node('li',goal)));root.append(goals);
    toc.querySelectorAll('.material-section-link').forEach(link=>link.remove());
    const group=toc.querySelector(`[data-material-course="${course.id}"]`);
    for(const [i,section] of book.sections.entries()){
      const article=node('section',undefined,'chapter-block university-material-section');article.id=`um-${course.id}-${section.id}`;article.dataset.chapter=course.id;article.dataset.sectionId=section.id;
      article.appendChild(node('h3',`${i+1}. ${section.title}`,'section-heading'));
      const theory=node('div',undefined,'theorybox');theory.appendChild(node('h4','Lý thuyết cốt lõi','box-heading'));section.theory.forEach(text=>paragraph(theory,text));article.append(theory);
      const method=node('div',undefined,'university-material-method');method.append(node('h4','Quy trình tiếp cận'));const ol=node('ol');section.method.forEach(text=>ol.appendChild(node('li',text)));method.append(ol);article.append(method);
      const warning=node('div',undefined,'university-material-pitfall');warning.append(node('strong','Lưu ý khi suy luận'));section.pitfalls.forEach(text=>paragraph(warning,text));article.append(warning);
      section.examples.forEach((example,j)=>{
        const key=`university-materials:${course.id}:${section.id}:example-${j+1}`;
        const problem=byKey.get(key);if(!problem)return; // unpublished examples stay unavailable
        const card=node('div',undefined,'examplebox problem-item university-material-example');
        card.dataset.contentKey=key;card.dataset.databaseProblem='true';card.dataset.sourceGroup='university_materials';card.dataset.sourceType='university_material_example';card.dataset.contentType='university_materials';card.dataset.setKey=problem.setKey;card.dataset.setTitle=problem.setTitle;card.dataset.questionNumber=String(i*5+j+1);card.dataset.topic=problem.topic;
        const head=node('div',undefined,'problem-header box-heading');head.append(node('span',`Ví dụ ${i+1}.${j+1}`,'problem-id'));
        const copy=node('button','📋 Sao chép','btn-copy');copy.type='button';copy.addEventListener('click',()=>window.copyText?.(copy));head.append(copy);card.append(head);
        const statement=node('div',problem.content,'problem-content');card.append(statement);
        const toggle=node('button','Ẩn lời giải','solution-toggle');toggle.type='button';toggle.setAttribute('aria-expanded','true');
        const answer=node('div',undefined,'example-solution');
        if(window.safeRenderMathJaxToElement)window.safeRenderMathJaxToElement(answer,problem.referenceSolution||'Chưa có lời giải tham khảo.');else answer.textContent=problem.referenceSolution||'';
        toggle.addEventListener('click',()=>{const collapsed=answer.classList.toggle('is-collapsed');toggle.textContent=collapsed?'Hiện lời giải':'Ẩn lời giải';toggle.setAttribute('aria-expanded',String(!collapsed));if(!collapsed)math(answer);});
        card.append(toggle,answer);article.append(card);
      });
      article.append(sourceList(section.references));root.append(article);
      if(group){const a=node('a',`${i+1}. ${section.title}`,'nav-link material-section-link');a.href='#'+article.id;group.appendChild(a);}
    }
    const details=node('details');details.append(node('summary','Nguồn và phạm vi đối chiếu'));
    paragraph(details,'Nội dung được biên soạn theo học phần, từ lý thuyết nền tảng đến ví dụ giải thích từng bước. Mỗi phần nêu giả thiết áp dụng, phương pháp tiếp cận và nguồn để đọc sâu hơn.');
    const ids=new Set(book.sections.flatMap(section=>section.references.map(ref=>ref.sourceId)));
    catalog.sources.filter(source=>ids.has(source.id)).forEach(source=>paragraph(details,`${source.title} — ${source.reviewNote}`));root.append(details);
    window.reinitDatabaseUI?.(root);window.reinitAIGuide?.(root);
    filter();
  }
  function filter(){
    const q=(document.getElementById('universityMaterialsSearch')?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');
    root.querySelectorAll('.university-material-section').forEach(section=>{section.hidden=!!q&&!section.textContent.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').includes(q);});
  }
  function buildToc(){toc.replaceChildren();picker.replaceChildren();
    catalog.courses.forEach(course=>{const opt=node('option',`${course.code}: ${course.nameVi}`);opt.value=course.id;picker.append(opt);
      const details=node('details');details.dataset.materialCourse=course.id;const summary=node('summary',`${course.code}: ${course.nameVi}`);
      const button=node('button','Mở học phần');button.type='button';button.addEventListener('click',()=>{picker.value=course.id;window.loadUniversityMaterials(true);});details.append(summary,button);toc.append(details);});
  }
  window.loadUniversityMaterials=async function(force=false){
    if(!allowed())return;
    const version=++requestVersion;root.setAttribute('aria-busy','true');
    try{
      if(!catalog){catalog=await read();if(version!==requestVersion)return;buildToc();document.getElementById('universityMaterialsStats').textContent=`${catalog.courses.length} học phần · ${catalog.courses.reduce((n,c)=>n+c.sectionCount,0)} phần lý thuyết · ${catalog.courses.reduce((n,c)=>n+c.exampleCount,0)} ví dụ có lời giải`;}
      const id=picker.value||catalog.courses[0].id;if(loaded===id&&!force)return;
      const data=await read(id);if(version!==requestVersion)return;render(data);loaded=id;showSolutions=true;
      toc.querySelectorAll('details').forEach(item=>{item.open=item.dataset.materialCourse===id;});
      await math(root);
    }catch(error){if(version===requestVersion){root.replaceChildren(node('p',error.message));const retry=node('button','Thử tải lại');retry.type='button';retry.addEventListener('click',()=>window.loadUniversityMaterials(true));root.append(retry);}}
    finally{if(version===requestVersion)root.removeAttribute('aria-busy');}
  };
  picker.addEventListener('change',()=>window.loadUniversityMaterials());
  document.getElementById('universityMaterialsSearch').addEventListener('input',filter);
  document.getElementById('universityMaterialsSolutions').addEventListener('click',()=>{showSolutions=!showSolutions;root.querySelectorAll('.example-solution').forEach(el=>el.classList.toggle('is-collapsed',!showSolutions));root.querySelectorAll('.solution-toggle').forEach(btn=>{btn.textContent=showSolutions?'Ẩn lời giải':'Hiện lời giải';btn.setAttribute('aria-expanded',String(showSolutions));});if(showSolutions)math(root);});
  document.getElementById('universityMaterialsPrint').addEventListener('click',async()=>{
    if(!loaded)return;const button=document.getElementById('universityMaterialsPrint');button.disabled=true;
    const collapsed=[...root.querySelectorAll('.example-solution.is-collapsed')];const hidden=[...root.querySelectorAll('section[hidden]')];
    collapsed.forEach(el=>el.classList.remove('is-collapsed'));hidden.forEach(el=>{el.hidden=false;});
    const restore=()=>{collapsed.forEach(el=>el.classList.add('is-collapsed'));hidden.forEach(el=>{el.hidden=true;});button.disabled=false;};
    try{await math(root);window.addEventListener('afterprint',restore,{once:true});window.print();}catch{restore();}
  });
})();
