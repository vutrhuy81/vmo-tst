/* One top-level University module; ten course banks reuse the existing exam flow. */
(() => {
  const registry = window.MathAppUniversity;
  if (!registry) return;
  const select = document.getElementById('universityCourseSelect');
  const sidebar = document.getElementById('universityCourseList');
  if (!select || !sidebar) return;
  window.currentUniversityCourse = registry.courses[0].id;
  function label(course) { return `${course.code}: ${window.currentLang === 'en' ? course.name : course.nameVi}`; }
  function refreshLabels() {
    const previous = window.currentUniversityCourse;
    select.replaceChildren();sidebar.replaceChildren();
    registry.courses.forEach(course => {
      const option = document.createElement('option');option.value = course.id;option.textContent = label(course);select.appendChild(option);
      const button = document.createElement('button');button.type = 'button';button.className = 'university-course-button';
      button.dataset.courseId = course.id;button.textContent = label(course);
      button.style.cssText = 'display:block;width:100%;text-align:left;padding:10px;margin:3px 0;border:1px solid #cbd5e1;border-radius:7px;background:var(--card-bg,#fff);color:inherit;cursor:pointer;';
      button.addEventListener('click',()=>window.selectUniversityCourse(course.id));sidebar.appendChild(button);
    });
    select.value = previous;
    document.querySelectorAll('[data-university-label]').forEach(node=>{node.textContent=window.currentLang==='en'?'University courses':'Các học phần Đại học';});
    const labelNode=document.querySelector('label[for="universityCourseSelect"]');if(labelNode)labelNode.textContent=window.currentLang==='en'?'Choose course':'Chọn học phần';
    window.refreshUniversityCatalogFilter?.();
  }
  window.refreshUniversityCatalogFilter = function() {
    const course = registry.course(window.currentUniversityCourse);if(!course)return;
    select.value=course.id;
    const title=document.getElementById('universityCourseTitle');if(title)title.textContent=`${course.code}: ${course.name} (${course.nameVi})`;
    sidebar.querySelectorAll('button').forEach(button=>{const active=button.dataset.courseId===course.id;button.setAttribute('aria-pressed',String(active));button.style.fontWeight=active?'800':'400';button.style.borderColor=active?'#2563eb':'#cbd5e1';});
    document.querySelectorAll('#universityExamLinks a').forEach(link=>{link.hidden=link.dataset.courseId!==course.id;link.style.display=link.hidden?'none':'';});
    let count=0;
    document.querySelectorAll('#tab-university .exam-card').forEach(card=>{const visible=card.dataset.courseId===course.id;card.classList.toggle('hidden-by-search',!visible);if(visible)count++;});
    const root=document.getElementById('tab-university');
    let notice=root?.querySelector('.university-empty');
    if(root?.dataset.universityLoaded==='true') {
      if(!notice){notice=document.createElement('p');notice.className='university-empty';notice.setAttribute('role','status');root.querySelector('.feed-container').appendChild(notice);}
      notice.hidden=count>0;notice.textContent=window.currentLang==='en'?'No exam has been added for this course. Admin or an authorized Teacher can upload an exam in the Data hub.':'Học phần chưa có đề thi. Admin hoặc Giáo viên được cấp quyền có thể thêm đề tại Kho dữ liệu.';
      root.querySelector('.db-catalog-state')?.remove();
    }
  };
  window.selectUniversityCourse = function(id) {
    if(!registry.course(id))return;
    if(window.MathAppEducation && !window.MathAppEducation.moduleAllowed(window.VMOAuth?.getSession?.(),'university'))return;
    window.currentUniversityCourse=id;
    const search=document.getElementById('searchInput');if(search){search.value='';search.dispatchEvent(new Event('input'));}
    window.refreshUniversityCatalogFilter();
    const first=[...document.querySelectorAll('#tab-university .exam-card')].find(card=>card.dataset.courseId===id);
    if(first)window.loadDatabaseExamDetail?.('university',first.id)?.catch(()=>{});
  };
  select.addEventListener('change',()=>window.selectUniversityCourse(select.value));
  window.addEventListener('langchange',refreshLabels);
  refreshLabels();
})();
