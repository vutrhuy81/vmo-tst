(() => {
  const byId = id => document.getElementById(id);
  const state = { image: '', uploadKey: '', confidence: '', busy: false, loaded: false, page: 1, pages: 1, loadToken: 0 };
  const status = (id, message) => { if (byId(id)) byId(id).textContent = message; };
  function busy(value, message = '') {
    state.busy = value;
    for (const id of ['supportImage', 'supportOcrButton', 'supportSaveButton']) if (byId(id)) byId(id).disabled = value;
    if (!value) {
      byId('supportOcrButton').disabled = !state.image;
      byId('supportSaveButton').disabled = !state.image || !byId('supportContent').value.trim();
    }
    if (message) status('supportUploadStatus', message);
  }
  function preview() {
    const target = byId('supportMathPreview'), content = byId('supportContent').value.trim();
    if (window.safeRenderMathJaxToElement) window.safeRenderMathJaxToElement(target, content);
    else target.textContent = content;
  }
  async function ocr() {
    if (!state.image || state.busy) return;
    busy(true, 'Đang OCR bài toán...');
    try {
      const data = await window.VMODataService.ocrMathSupport(state.image);
      const content = String(data?.latexText || '').trim();
      if (!content || content.length > 50000) throw new Error('OCR chưa có nội dung hợp lệ. Vui lòng thử ảnh rõ hơn.');
      state.confidence = String(data.confidence || '');
      byId('supportContent').value = content;
      byId('supportOcrEditor').hidden = false;
      preview();
      status('supportUploadStatus', 'OCR hoàn tất. Hãy kiểm tra đề bài và công thức, sau đó lưu.');
    } catch (error) { status('supportUploadStatus', error.message || 'Không OCR được ảnh. Vui lòng thử lại.'); }
    finally { busy(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (state.busy || !state.image || !byId('supportContent').value.trim() || !byId('mathSupportForm').reportValidity()) return;
    busy(true, 'Đang lưu bài toán...');
    try {
      await window.VMODataService.createMathSupport({ uploadKey: state.uploadKey, image: state.image,
        content: byId('supportContent').value.trim(), title: byId('supportTitle').value.trim(),
        topic: byId('supportTopic').value.trim(), maxScore: Number(byId('supportScore').value), ocrConfidence: state.confidence });
      window.invalidateVMODataCache?.();
      byId('mathSupportForm').reset(); byId('supportOcrEditor').hidden = true;
      byId('supportContent').value = ''; byId('supportMathPreview').replaceChildren();
      byId('supportImagePreview').hidden = true; byId('supportImagePreview').removeAttribute('src');
      state.image = ''; state.uploadKey = ''; state.confidence = '';
      byId('supportSearch').value = '';
      status('supportUploadStatus', 'Đã lưu bài toán. Bạn có thể sao chép, nộp bài giải và quản lý nguồn bên dưới.');
      await window.loadMathSupportProblems(1, true);
    } catch (error) { status('supportUploadStatus', error.message || 'Chưa lưu được bài toán. Nội dung được giữ lại để thử lại.'); }
    finally { busy(false); }
  }
  function renderProblem(problem) {
    const article = document.createElement('article'); article.className = 'exam-card math-support-card';
    article.id = `support-${problem.id || problem._id}`;
    article.innerHTML = '<div class="exam-header"><h3 class="exam-title"></h3><p class="math-support-meta"></p></div><div class="exam-body"><div class="problem-item"><div class="problem-header"><div class="problem-id"><span></span><span class="badge-point"></span><span class="badge-topic"></span></div><button type="button" class="btn-copy">📋 Sao chép</button></div><div class="problem-content" data-no-i18n="true"></div></div></div>';
    article.querySelector('.exam-title').textContent = problem.title || 'Bài toán riêng lẻ';
    article.querySelector('.math-support-meta').textContent = `${problem.createdBy || ''} · ${problem.createdAt ? new Date(problem.createdAt).toLocaleDateString('vi-VN') : ''}`;
    const item = article.querySelector('.problem-item');
    Object.assign(item.dataset, { contentKey: problem.contentKey, databaseProblem: 'true', setKey: problem.setKey,
      setTitle: problem.setTitle || 'Hỗ trợ giải toán', sourceGroup: 'math_support', sourceType: 'standalone_question', contentType: 'standalone_problem', questionNumber: '1' });
    item.querySelector('.problem-id span').textContent = problem.title || 'Bài toán';
    item.querySelector('.badge-point').textContent = ` (${Number(problem.maxScore) || 5}đ) `;
    item.querySelector('.badge-topic').textContent = problem.topic || 'Toán Olympic';
    item.querySelector('.btn-copy').onclick = event => window.copyText(event.currentTarget);
    const imageButton = document.createElement('button'); imageButton.type = 'button'; imageButton.className = 'btn-secondary'; imageButton.textContent = '🖼️ Xem ảnh nguồn';
    imageButton.onclick = async () => {
      if (article.querySelector('.math-support-source-image')) { article.querySelector('.math-support-source-image').remove(); imageButton.textContent = '🖼️ Xem ảnh nguồn'; return; }
      imageButton.disabled = true;
      try {
        const image = await window.VMODataService.getMathSupportImage(problem.id || problem._id);
        const img = document.createElement('img'); img.className = 'math-support-source-image'; img.alt = 'Ảnh nguồn của bài toán'; img.src = image.image;
        article.querySelector('.exam-body').prepend(img); imageButton.textContent = 'Ẩn ảnh nguồn';
      } catch (error) { status('supportListStatus', error.message || 'Không tải được ảnh nguồn.'); }
      finally { imageButton.disabled = false; }
    };
    article.querySelector('.exam-header').append(imageButton);
    return article;
  }
  window.loadMathSupportProblems = async function(page = state.page, force = false) {
    if (!byId('supportProblems') || (!force && state.loaded && page === state.page)) return;
    const token = ++state.loadToken;
    status('supportListStatus', 'Đang tải bài toán...');
    try {
      const result = await window.VMODataService.getMathSupportProblems(page, byId('supportSearch').value.trim());
      if (token !== state.loadToken) return;
      state.page = result.pagination.page; state.pages = result.pagination.pages; state.loaded = true;
      const root = byId('supportProblems'); root.replaceChildren(...result.items.map(renderProblem));
      await window.enhanceMathSupportProblems(root, result.items);
      status('supportListStatus', result.items.length ? `${result.pagination.total} bài toán đã lưu` : 'Chưa có bài toán phù hợp. Tải ảnh lên để bắt đầu.');
      byId('supportPageLabel').textContent = `Trang ${state.page}/${state.pages}`;
      byId('supportPrevious').disabled = state.page <= 1; byId('supportNext').disabled = state.page >= state.pages;
    } catch (error) { if (token === state.loadToken) status('supportListStatus', error.message || 'Không tải được bài toán. Hãy bấm Tải lại.'); }
  };
  async function loadImage(file) {
    if (state.busy) return;
    if (file && !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      status('supportUploadStatus', 'Vui lòng chọn hoặc dán ảnh JPEG, PNG hoặc WEBP.'); return;
    }
    if (file && file.size > 20 * 1024 * 1024) {
      status('supportUploadStatus', 'Ảnh gốc quá lớn. Vui lòng chọn ảnh dưới 20 MB.'); return;
    }
    // Prepare before replacing the current draft, so a failed image keeps its OCR.
    busy(true, 'Đang chuẩn bị ảnh bài toán...');
    try {
      const image = file ? await window.prepareMathSupportImage(file) : '';
      state.image = image; state.uploadKey = image ? crypto.randomUUID() : ''; state.confidence = '';
      byId('supportContent').value = ''; byId('supportOcrEditor').hidden = true;
      byId('supportMathPreview').replaceChildren();
      byId('supportImagePreview').hidden = !image;
      if (image) byId('supportImagePreview').src = image;
      else byId('supportImagePreview').removeAttribute('src');
      status('supportUploadStatus', image ? 'Ảnh đã sẵn sàng. Bấm OCR bài toán để nhận diện.' : '');
    } catch (error) { status('supportUploadStatus', error.message || 'Không đọc được ảnh.'); }
    finally { busy(false); }
  }
  function init() {
    if (!byId('mathSupportForm')) return;
    byId('supportImage').addEventListener('change', event => loadImage(event.target.files?.[0]));
    document.addEventListener('paste', event => {
      if (event.defaultPrevented || !byId('tab-support').classList.contains('active') ||
          document.querySelector('.modal.active, .vmo-modal.active, #submissionModal.active, .trend-practice-modal.active')) return;
      const item = Array.from(event.clipboardData?.items || []).find(item => item.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return; // Ordinary text paste remains native, including in the OCR editor.
      event.preventDefault();
      if (state.busy) return;
      byId('supportImage').value = '';
      loadImage(file);
    });
    byId('supportOcrButton').addEventListener('click', ocr);
    byId('mathSupportForm').addEventListener('submit', save);
    byId('supportPreviewButton').addEventListener('click', preview);
    byId('supportContent').addEventListener('input', () => { byId('supportSaveButton').disabled = state.busy || !state.image || !byId('supportContent').value.trim(); });
    byId('supportReload').addEventListener('click', () => window.loadMathSupportProblems(1, true));
    byId('supportPrevious').addEventListener('click', () => window.loadMathSupportProblems(state.page - 1, true));
    byId('supportNext').addEventListener('click', () => window.loadMathSupportProblems(state.page + 1, true));
    let timer;
    byId('supportSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => window.loadMathSupportProblems(1, true), 300); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
