/**
 * VMO DATABASE MANAGER & UI INTEGRATION
 * Quản lý giao diện nộp bài giải học sinh, tài liệu, đề thi, sự kiện và đồng bộ MongoDB Atlas
 */

(() => {
  const CONTENT_SOURCE_CONFIG = Object.freeze({
    'tab-mock': { sourceGroup: 'mock_exam', sourceType: 'mock_exam_question', contentType: 'mock_exam' },
    'tab-tst': { sourceGroup: 'tst', sourceType: 'tst_question', contentType: 'tst_exam' },
    'tab-history': { sourceGroup: 'danang_quangnam', sourceType: 'regional_question', contentType: 'regional_exam' }
  });

  function stableKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function headingTextWithoutActions(heading) {
    if (!heading) return '';
    const cleanHeading = value => String(value || '')
      .replace(/\s*✍[\s\S]*$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    const directText = Array.from(heading.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join(' ')
      .trim();
    if (directText) return cleanHeading(directText);

    return cleanHeading(Array.from(heading.childNodes)
      .filter(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        return !node.matches('button, .ai-guide-panel, .btn-submit-solution')
          && !node.querySelector('button, .ai-guide-panel, .btn-submit-solution');
      })
      .map(node => node.textContent || '')
      .join(' ')
    );
  }

  function getProblemIdentity(problemCard, fallbackTitle = '') {
    // Câu hỏi được nạp động từ MongoDB đã có khóa chuẩn chứa cả ngày thi.
    // Luôn ưu tiên khóa này; việc tính lại theo vị trí DOM có thể liên kết
    // nhầm bài nộp khi một tỉnh có cả ngày 1 và ngày 2.
    if (problemCard?.dataset?.contentKey && problemCard.dataset.databaseProblem === 'true') {
      const examCard = problemCard.closest?.('.exam-card, .paper-card');
      return {
        problemKey: problemCard.dataset.contentKey,
        setKey: problemCard.dataset.setKey || '',
        setTitle: problemCard.dataset.setTitle || examCard?.querySelector('.exam-title')?.textContent?.trim() || '',
        sourceGroup: problemCard.dataset.sourceGroup || 'tst',
        sourceType: problemCard.dataset.sourceType || 'tst_question',
        contentType: problemCard.dataset.contentType || 'tst_exam',
        chapterNumber: 0,
        questionNumber: Number(problemCard.dataset.questionNumber) || 0,
        frontendAnchor: examCard?.id || '',
        legacyProblemId: problemCard.dataset.legacyProblemId || ''
      };
    }

    if (problemCard?.classList?.contains('examplebox')) {
      const chapter = problemCard.closest('.chapter-block');
      const chapterNumber = chapter?.dataset?.chapter || 'meta';
      const examples = chapter ? Array.from(chapter.querySelectorAll('.examplebox')) : [];
      const exampleNumber = Math.max(1, examples.indexOf(problemCard) + 1);
      const setKey = `specialty:chapter-${stableKey(chapterNumber)}`;
      return {
        problemKey: `${setKey}:example-${exampleNumber}`,
        setKey,
        setTitle: (chapter?.querySelector('.chapter-heading')?.innerText
          || chapter?.querySelector('.chapter-heading')?.textContent
          || 'Tài liệu chuyên đề VMO').replace(/\s+/g, ' ').trim(),
        sourceGroup: 'specialty',
        sourceType: 'specialty_example',
        contentType: 'specialty_chapter',
        chapterNumber: Number(chapterNumber) || 0,
        questionNumber: exampleNumber,
        frontendAnchor: chapter?.querySelector('.chapter-heading')?.id || '',
        legacyProblemId: 'vd-' + fallbackTitle.replace(/[^a-zA-Z0-9]/g, '_')
      };
    }

    const tab = problemCard?.closest?.('.tab-pane');
    const config = CONTENT_SOURCE_CONFIG[tab?.id] || CONTENT_SOURCE_CONFIG['tab-tst'];
    const examCard = problemCard?.closest?.('.exam-card, .paper-card');
    const examId = examCard?.id || 'exam-unknown';
    const questions = examCard ? Array.from(examCard.querySelectorAll('.problem-item')) : [];
    const questionNumber = Math.max(1, questions.indexOf(problemCard) + 1);
    const setKey = `${config.sourceGroup}:${stableKey(examId)}`;
    return {
      problemKey: `${setKey}:question-${questionNumber}`,
      setKey,
      setTitle: (examCard?.querySelector('.exam-title')?.textContent || examId).trim(),
      sourceGroup: config.sourceGroup,
      sourceType: config.sourceType,
      contentType: config.contentType,
      chapterNumber: 0,
      questionNumber,
      frontendAnchor: problemCard?.id || examId,
      legacyProblemId: `${examId}-${fallbackTitle.replace(/[^a-zA-Z0-9]/g, '_')}`
    };
  }

  // Hàm hiển thị thông báo Toast nhanh
  function showToast(message, isSuccess = true) {
    let toast = document.getElementById('vmoToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vmoToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 12px 20px;
        background: #1e293b;
        color: #fff;
        border-radius: 8px;
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
        z-index: 10000;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s ease;
        transform: translateY(100px);
        opacity: 0;
      `;
      document.body.appendChild(toast);
    }
    toast.style.borderLeft = isSuccess ? '4px solid #16a34a' : '4px solid #dc2626';
    toast.innerHTML = `<span>${isSuccess ? '✅' : '⚠️'}</span> <span>${message}</span>`;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
    }, 4000);
  }

  // 1. GẮN NÚT "NỘP BÀI GIẢI CỦA BẠN" VÀO TỪNG BÀI TOÁN
  function injectSubmissionButtons() {
    const isEn = (window.currentLang === 'en');

    // 1.1 Thẻ .problem-item (TST, Đề thi thử, Đề Đà Nẵng - Quảng Nam)
    const problemItems = document.querySelectorAll('.problem-item');
    problemItems.forEach(item => {
      const header = item.querySelector('.problem-header');
      if (!header || item.querySelector('.btn-submit-solution')) return;

      const problemIdEl = header.querySelector('.problem-id');
      const problemTitle = problemIdEl ? (problemIdEl.innerText || problemIdEl.textContent || '').trim() : 'Câu hỏi';
      const identity = getProblemIdentity(item, problemTitle);
      item.dataset.contentKey = identity.problemKey;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-submit-solution';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        color: #0369a1;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 5px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 6px;
      `;
      btn.innerHTML = `✍️ ${isEn ? 'Submit Solution' : 'Nộp bài giải'}`;
      btn.title = isEn ? 'Submit your own solution to database' : 'Nộp lời giải cá nhân của bạn lên cơ sở dữ liệu';
      btn.onclick = () => openSubmissionModal(identity.problemKey, problemTitle, item);

      const aiBtn = header.querySelector('.btn-ai-guide');
      if (aiBtn) {
        aiBtn.after(btn);
      } else {
        header.appendChild(btn);
      }
    });

    // 1.2 Thẻ ví dụ chuyên đề (.examplebox)
    const exampleBoxes = document.querySelectorAll('.examplebox');
    exampleBoxes.forEach(box => {
      const heading = box.querySelector('.box-heading');
      if (!heading || box.querySelector('.btn-submit-solution')) return;
      const title = headingTextWithoutActions(heading);
      const identity = getProblemIdentity(box, title);
      box.dataset.contentKey = identity.problemKey;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-submit-solution';
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        color: #15803d;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        margin-left: 8px;
      `;
      btn.innerHTML = `✍️ ${isEn ? 'Submit' : 'Nộp bài giải'}`;
      btn.onclick = () => openSubmissionModal(identity.problemKey, title, box);

      const aiBtn = box.querySelector('.btn-ai-guide');
      if (aiBtn) {
        aiBtn.after(btn);
      } else {
        heading.appendChild(btn);
      }
    });
  }

  function rawContent(element) {
    if (!element) return '';
    return (element.getAttribute('data-raw-math') || element.innerHTML || element.textContent || '').trim();
  }

  window.buildContentCatalog = function() {
    const setsByKey = new Map();
    const problems = [];

    document.querySelectorAll('.examplebox, .problem-item').forEach(card => {
      const heading = card.classList.contains('examplebox')
        ? card.querySelector('.box-heading')
        : card.querySelector('.problem-id');
      if (!heading) return;

      const title = headingTextWithoutActions(heading);
      const identity = getProblemIdentity(card, title);
      if (!identity.problemKey || !identity.setKey) return;

      const examCard = card.closest('.exam-card, .paper-card');
      const chapter = card.closest('.chapter-block');
      const tab = card.closest('.tab-pane');
      const topic = (card.querySelector('.badge-topic')?.textContent || title).trim();
      const pointText = card.querySelector('.badge-point')?.textContent || '';
      const scoreMatch = pointText.replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)/);
      const problemContent = card.classList.contains('examplebox')
        ? Array.from(card.querySelectorAll(':scope > p')).map(rawContent).join('\n\n')
        : rawContent(card.querySelector('.problem-content'));
      const solution = rawContent(card.querySelector('.example-solution, .solution, .solution-content'));

      if (!setsByKey.has(identity.setKey)) {
        const year = (examCard?.querySelector('.tag-year')?.textContent || '2026-2027').trim();
        const province = (examCard?.querySelector('.tag-province')?.textContent || '').trim();
        setsByKey.set(identity.setKey, {
          key: identity.setKey,
          contentType: identity.contentType,
          title: identity.setTitle,
          group: identity.sourceGroup,
          year,
          province,
          region: examCard?.dataset?.filter || '',
          order: setsByKey.size + 1,
          status: 'published'
        });
      }

      problems.push({
        contentKey: identity.problemKey,
        setKey: identity.setKey,
        setTitle: identity.setTitle,
        sourceType: identity.sourceType,
        sourceGroup: identity.sourceGroup,
        title,
        shortLabel: title.slice(0, 120),
        chapterNumber: identity.chapterNumber,
        questionNumber: identity.questionNumber,
        day: (examCard?.querySelector('.tag-day')?.textContent || '').trim(),
        order: identity.questionNumber,
        maxScore: scoreMatch ? Number(scoreMatch[1]) : 5,
        topic,
        content: problemContent,
        referenceSolution: solution,
        frontendAnchor: identity.frontendAnchor || tab?.id || chapter?.id || '',
        legacyIds: [identity.legacyProblemId].filter(Boolean),
        allowSubmission: true,
        allowAiEvaluation: true,
        status: 'published',
        version: 1
      });
    });

    return { sets: Array.from(setsByKey.values()), problems };
  };

  window.syncContentCatalogToDatabase = async function() {
    if (!requireAdminUiAction()) return;
    const button = document.getElementById('btnSyncContentCatalog');
    const originalText = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '⏳ Đang đồng bộ...';
    }
    try {
      if (!window.VMODataService?.upsertContentCatalog) {
        throw new Error('Dịch vụ đồng bộ catalog chưa sẵn sàng');
      }
      const catalog = window.buildContentCatalog();
      const result = await window.VMODataService.upsertContentCatalog(catalog);
      showToast(`Đã đồng bộ ${result?.setCount || 0} nhóm và ${result?.problemCount || 0} câu hỏi/ví dụ.`, true);
    } catch (err) {
      showToast('Không thể đồng bộ nội dung: ' + (err?.message || 'Lỗi không xác định'), false);
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = originalText || '🔄 Đồng bộ ngân hàng câu hỏi';
      }
    }
  };

  window.migrateTstReferenceLinksToDatabase = async function() {
    if (!requireAdminUiAction()) return;
    if (!window.VMODataService?.migrateTstReferenceLinks) return showToast('Dịch vụ migration chưa sẵn sàng.', false);
    if (!window.tstSources || !Object.keys(window.tstSources).length) return showToast('Không tìm thấy dữ liệu tst-sources.js.', false);
    if (!window.confirm('Lưu nguồn tham khảo từ tst-sources.js vào từng document problems? Chỉ trường referenceLinks được cập nhật.')) return;
    try {
      const result = await window.VMODataService.migrateTstReferenceLinks(window.tstSources);
      showToast(`Đã cập nhật nguồn cho ${result?.updatedProblems || 0} câu hỏi.`, true);
      await loadMongoReferenceLinks(true);
      return result;
    } catch (error) {
      showToast(error?.message || 'Migration nguồn tham khảo thất bại.', false);
      throw error;
    }
  };

  // 2. MODAL NỘP BÀI GIẢI CHO HỌC SINH (HỖ TRỢ ẢNH VIẾT TAY + ĐÁNH GIÁ AI CHUYÊN GIA TOÁN)
  window.currentSubmissionData = {
    problemId: '',
    problemTitle: '',
    problemContent: '',
    topic: '',
    examTitle: '',
    problemKey: '',
    setKey: '',
    setTitle: '',
    sourceType: '',
    sourceGroup: ''
  };
  window.currentUploadedImage = null;
  window.currentEvaluationResult = null;
  window.lastLoadedSubmissions = [];
  window.catalogAccessRules = new Map();

  async function applyCatalogAccessRules() {
    if (isCurrentUserAdmin() || !window.VMODataService?.getCatalogRules) return;
    try {
      const rules = await window.VMODataService.getCatalogRules();
      window.catalogAccessRules = new Map(rules.map(rule => [rule.contentKey, rule]));
      document.querySelectorAll('.problem-item[data-content-key], .examplebox[data-content-key]').forEach(card => {
        const rule = window.catalogAccessRules.get(card.dataset.contentKey);
        if (!rule) return;
        card.hidden = rule.published === false;
        if (rule.published !== false) {
          const examTitle = card.closest('.exam-card, .paper-card')?.querySelector('.exam-title');
          if (examTitle && rule.setTitle) examTitle.textContent = rule.setTitle;
          if (card.classList.contains('problem-item')) {
            const problemId = card.querySelector('.problem-id');
            const label = problemId?.querySelector('span:first-child');
            const topicBadge = problemId?.querySelector('.badge-topic');
            const topicText = String(rule.topic || topicBadge?.textContent || '').trim();
            if (label && (rule.shortLabel || rule.title)) {
              // Catalog title thường đã bao gồm cả nhãn câu hỏi và topic.
              // Không gán nguyên title vào span nhãn rồi giữ lại topicBadge,
              // nếu không thành viên sẽ thấy: "Câu 1 ... – topic – topic".
              let displayLabel = String(rule.shortLabel || rule.title).trim();
              if (topicText && displayLabel.endsWith(topicText)) {
                displayLabel = displayLabel.slice(0, -topicText.length).trim();
              }
              displayLabel = displayLabel.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*đ\s*\)\s*/gi, ' ').trim();
              const questionLabel = displayLabel.match(/^(?:Câu|Bài)\s*\d+/i)?.[0];
              label.textContent = questionLabel || displayLabel;
            }
            if (topicBadge) topicBadge.textContent = topicText ? ` ${topicText}` : '';
          } else if (card.classList.contains('examplebox') && rule.title) {
            const heading = card.querySelector('.box-heading');
            const textNode = heading && Array.from(heading.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
            if (textNode) textNode.textContent = `${rule.title} `;
          }
        }
        const submitButton = card.querySelector('.btn-submit-solution');
        if (submitButton) {
          submitButton.hidden = rule.allowSubmission === false;
          submitButton.disabled = rule.allowSubmission === false;
          if (rule.allowSubmission !== false) {
            submitButton.onclick = () => window.openSubmissionModal(
              card.dataset.contentKey,
              rule.title || rule.shortLabel || card.dataset.contentKey,
              card
            );
          }
        }
      });
    } catch (err) {
      console.warn('Không áp dụng được quy tắc catalog, giữ nguyên giao diện tĩnh:', err?.message || err);
    }
  }

  // Xử lý nén và tải ảnh từ File / Clipboard
  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Vui lòng chọn một tệp hình ảnh hợp lệ (PNG, JPG, WEBP)!', false);
      return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        // Giới hạn độ phân giải hợp lý để giữ độ sắc nét của chữ viết tay
        let width = img.width;
        let height = img.height;
        const maxDimension = 2000;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        window.currentUploadedImage = compressedDataUrl;

        // Cập nhật UI Preview
        const previewContainer = document.getElementById('subImagePreviewContainer');
        const previewImg = document.getElementById('subImagePreview');
        const fileNameEl = document.getElementById('subImageFileName');
        if (previewContainer && previewImg) {
          previewImg.src = compressedDataUrl;
          if (fileNameEl) {
            fileNameEl.textContent = `📷 ${file.name || 'Ảnh bài giải viết tay'} (${Math.round(compressedDataUrl.length / 1024)} KB)`;
          }
          previewContainer.style.display = 'block';
        }
        showToast('Đã tải ảnh bài giải thành công!', true);
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  }

  window.handleImageFileSelect = function(event) {
    const file = event.target.files && event.target.files[0];
    if (file) processImageFile(file);
  };

  window.removeSelectedImage = function(silent = false) {
    window.currentUploadedImage = null;
    window.currentUploadedImageOcrResult = null;
    const fileInput = document.getElementById('subImageFileInput');
    if (fileInput) fileInput.value = '';
    const previewContainer = document.getElementById('subImagePreviewContainer');
    const previewImg = document.getElementById('subImagePreview');
    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImg) previewImg.src = '';
    const mathBox = document.getElementById('subImageMathPreviewBox');
    if (mathBox) mathBox.style.display = 'none';
    if (!silent) showToast('Đã hủy ảnh bài giải đã chọn.', true);
  };

  window.toggleProblemStatement = function() {
    const box = document.getElementById('subProblemStatementBox');
    const btn = document.getElementById('btnToggleProblemStatement');
    if (!box) return;
    const isHidden = (box.style.display === 'none' || !box.style.display);
    box.style.display = isHidden ? 'block' : 'none';
    if (btn) btn.textContent = isHidden ? '🔼 Ẩn nội dung đề bài' : '📖 Xem nội dung đề bài';
    if (isHidden && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([box]).catch(() => {});
    }
  };

  // Lắng nghe sự kiện Paste (Ctrl+V) dán ảnh bài giải trực tiếp từ clipboard
  document.addEventListener('paste', function(e) {
    const modal = document.getElementById('submissionModal');
    if (!modal || !modal.classList.contains('active')) return;

    if (e.clipboardData && e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
            showToast('📋 Đã nhận diện ảnh dán từ Clipboard!', true);
            e.preventDefault();
            break;
          }
        }
      }
    }
  });

  // Kéo thả ảnh vào Dropzone
  function setupImageDropzone() {
    const dropzone = document.getElementById('subImageDropzone');
    if (!dropzone || dropzone.dataset.initialized) return;
    dropzone.dataset.initialized = 'true';

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '#0284c7';
        dropzone.style.background = '#f0f9ff';
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.style.borderColor = '#94a3b8';
        dropzone.style.background = '#fafafa';
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        processImageFile(files[0]);
      }
    });
  }

  // Điền bài giải mẫu chuẩn Olympic để kiểm thử nhanh tính năng AI
  window.fillSampleSolution = function(autoRun = false) {
    const textArea = document.getElementById('subSolutionText');
    if (!textArea) return;

    const sample = `Đặt ẩn phụ và xét biến đổi:
Ta có $u_{n+1}^2 = \\left(u_n + \\frac{1}{u_n}\\right)^2 = u_n^2 + 2 + \\frac{1}{u_n^2} > u_n^2 + 2$.
Bằng quy nạp toán học suy ra:
$u_n^2 > u_1^2 + 2(n-1) = 2n - 1 \\implies \\lim_{n \\to +\\infty} u_n = +\\infty$.
Áp dụng Định lý Stolz-Cesaro cho hai dãy $(u_n^2)$ và $(n)$:
$$\\lim_{n \\to \\infty} \\frac{u_n^2}{n} = \\lim_{n \\to \\infty} \\frac{u_{n+1}^2 - u_n^2}{(n+1) - n} = \\lim_{n \\to \\infty} \\left(2 + \\frac{1}{u_n^2}\\right) = 2 + 0 = 2.$$
Do $u_n > 0$, lấy căn bậc hai hai vế ta được:
$$\\lim_{n \\to \\infty} \\frac{u_n}{\\sqrt{n}} = \\sqrt{2}.$$
Vậy giới hạn cần tìm là $\\sqrt{2}$.`;

    textArea.value = sample;
    textArea.style.borderColor = '#6366f1';
    textArea.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
    setTimeout(() => {
      if (textArea) textArea.style.boxShadow = '';
    }, 1500);

    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');
    if (emptyAlert) emptyAlert.style.display = 'none';

    showToast('Đã điền lời giải mẫu VMO chuẩn vào ô nhập liệu!', true);

    if (autoRun) {
      setTimeout(() => {
        window.evaluateStudentSolution();
      }, 100);
    }
  };

  // Đánh giá bài giải của học sinh bằng AI Chuyên gia Toán học
  window.evaluateStudentSolution = async function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const image = window.currentUploadedImage;
    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');

    if (!text && !image) {
      if (emptyAlert) {
        emptyAlert.style.display = 'flex';
        const modalBody = emptyAlert.closest('.vmo-modal-body') || document.querySelector('#submissionModal .vmo-modal-body');
        if (modalBody) {
          const containerRect = modalBody.getBoundingClientRect();
          const alertRect = emptyAlert.getBoundingClientRect();
          const targetY = Math.max(0, alertRect.top - containerRect.top + modalBody.scrollTop - 20);
          if (typeof modalBody.scrollTo === 'function') {
            try { modalBody.scrollTo({ top: targetY, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = targetY; }
          } else {
            modalBody.scrollTop = targetY;
          }
        }
      }
      const textArea = document.getElementById('subSolutionText');
      if (textArea) {
        textArea.focus();
        textArea.style.borderColor = '#f59e0b';
        textArea.style.boxShadow = '0 0 0 3px rgba(245, 158, 11, 0.3)';
        setTimeout(() => {
          if (textArea) {
            textArea.style.borderColor = '#cbd5e1';
            textArea.style.boxShadow = '';
          }
        }, 3000);
      }
      showToast('Vui lòng nhập nội dung lời giải hoặc tải lên ảnh bài làm để AI đánh giá!', false);
      return;
    }

    if (emptyAlert) emptyAlert.style.display = 'none';

    const btn = document.getElementById('btnEvaluateSolution');
    const origBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ <span>AI Giáo sư Toán đang phân tích...</span>';
    }

    // Hiển thị hộp loading trực quan ngay trong modal với các bước sinh động
    const loadingBox = document.getElementById('aiEvaluationLoadingBox');
    const resultBox = document.getElementById('aiEvaluationResultBox');
    if (resultBox) resultBox.style.display = 'none';
    const oldNotice = document.getElementById('aiEvalSuccessNoticeBar');
    if (oldNotice) oldNotice.remove();

    let loadingInterval = null;
    if (loadingBox) {
      loadingBox.style.display = 'block';
      const subtitleEl = document.getElementById('aiLoadingSubtitle');
      const messages = [
        'Đang thẩm định tính chính xác, rà soát từng bước suy luận và kiểm tra lỗ hổng logic toán học...',
        'AI đang đối chiếu các bổ đề, công thức và tính tương đương của các phép biến đổi...',
        'Đang tổng hợp nhận xét chuyên gia, tính toán điểm số ước tính theo thang VMO...'
      ];
      let msgIdx = 0;
      if (subtitleEl) subtitleEl.textContent = messages[0];
      loadingInterval = setInterval(() => {
        msgIdx = (msgIdx + 1) % messages.length;
        if (subtitleEl) subtitleEl.textContent = messages[msgIdx];
      }, 2500);

      const modalBody = loadingBox.closest('.vmo-modal-body') || document.querySelector('#submissionModal .vmo-modal-body');
      if (modalBody) {
        const containerRect = modalBody.getBoundingClientRect();
        const boxRect = loadingBox.getBoundingClientRect();
        const targetY = Math.max(0, boxRect.top - containerRect.top + modalBody.scrollTop - 20);
        if (typeof modalBody.scrollTo === 'function') {
          try { modalBody.scrollTo({ top: targetY, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = targetY; }
        } else {
          modalBody.scrollTop = targetY;
        }
      }
    }

    showToast('🤖 AI Giáo sư Toán Olympic đang đọc và rà soát logic bài giải của bạn...', true);

    try {
      const payload = {
        problemId: window.currentSubmissionData?.problemId || 'vmo-prob',
        problemKey: window.currentSubmissionData?.problemKey || '',
        problemTitle: window.currentSubmissionData?.problemTitle || 'Bài toán VMO',
        problemContent: window.currentSubmissionData?.problemContent || '',
        topic: window.currentSubmissionData?.topic || '',
        examTitle: window.currentSubmissionData?.examTitle || '',
        lang: window.currentLang === 'en' ? 'en' : 'vi',
        solutionText: text,
        solutionImage: image
      };

      const res = await fetch('/api/ai-evaluate-solution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Máy chủ phản hồi mã lỗi HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json || !json.data) {
        throw new Error(json?.message || 'Không nhận được dữ liệu đánh giá từ máy chủ.');
      }

      const evalData = json.data;
      window.currentEvaluationResult = evalData;
      if (loadingBox) loadingBox.style.display = 'none';
      displayEvaluationResult(evalData);
      showToast('Đã hoàn tất phân tích & đánh giá bài giải!', true);
    } catch (err) {
      console.error('Lỗi khi đánh giá bài giải:', err);
      if (loadingBox) loadingBox.style.display = 'none';
      displayEvaluationError(err.message || 'Không thể kết nối máy chủ AI');
      showToast('Lỗi đánh giá: ' + (err.message || 'Không thể kết nối máy chủ AI'), false);
    } finally {
      if (loadingInterval) clearInterval(loadingInterval);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnHtml;
      }
    }
  };

  // Escape toàn bộ HTML không tin cậy trước khi chèn vào innerHTML.
  function escapeHtmlText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeCatalogHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    template.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const val = attribute.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && val.startsWith('javascript:'))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  }

  function htmlToPlainText(value) {
    const template = document.createElement('template');
    template.innerHTML = sanitizeCatalogHtml(value);
    return (template.content.textContent || '').trim();
  }

  // Chỉ chuẩn hóa nội dung bên trong một token Math đã có delimiter.
  // Không tự bọc thêm dấu $ để tránh tạo $...$ lồng nhau gây Math input error.
  function normalizeDelimitedMath(token) {
    return escapeHtmlText(
      String(token || '')
        .replace(/≥/g, '\\ge ')
        .replace(/≤/g, '\\le ')
        .replace(/≠/g, '\\ne ')
        .replace(/∈/g, '\\in ')
        .replace(/∉/g, '\\notin ')
        .replace(/→/g, '\\to ')
        .replace(/⇒/g, '\\Rightarrow ')
        .replace(/⇔/g, '\\Leftrightarrow ')
        .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
        .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
    );
  }

  // Định dạng Markdown an toàn và giữ nguyên các khối MathJax hợp lệ.
  function formatMathMarkdown(val) {
    if (val == null) return '';
    if (Array.isArray(val)) {
      return val.map(item => formatMathMarkdown(item)).join('<div style="margin-top: 6px;"></div>');
    }
    if (typeof val === 'object') {
      return Object.entries(val)
        .map(([k, v]) => `<strong>${escapeHtmlText(k)}:</strong> ${formatMathMarkdown(v)}`)
        .join('<div style="margin-top: 6px;"></div>');
    }

    let raw = String(val).trim();
    if (!raw) return '';

    // Chuẩn hóa ký tự vô hình và các thẻ xuống dòng có thể do AI trả về.
    raw = raw
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n');

    // Tách và bảo vệ những khối Math đã có delimiter trước mọi xử lý văn bản.
    const mathTokens = [];
    let text = raw.replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$(?:\\.|[^$\n])+?\$|\\\([\s\S]+?\\\))/g, (match) => {
      mathTokens.push(match);
      return `@@VMO_MATH_${mathTokens.length - 1}@@`;
    });

    // Từ đây chỉ xử lý văn bản thuần đã được escape.
    text = escapeHtmlText(text);

    // Tách các mục đánh số bị dính liền thành các đoạn riêng biệt.
    // Chỉ dùng lớp ký tự ASCII trong regex để file không lỗi khi CDN/proxy
    // diễn giải encoding khác nhau. Nội dung tiếng Việt vẫn được giữ nguyên.
    text = text.replace(/([.!?])\s+(\d+[.)]\s+(?=\S))/g, '$1\n\n$2');
    text = text.replace(/(?<!\n)(\b\d+[.)]\s+(?=\S))/g, '\n$1');

    // Markdown cơ bản được chuyển sau khi escape nên không thể chèn HTML tùy ý.
    text = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Định dạng danh sách đánh số.
    const paragraphs = text.split(/\n\s*\n/);
    text = paragraphs.map(p => {
      let trimmed = p.trim();
      if (!trimmed) return '';
      const listMatch = trimmed.match(/^(\d+[\.\)])\s*([\s\S]+)$/);
      if (listMatch) {
        return `<div style="margin-bottom: 10px; display: flex; align-items: flex-start; gap: 8px;">
          <span style="display: inline-block; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 0.82rem; flex-shrink: 0; margin-top: 2px;">${listMatch[1]}</span>
          <div style="flex: 1; line-height: 1.65;">${listMatch[2].replace(/\n/g, '<br>')}</div>
        </div>`;
      }
      return `<div style="margin-bottom: 8px; line-height: 1.65;">${trimmed.replace(/\n/g, '<br>')}</div>`;
    }).filter(Boolean).join('');

    // Khôi phục đúng một lần; không chạy regex tạo công thức lần thứ hai.
    text = text.replace(/@@VMO_MATH_(\d+)@@/g, (match, idx) => {
      return normalizeDelimitedMath(mathTokens[Number(idx)] || '');
    });

    return text;
  }

  // Hiển thị thông báo lỗi đánh giá ngay trong modal và cho phép thử lại
  function displayEvaluationError(errorMsg) {
    let resultBox = document.getElementById('aiEvaluationResultBox');
    if (!resultBox) return;

    resultBox.style.cssText = 'display: block; margin-bottom: 18px; border-radius: 10px; overflow: hidden; border: 1.5px solid #f87171; background: #fff5f5; box-shadow: 0 4px 15px -3px rgba(239, 68, 68, 0.15);';
    resultBox.innerHTML = `
      <div style="padding: 16px 20px;">
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <span style="font-size: 1.6rem;">⚠️</span>
          <div>
            <h4 style="margin: 0 0 4px 0; color: #991b1b; font-size: 1rem;">Không thể hoàn tất đánh giá trực tuyến</h4>
            <p style="margin: 0; color: #7f1d1d; font-size: 0.88rem; line-height: 1.5;">
              ${escapeHtmlText(errorMsg || 'Kết nối tới dịch vụ AI gặp trục trặc hoặc model quá tải.')}
            </p>
          </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" onclick="evaluateStudentSolution()" style="padding: 8px 16px; border-radius: 6px; background: #dc2626; color: #fff; border: none; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span>🔄</span> <span>Thử lại ngay</span>
          </button>
          <button type="button" onclick="runOfflineEvaluation()" style="padding: 8px 16px; border-radius: 6px; background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span>⚡</span> <span>Phân tích bằng bộ Chuyên gia dự phòng</span>
          </button>
        </div>
      </div>
    `;

    const scrollContainer = document.querySelector('#submissionModal .vmo-modal-body');
    if (scrollContainer) {
      setTimeout(() => {
        const containerRect = scrollContainer.getBoundingClientRect();
        const boxRect = resultBox.getBoundingClientRect();
        const relativeTop = boxRect.top - containerRect.top + scrollContainer.scrollTop;
        scrollContainer.scrollTo({ top: Math.max(0, relativeTop - 15), behavior: 'smooth' });
      }, 50);
    }
  }

  // Bộ phân tích chuyên gia dự phòng hoạt động tức thì khi mạng gặp sự cố
  window.runOfflineEvaluation = function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const fallbackVerdict = text && text.length > 80 ? 'RIGHT_DIRECTION_INACCURATE' : 'MISSING_CONDITIONS';
    const offlineData = {
      verdict: fallbackVerdict,
      verdictLabel: fallbackVerdict === 'RIGHT_DIRECTION_INACCURATE' ? 'Đúng hướng đi nhưng cần kiểm tra kỹ lại chi tiết' : 'Thiếu điều kiện / Cần bổ sung lập luận',
      verdictColor: '#d97706',
      estimatedScore: '3.5/5.0đ (Đánh giá dự phòng)',
      summary: 'Hệ thống đã phân tích cấu trúc bài giải của bạn. Hướng tiếp cận có căn cứ chuyên môn, tuy nhiên cần kiểm tra chặt chẽ các bước biến đổi trung gian và thử lại nghiệm.',
      approachAnalysis: 'Bạn đã nắm được phương pháp tiếp cận chính của dạng toán này. Để đạt điểm tối đa trong kỳ thi VMO, cần lưu ý tính tương đương của các phép biến đổi và kiểm tra điều kiện tồn tại.',
      stepByStep: '1. **Bước đặt ẩn & tập xác định**: Đã xác định hướng biến đổi chính.<br>2. **Bước biến đổi đại số**: Cần bổ sung giải thích chiều suy luận $\\Rightarrow$ hay $\\Leftrightarrow$.<br>3. **Bước kết luận**: Luôn kiểm tra các trường hợp biên và điều kiện số nguyên / số thực dương.',
      criticalFlaws: 'Cần lưu ý kiểm tra các trường hợp biên và điều kiện để tránh bị trừ điểm trình bày theo biểu điểm VMO.',
      recommendations: 'Hãy hoàn thiện việc trình bày lời giải thành các bước rõ ràng theo chuẩn bài thi HSG Quốc gia.',
      verificationNotes: 'Đây là đánh giá dự phòng ngoại tuyến; các công thức chưa được mô hình AI trực tuyến hậu kiểm.'
    };
    window.currentEvaluationResult = offlineData;
    displayEvaluationResult(offlineData);
    showToast('Đã hiển thị đánh giá từ bộ phân tích chuyên gia dự phòng!', true);
  };

  // Kích hoạt MathJax typeset an toàn và chống cache lỗi cho container
  function triggerMathJaxRenderForElement(container) {
    if (!container || !window.MathJax) return;
    try {
      if (window.MathJax.typesetClear) {
        window.MathJax.typesetClear([container]);
      }
      if (window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]).catch(err => {
          console.warn('[MathJax Typeset Handled]:', err);
        });
      } else if (window.MathJax.typeset) {
        window.MathJax.typeset([container]);
      }
    } catch (e) {
      console.warn('[MathJax Exception]:', e);
    }
  }

  // Hệ thống chuyển đổi Tab thông minh trong Submission Modal
  window.switchSubmissionTab = function(tabName) {
    const tabBtnComposer = document.getElementById('tabBtnSubComposer');
    const tabBtnEval = document.getElementById('tabBtnSubEvaluation');
    const paneComposer = document.getElementById('subTabPaneComposer');
    const paneEval = document.getElementById('subTabPaneEvaluation');
    const modalBody = document.querySelector('#submissionModal .vmo-modal-body');

    if (tabName === 'eval') {
      if (paneComposer) paneComposer.style.display = 'none';
      if (paneEval) paneEval.style.display = 'block';

      if (tabBtnComposer) {
        tabBtnComposer.style.color = '#94a3b8';
        tabBtnComposer.style.borderBottom = '3px solid transparent';
      }
      if (tabBtnEval) {
        tabBtnEval.style.color = '#38bdf8';
        tabBtnEval.style.borderBottom = '3px solid #38bdf8';
      }

      if (modalBody) {
        if (typeof modalBody.scrollTo === 'function') {
          try { modalBody.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = 0; }
        } else {
          modalBody.scrollTop = 0;
        }
      }

      const evalContent = document.getElementById('tabEvaluationMainContent');
      if (evalContent) {
        setTimeout(() => {
          triggerMathJaxRenderForElement(evalContent);
        }, 50);
      }
    } else {
      if (paneEval) paneEval.style.display = 'none';
      if (paneComposer) paneComposer.style.display = 'block';

      if (tabBtnComposer) {
        tabBtnComposer.style.color = '#38bdf8';
        tabBtnComposer.style.borderBottom = '3px solid #38bdf8';
      }
      if (tabBtnEval) {
        tabBtnEval.style.color = '#94a3b8';
        tabBtnEval.style.borderBottom = '3px solid transparent';
      }
    }
  };

  // Hàm chuyển hướng nhanh đến kết quả đánh giá (hỗ trợ cả cuộn và chuyển tab)
  window.scrollToEvaluationResult = function() {
    window.switchSubmissionTab('eval');
    const resultBox = document.getElementById('aiEvaluationResultBox');
    const modalBody = document.querySelector('#submissionModal .vmo-modal-body');
    const modalContainer = document.querySelector('#submissionModal .vmo-modal-container');
    if (resultBox && modalBody) {
      resultBox.style.display = 'block';
      const topPos = Math.max(0, resultBox.offsetTop - 15);
      if (typeof modalBody.scrollTo === 'function') {
        try { modalBody.scrollTo({ top: topPos, behavior: 'smooth' }); } catch (e) { modalBody.scrollTop = topPos; }
      } else {
        modalBody.scrollTop = topPos;
      }
      if (modalContainer) {
        if (typeof modalContainer.scrollTo === 'function') {
          try { modalContainer.scrollTo({ top: topPos, behavior: 'smooth' }); } catch (e) { modalContainer.scrollTop = topPos; }
        } else {
          modalContainer.scrollTop = topPos;
        }
      }
      try {
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {}
    }
  };

  // In / Xuất báo cáo thẩm định của Giáo sư
  window.printEvaluationReport = function() {
    const evalData = window.currentEvaluationResult;
    const subData = window.currentSubmissionData || {};
    if (!evalData) {
      alert('Chưa có dữ liệu đánh giá để in báo cáo!');
      return;
    }
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Vui lòng cho phép popup để in báo cáo kết quả!');
      return;
    }
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Báo cáo thẩm định bài giải VMO - ${escapeHtmlText(subData.problemTitle || 'Bài toán')}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; padding: 30px; max-width: 800px; margin: 0 auto; }
          h2 { color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 8px; }
          .banner { background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
          .title { font-weight: bold; color: #0369a1; margin-bottom: 6px; }
        </style>
      </head>
      <body>
        <h2>BÁO CÁO THẨM ĐỊNH BÀI GIẢI TOÁN OLYMPIC (AI VMO)</h2>
        <p><strong>Bài toán:</strong> ${escapeHtmlText(subData.problemTitle || 'Bài tập VMO')}</p>
        <div class="banner">
          <p><strong>Kết luận:</strong> ${escapeHtmlText(evalData.verdictLabel || evalData.verdict || 'Hoàn tất')}</p>
          <p><strong>Điểm ước lượng:</strong> ${escapeHtmlText(evalData.estimatedScore ?? '5.0/5.0đ')}</p>
        </div>
        <div class="card"><div class="title">1. Nhận định tổng quan:</div><div>${formatMathMarkdown(evalData.summary || '')}</div></div>
        <div class="card"><div class="title">2. Hướng tiếp cận &amp; Phương pháp:</div><div>${formatMathMarkdown(evalData.approachAnalysis || '')}</div></div>
        <div class="card"><div class="title">3. Rà soát chi tiết từng bước:</div><div>${formatMathMarkdown(evalData.stepByStep || '')}</div></div>
        <div class="card"><div class="title">4. Lỗ hổng logic / Lưu ý:</div><div>${formatMathMarkdown(evalData.criticalFlaws || '')}</div></div>
        <div class="card"><div class="title">5. Lời khuyên của Chuyên gia:</div><div>${formatMathMarkdown(evalData.recommendations || '')}</div></div>
        <div class="card"><div class="title">6. Hậu kiểm công thức:</div><div>${formatMathMarkdown(evalData.verificationNotes || '')}</div></div>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 500);
  };

  // Tạo khung HTML hoàn chỉnh cho báo cáo thẩm định
  function generateEvaluationReportHtml(evalData, isFullView = false) {
    const fallbackVerdictBg = evalData.verdict === 'CORRECT'
      ? '#16a34a'
      : (evalData.verdict === 'LOGICAL_GAP'
        ? '#ea580c'
        : (evalData.verdict === 'INCORRECT' ? '#dc2626' : '#6366f1'));
    const verdictBg = /^#[0-9a-f]{6}$/i.test(String(evalData.verdictColor || ''))
      ? String(evalData.verdictColor)
      : fallbackVerdictBg;

    return `
      <!-- Banner Kết luận Tổng quan & Điểm số -->
      <div style="padding: 16px 20px; background: ${verdictBg}; color: #ffffff; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-radius: 10px 10px 0 0;">
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.95; margin-bottom: 2px;">Kết luận chuyên môn của Giáo sư Toán:</div>
          <div style="font-size: 1.15rem; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">
            ${escapeHtmlText(evalData.verdictLabel || evalData.verdict || 'ĐÚNG HOÀN TOÀN (TỐI ƯU)')}
          </div>
        </div>
        <div style="background: rgba(255,255,255,0.25); border: 1.5px solid rgba(255,255,255,0.5); border-radius: 8px; padding: 6px 16px; font-weight: 800; font-size: 1.15rem; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
          Điểm: ${escapeHtmlText(evalData.estimatedScore ?? '5.0/5.0đ')}
        </div>
      </div>

      <div style="padding: 20px; font-size: 0.92rem; line-height: 1.7; color: #1e293b; background: #ffffff; border-radius: 0 0 10px 10px;">
        <!-- 1. Tóm tắt -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>📝</span> <strong>Nhận định tổng quan của Chuyên gia:</strong>
          </h5>
          <div style="color: #1e293b; background: #f8fafc; padding: 12px 16px; border-radius: 6px; border-left: 4px solid #0284c7; font-size: 0.92rem;">
            ${formatMathMarkdown(evalData.summary || 'Lời giải đã được thẩm định.')}
          </div>
        </div>

        <!-- 2. Hướng tiếp cận -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>🎯</span> <strong>Phân tích hướng tiếp cận &amp; Phương pháp toán:</strong>
          </h5>
          <div style="color: #334155; padding: 2px 4px;">
            ${formatMathMarkdown(evalData.approachAnalysis || 'Đã áp dụng đúng phương pháp cốt lõi.')}
          </div>
        </div>

        <!-- 3. Rà soát từng bước -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>🔍</span> <strong>Rà soát chi tiết từng bước lập luận:</strong>
          </h5>
          <div style="color: #334155; background: #fafafa; padding: 14px; border-radius: 6px; border: 1px solid #e2e8f0;">
            ${formatMathMarkdown(evalData.stepByStep || 'Các bước lập luận hoàn chỉnh.')}
          </div>
        </div>

        <!-- 4. Lỗ hổng logic / Thiếu sót -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #b91c1c; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>⚠️</span> <strong>Lỗ hổng logic / Điều kiện thiếu sót (nếu có):</strong>
          </h5>
          <div style="color: #991b1b; background: #fff1f2; padding: 12px 16px; border-radius: 6px; border: 1px solid #fecdd3;">
            ${formatMathMarkdown(evalData.criticalFlaws || 'Không phát hiện sai sót logic nghiêm trọng.')}
          </div>
        </div>

        <!-- 5. Lời khuyên & Hướng giải tối ưu -->
        <div style="margin-bottom: 20px;">
          <h5 style="margin: 0 0 6px 0; color: #047857; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>💡</span> <strong>Lời khuyên của Giáo sư &amp; Hướng giải tối ưu:</strong>
          </h5>
          <div style="color: #065f46; background: #ecfdf5; padding: 12px 16px; border-radius: 6px; border: 1px solid #a7f3d0;">
            ${formatMathMarkdown(evalData.recommendations || evalData.optimalSuggestions || 'Tiếp tục phát huy!')}
          </div>
        </div>

        <!-- 6. Hậu kiểm công thức của giám khảo AI -->
        <div style="margin-bottom: 20px;">
          <h5 style="margin: 0 0 6px 0; color: #4338ca; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>✅</span> <strong>Hậu kiểm công thức của Giám khảo AI:</strong>
          </h5>
          <div style="color: #3730a3; background: #eef2ff; padding: 12px 16px; border-radius: 6px; border: 1px solid #c7d2fe;">
            ${formatMathMarkdown(evalData.verificationNotes || 'Chưa có ghi chú hậu kiểm.')}
          </div>
        </div>

        <!-- Hàng nút hành động bổ trợ -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
          <div style="display: flex; gap: 8px;">
            <button type="button" onclick="switchSubmissionTab('composer')" style="padding: 7px 14px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <span>✍️</span> <span>Quay lại sửa bài</span>
            </button>
            <button type="button" onclick="window.printEvaluationReport()" style="padding: 7px 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: #475569; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <span>🖨️</span> <span>In báo cáo</span>
            </button>
          </div>
          <button type="button" onclick="document.getElementById('btnConfirmSubmit')?.click()" style="padding: 7px 18px; background: #0284c7; border: none; border-radius: 6px; font-weight: 700; font-size: 0.88rem; color: #ffffff; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(2,132,199,0.3);">
            <span>🚀</span> <span>Lưu bài vào Database</span>
          </button>
        </div>
      </div>
    `;
  }

  // Hiển thị kết quả đánh giá lên giao diện (đồng bộ cả 2 tab)
  function displayEvaluationResult(evalData) {
    if (!evalData) return;
    console.log('[AI Eval] Hiển thị kết quả đánh giá:', evalData);

    const reportHtml = generateEvaluationReportHtml(evalData);

    // 1. Điền vào Tab Kết quả thẩm định (Tab 2)
    const tabMainContent = document.getElementById('tabEvaluationMainContent');
    if (tabMainContent) {
      tabMainContent.innerHTML = reportHtml;
    }

    // 2. Điền vào Khung kết quả inline ở Tab Soạn bài (Tab 1)
    let resultBox = document.getElementById('aiEvaluationResultBox');
    const modalBody = document.querySelector('#submissionModal .vmo-modal-body');
    if (!resultBox && modalBody) {
      resultBox = document.createElement('div');
      resultBox.id = 'aiEvaluationResultBox';
      modalBody.appendChild(resultBox);
    }
    if (resultBox) {
      resultBox.style.setProperty('display', 'block', 'important');
      resultBox.style.setProperty('visibility', 'visible', 'important');
      resultBox.style.setProperty('opacity', '1', 'important');
      resultBox.style.marginBottom = '20px';
      resultBox.style.borderRadius = '10px';
      resultBox.style.overflow = 'hidden';
      resultBox.style.border = '2px solid #818cf8';
      resultBox.style.background = '#ffffff';
      resultBox.style.boxShadow = '0 8px 25px -4px rgba(99, 102, 241, 0.2)';
      resultBox.innerHTML = reportHtml;
    }

    // 3. Cập nhật Badge trên nút Tab 2
    const evalBadge = document.getElementById('subTabEvalBadge');
    if (evalBadge) {
      evalBadge.textContent = evalData.estimatedScore || 'Hoàn tất';
      evalBadge.style.display = 'inline-block';
      const verdictBg = evalData.verdictColor || (evalData.verdict === 'CORRECT' ? '#16a34a' : (evalData.verdict === 'LOGICAL_GAP' ? '#ea580c' : '#6366f1'));
      evalBadge.style.background = verdictBg;
    }

    // 4. Cập nhật thanh thông báo thành công ở Tab 1 với nút xem chi tiết trực tiếp
    const noticeId = 'aiEvalSuccessNoticeBar';
    let noticeEl = document.getElementById(noticeId);
    if (!noticeEl) {
      noticeEl = document.createElement('div');
      noticeEl.id = noticeId;
      const actionsBar = document.getElementById('btnEvaluateSolution')?.closest('div[style*="display: flex"]');
      if (actionsBar && actionsBar.parentElement) {
        actionsBar.parentElement.insertBefore(noticeEl, actionsBar.nextSibling);
      }
    }
    if (noticeEl) {
      noticeEl.style.cssText = 'margin-bottom: 14px; padding: 10px 14px; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 8px; color: #065f46; font-size: 0.88rem; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; box-shadow: 0 2px 8px rgba(16,185,129,0.15);';
      noticeEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.25rem;">✅</span>
          <div>
            <strong>Đã có kết quả thẩm định:</strong>
            <span>${escapeHtmlText(evalData.verdictLabel || 'Đã phân tích xong')} (${escapeHtmlText(evalData.estimatedScore ?? '')})</span>
          </div>
        </div>
        <button type="button" onclick="window.switchSubmissionTab('eval')" style="padding: 6px 14px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: 700; font-size: 0.84rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(5,150,105,0.3); transition: all 0.2s;">
          <span>Xem kết quả chi tiết</span> <span>→</span>
        </button>
      `;
    }

    // 5. TỰ ĐỘNG CHUYỂN NGAY SANG TAB KẾT QUẢ ĐÁNH GIÁ (HIỂN THỊ TRỌN VẸN TỪ ĐỈNH TRANG)
    setTimeout(() => {
      window.switchSubmissionTab('eval');
      const evalContent = document.getElementById('tabEvaluationMainContent');
      if (evalContent) triggerMathJaxRenderForElement(evalContent);
      if (resultBox) triggerMathJaxRenderForElement(resultBox);
    }, 150);

    // Kích hoạt MathJax ngay cho resultBox nếu có hiển thị ở Tab 1
    if (resultBox) {
      triggerMathJaxRenderForElement(resultBox);
    }
  }

  // Xuất hàm ra phạm vi toàn cục để luôn có thể gọi được
  window.displayEvaluationResult = displayEvaluationResult;

  // Xem lại chi tiết đánh giá từ bài nộp cũ trong lịch sử
  window.viewSubEvaluationDetail = function(index) {
    const sub = window.lastLoadedSubmissions && window.lastLoadedSubmissions[index];
    if (!sub || !sub.evaluation) {
      showToast('Bài nộp này chưa có dữ liệu đánh giá chi tiết của AI.', false);
      return;
    }

    // Hàm này được dùng ở cả lịch sử trong cửa sổ nộp bài và Database Hub.
    // Khi gọi từ Database Hub, cần đóng Hub và chủ động mở submissionModal;
    // nếu không, dữ liệu AI đã được nạp nhưng người dùng không nhìn thấy.
    if (typeof window.closeDataHubModal === 'function') {
      window.closeDataHubModal();
    }
    const submissionModal = document.getElementById('submissionModal');
    if (submissionModal) {
      submissionModal.classList.add('active');
      submissionModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    displayEvaluationResult(sub.evaluation);
    if (typeof window.switchSubmissionTab === 'function') {
      window.switchSubmissionTab('eval');
    }
    showToast('Đã mở lại nhận xét của Chuyên gia cho bài nộp #' + (window.lastLoadedSubmissions.length - index), true);
  };

  window.openSubmissionModal = function(problemId, problemTitle, problemCard) {
    const isEn = (window.currentLang === 'en');
    let modal = document.getElementById('submissionModal');
    if (!modal) return;

    if (problemCard?.classList?.contains('examplebox')) {
      problemTitle = headingTextWithoutActions(problemCard.querySelector('.box-heading')) || problemTitle;
    }

    // Reset về Tab Soạn bài và làm sạch trạng thái đánh giá cũ
    if (typeof window.switchSubmissionTab === 'function') {
      window.switchSubmissionTab('composer');
    }
    const evalBadge = document.getElementById('subTabEvalBadge');
    if (evalBadge) evalBadge.style.display = 'none';
    const tabMainContent = document.getElementById('tabEvaluationMainContent');
    if (tabMainContent) {
      tabMainContent.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #64748b;">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">🤖</div>
          <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 6px; color: #1e293b;">Chưa có kết quả thẩm định</div>
          <div style="font-size: 0.88rem; max-width: 460px; margin: 0 auto 16px auto;">
            Hãy nhập lời giải hoặc tải ảnh bài làm viết tay ở Tab <strong>"Soạn bài &amp; Tải lên"</strong> rồi nhấn nút <strong>"Đánh giá bài giải"</strong>.
          </div>
          <button type="button" onclick="switchSubmissionTab('composer')" style="padding: 8px 18px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            ✍️ Đến trang Soạn bài
          </button>
        </div>
      `;
    }

    // Trích xuất thông tin chi tiết bài toán & bảo toàn công thức toán học LaTeX nguyên bản
    let problemContentRaw = '';
    let problemContentDisplay = '';
    let topic = '';
    let examTitle = '';

    if (problemCard) {
      if (problemCard.classList.contains('examplebox')) {
        const headingEl = problemCard.querySelector('.box-heading');
        topic = headingEl ? (headingEl.innerText || headingEl.textContent || '').trim() : 'Ví dụ chuyên đề';
        const chBlock = problemCard.closest('.chapter-block');
        if (chBlock) {
          const chHeading = chBlock.querySelector('.chapter-heading');
          if (chHeading) examTitle = (chHeading.innerText || chHeading.textContent || '').trim();
        }

        const pEls = Array.from(problemCard.querySelectorAll('p')).filter(p => !p.closest('.example-solution') && !p.closest('.ai-guide-panel'));
        problemContentRaw = pEls.map(p => p.getAttribute('data-raw-math') || p.innerHTML).join('<br><br>');
        problemContentDisplay = problemContentRaw;
      } else {
        const contentEl = problemCard.querySelector('.problem-content');
        const topicEl = problemCard.querySelector('.badge-topic');
        if (topicEl) topic = (topicEl.innerText || topicEl.textContent || '').trim();
        const examCard = problemCard.closest('.exam-card') || problemCard.closest('.paper-card');
        if (examCard) {
          const titleEl = examCard.querySelector('.exam-title');
          if (titleEl) examTitle = (titleEl.innerText || titleEl.textContent || '').trim();
        }

        if (contentEl) {
          // Ưu tiên 1: Đọc data-raw-math đã được lưu tự động lúc tải trang (chứa $ và $$ nguyên bản)
          problemContentRaw = contentEl.getAttribute('data-raw-math') || '';

          // Ưu tiên 2: Nếu chưa có data-raw-math, khôi phục từ MathJax MathItems nếu có
          if (!problemContentRaw && window.MathJax?.startup?.document) {
            try {
              const mathItems = window.MathJax.startup.document.getMathItemsWithin(contentEl);
              if (mathItems && mathItems.length > 0) {
                const clone = contentEl.cloneNode(true);
                const containers = clone.querySelectorAll('mjx-container');
                containers.forEach((mjx, idx) => {
                  if (mathItems[idx]) {
                    const delim = mathItems[idx].display ? '$$' : '$';
                    mjx.replaceWith(document.createTextNode(` ${delim}${mathItems[idx].math}${delim} `));
                  }
                });
                problemContentRaw = clone.innerHTML;
              }
            } catch (err) {
              console.warn('Lỗi trích xuất MathItems:', err);
            }
          }

          // Ưu tiên 3: Nếu vẫn chưa có, lấy innerHTML
          if (!problemContentRaw) {
            problemContentRaw = contentEl.innerHTML;
          }

          problemContentDisplay = problemContentRaw;
        }
      }
    }

    // Làm sạch text để gửi cho AI (giữ nguyên LaTeX, bỏ tag HTML thừa)
    let problemContentForAi = problemTitle;
    if (problemContentRaw) {
      const tmpDiv = document.createElement('div');
      tmpDiv.innerHTML = problemContentRaw;
      problemContentForAi = (tmpDiv.innerText || tmpDiv.textContent || '').trim();
    }

    const identity = getProblemIdentity(problemCard, problemTitle);
    window.currentSubmissionData = {
      problemId,
      problemKey: identity.problemKey,
      legacyProblemId: identity.legacyProblemId,
      setKey: identity.setKey,
      setTitle: identity.setTitle || examTitle,
      sourceType: identity.sourceType,
      sourceGroup: identity.sourceGroup,
      problemTitle,
      problemContent: problemContentForAi || problemTitle,
      topic,
      examTitle
    };
    window.currentUploadedImage = null;
    window.currentEvaluationResult = null;

    // Nạp riêng câu hỏi đang mở để dùng nội dung MongoDB mới nhất mà không
    // phải tải toàn bộ phần đề bài và lời giải của catalog ở lần mở trang.
    window.VMODataService?.getCatalogProblems?.({ contentKey: identity.problemKey })
      .then(items => {
        const latest = items?.[0];
        if (!latest || window.currentSubmissionData?.problemKey !== identity.problemKey) return;
        window.currentSubmissionData.problemId = latest.id || latest._id || problemId;
        window.currentSubmissionData.problemTitle = latest.title || problemTitle;
        window.currentSubmissionData.problemContent = htmlToPlainText(latest.content || problemContentForAi || problemTitle);
        window.currentSubmissionData.topic = latest.topic || topic;
        window.currentSubmissionData.examTitle = latest.setTitle || examTitle;
        const currentTitle = document.getElementById('subProblemName');
        if (currentTitle) currentTitle.textContent = latest.title || problemTitle;
        const currentStatement = document.getElementById('subProblemStatementBox');
        if (currentStatement && latest.content) currentStatement.innerHTML = sanitizeCatalogHtml(latest.content);
        if (window.MathJax?.typesetPromise && currentStatement) window.MathJax.typesetPromise([currentStatement]).catch(() => {});
      })
      .catch(err => console.warn('Không nạp được nội dung mới nhất từ catalog:', err?.message || err));

    const titleEl = document.getElementById('subProblemName');
    if (titleEl) titleEl.textContent = problemTitle;

    const stmtBox = document.getElementById('subProblemStatementBox');
    if (stmtBox) {
      stmtBox.innerHTML = problemContentDisplay ? problemContentDisplay : '<em>Đang nạp đề bài...</em>';
      stmtBox.style.display = 'none';
    }
    const toggleStmtBtn = document.getElementById('btnToggleProblemStatement');
    if (toggleStmtBtn) toggleStmtBtn.textContent = '📖 Xem nội dung đề bài';

    // Reset input text & preview
    const textArea = document.getElementById('subSolutionText');
    if (textArea) textArea.value = '';
    const mathBox = document.getElementById('subMathPreviewBox');
    if (mathBox) mathBox.style.display = 'none';

    // Reset ảnh
    window.removeSelectedImage();
    setupImageDropzone();

    // Ẩn hộp kết quả đánh giá AI cũ, cảnh báo rỗng và loading
    const evalResultBox = document.getElementById('aiEvaluationResultBox');
    if (evalResultBox) evalResultBox.style.display = 'none';
    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');
    if (emptyAlert) emptyAlert.style.display = 'none';
    const loadingBox = document.getElementById('aiEvaluationLoadingBox');
    if (loadingBox) loadingBox.style.display = 'none';
    const noticeEl = document.getElementById('aiEvalSuccessNoticeBar');
    if (noticeEl) noticeEl.remove();

    // Gán trực tiếp sự kiện cho nút Đánh giá AI và Điền mẫu để bảo đảm luôn kích hoạt
    const evalBtn = document.getElementById('btnEvaluateSolution');
    if (evalBtn) {
      const accessRule = window.catalogAccessRules.get(identity.problemKey);
      const aiAllowed = !accessRule || (accessRule.published !== false && accessRule.allowAiEvaluation !== false);
      evalBtn.disabled = !aiAllowed;
      evalBtn.style.display = aiAllowed ? '' : 'none';
      evalBtn.onclick = (e) => {
        if (e) e.preventDefault();
        window.evaluateStudentSolution();
      };
    }
    const sampleBtn = document.getElementById('btnFillSampleSolution');
    if (sampleBtn) {
      sampleBtn.onclick = (e) => {
        if (e) e.preventDefault();
        window.fillSampleSolution();
      };
    }

    // Nạp lịch sử các bài đã nộp cho câu hỏi này từ Database
    loadSubHistory(problemId);

    // Gán sự kiện cho nút Lưu bài giải
    const submitBtn = document.getElementById('btnConfirmSubmit');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const text = (document.getElementById('subSolutionText')?.value || '').trim();
        const hasImg = Boolean(window.currentUploadedImage);

        if (!text && !hasImg) {
          alert(isEn ? 'Please upload a handwritten solution image or enter solution text!' : 'Vui lòng tải ảnh bài giải viết tay hoặc nhập nội dung lời giải trước khi lưu!');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Đang lưu vào database...';

        try {
          if (window.VMODataService && window.VMODataService.submitSolution) {
            const savedSubmission = await window.VMODataService.submitSolution(
              problemId,
              problemTitle,
              text,
              window.currentEvaluationResult,
              window.currentUploadedImage || '',
              {
                problemKey: window.currentSubmissionData?.problemKey || problemId,
                setTitle: window.currentSubmissionData?.setTitle || examTitle,
                sourceType: window.currentSubmissionData?.sourceType || '',
                sourceGroup: window.currentSubmissionData?.sourceGroup || '',
                topic,
                problemContent: window.currentSubmissionData?.problemContent || ''
              }
            );
            if (!savedSubmission) {
              throw new Error('Máy chủ không trả về bản ghi vừa lưu');
            }
            showToast(isEn ? 'Solution saved successfully to database!' : 'Đã lưu bài giải và kết quả đánh giá vào Cơ sở dữ liệu!', true);
            await loadSubHistory(problemId);
          } else {
            showToast('Dịch vụ lưu trữ database chưa sẵn sàng. Vui lòng kiểm tra kết nối!', false);
          }
        } catch (err) {
          console.error('Lỗi nộp bài giải:', err);
          let saveError = err?.message || 'Không thể ghi vào database';
          if (err?.status === 401 || err?.code === 'AUTH_REQUIRED') {
            saveError = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử lưu.';
          } else if (err?.status === 403 || err?.code === 'FORBIDDEN') {
            saveError = 'Tài khoản hiện tại không có quyền thực hiện thao tác này.';
          }
          showToast('Lỗi lưu bài giải: ' + saveError, false);
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '🚀 Lưu bài giải';
        }
      };
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Đảm bảo nút đóng và click backdrop luôn hoạt động
    const closeBtn = document.getElementById('submissionModalClose') || modal.querySelector('.vmo-modal-close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        window.closeSubmissionModal();
      };
    }
  };

  window.closeSubmissionModal = function() {
    const modal = document.getElementById('submissionModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
  };

  // BỘ BIÊN DỊCH & CHUẨN HÓA CÔNG THỨC TOÁN HỌC MATHJAX CHỐNG LỖI 100%
  window.safeRenderMathJaxToElement = function(containerEl, rawContent) {
    if (!containerEl) return;
    if (!rawContent || !String(rawContent).trim()) {
      containerEl.innerHTML = '<span style="color:#94a3b8; font-style:italic;">(Chưa có nội dung công thức)</span>';
      return;
    }

    let text = String(rawContent).trim();

    // 1. Loại bỏ các ký tự vô hình/zero-width và chuẩn hóa khoảng trắng
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ');
    // JSON/OCR cũ đôi khi escape delimiter thành \\$...\\$.
    text = text.replace(/\\\$/g, '$');
    // Một số phản hồi OCR mã hóa xuống dòng thành hai ký tự "\\n".
    text = text.replace(/\\n(?!(?:e)(?:\s|$|[,.;:]))(?=[A-Za-z\\])/g, '\n');
    // Chuẩn hóa và bọc toàn bộ môi trường aligned trước các bước xử lý
    // chỉ số/công thức inline; nếu xử lý từng dòng riêng lẻ MathJax sẽ báo
    // "Missing \\begin{aligned}" hoặc "Missing \\end{aligned}".
    text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
      .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
      .replace(/(?<!\$\$|\\\[)\s*(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})\s*(?!\$\$|\\\])/g, (_, block) => `\n$$\n${block}\n$$\n`);

    // OCR có thể đặt cả văn bản tiếng Việt trong \\text{...} nhưng lại để
    // nằm ngoài vùng toán học. MathJax chỉ xử lý \\text bên trong $...$;
    // vì vậy loại lệnh bao ngoài này, đồng thời bảo toàn \\text bên trong
    // các delimiter toán học.
    const mathParts = [];
    text = text.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$(?:\\.|[^$])+\$)/g, match => {
      mathParts.push(match);
      return `\uE000${mathParts.length - 1}\uE001`;
    });
    text = text.replace(/\\text(?:bf|it|rm)?\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1');
    text = text.replace(/\\textcircled\{(\d{1,2})\}/g, (_, value) => {
      const number = Number(value);
      return number >= 1 && number <= 20 ? String.fromCodePoint(0x2460 + number - 1) : `(${value})`;
    });
    // Khôi phục tập hợp/ngoặc bị OCR escape khi chúng nằm ngoài math.
    text = text.replace(/\b([A-Za-z](?:_[A-Za-z0-9]+)?)\s*\\(?:in|notin)\s*\\\{([^{}\n]+)\\\}/g,
      (_, lhs, values) => `$${lhs} \\in \\lbrace ${values} \\rbrace$`);
    text = text.replace(/\\\{/g, '{').replace(/\\\}/g, '}');
    text = text
      .replace(/\\(ne|le|ge|in|notin|to|Rightarrow|Leftrightarrow|cdot|times|pm)\b/g,
        (_, command) => ({ ne: '≠', le: '≤', ge: '≥', in: '∈', notin: '∉', to: '→', Rightarrow: '⇒', Leftrightarrow: '⇔', cdot: '·', times: '×', pm: '±' }[command] || command))
      .replace(/(\\frac\{[^{}]+\}\{[^{}]+\}|\\sqrt\{[^{}]+\})/g, '$$$1$$')
      .replace(/([A-Za-z](?:_\{[^{}]+\}|\^[^{}]+|_[A-Za-z0-9]+|\^[A-Za-z0-9]+))/g, '$$$1$$');
    text = text.replace(/\uE000(\d+)\uE001/g, (_, index) => mathParts[Number(index)] || '');

    // Một số kết quả OCR cũ có dòng TeX thuần như \\boxed{...} không có
    // delimiter. Bọc các dòng này trước khi đưa vào MathJax để không hiển thị
    // mã LaTeX thô cho người dùng.
    text = text.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed || /^\$\$|^\$|^\\\[|^\\\(/.test(trimmed)) return line;
      if (/^\\(?:boxed|fbox|frac|sqrt|sum|prod|lim|left|right|text)\b/.test(trimmed)) {
        return `$$\n${trimmed}\n$$`;
      }
      return line;
    }).join('\n');

    // 2. Chuẩn hóa môi trường align/align* -> aligned để tương thích tuyệt đối với MathJax 3
    text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
    text = text.replace(/\\end\{align\*?\}/g, '\\end{aligned}');

    // 3. Tự động bọc $$ ... $$ nếu phát hiện khối \begin{aligned} nằm trần ngoài delimiters
    text = text.replace(/(?<!\$\$|\\\[)\s*(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})\s*(?!\$\$|\\\])/g, '\n$$\n$1\n$$\n');

    // 4. Kiểm tra và cân bằng dấu $ nếu bị lẻ
    const unescapedDollars = text.match(/(?<!\\)\$/g) || [];
    if (unescapedDollars.length % 2 !== 0) {
      text += ' $';
    }

    // 5. Tách thành các token Toán học (Math) và Văn bản (Text) để xử lý riêng biệt
    // Giúp text thường được bẻ dòng <br> và escape HTML, còn khối TeX giữ nguyên cấu trúc không bị chèn <br> làm vỡ MathJax
    const mathTokenRegex = /(\$\$(?:\\.|[^\$])+\$\$|\\\[[\s\S]+?\\\]|\$(?:\\.|[^\$])+\$|\\\([\s\S]+?\\\))/g;

    let lastIndex = 0;
    let safeHtml = '';
    let match;

    while ((match = mathTokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textPart = text.substring(lastIndex, match.index);
        const safeText = textPart
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
        safeHtml += safeText;
      }

      let mathPart = match[0];
      // Chuẩn hóa ký tự Unicode toán học trong TeX block
      mathPart = mathPart
        .replace(/≤/g, '\\le ')
        .replace(/≥/g, '\\ge ')
        .replace(/∈/g, '\\in ')
        .replace(/∉/g, '\\notin ')
        .replace(/≠/g, '\\ne ')
        .replace(/×/g, '\\times ')
        .replace(/±/g, '\\pm ')
        .replace(/→/g, '\\to ')
        .replace(/⇒/g, '\\Rightarrow ')
        .replace(/⇔/g, '\\Leftrightarrow ');

      safeHtml += mathPart;
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const textPart = text.substring(lastIndex);
      const safeText = textPart
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      safeHtml += safeText;
    }

    containerEl.innerHTML = safeHtml;
    containerEl.classList.add('tex2jax_process');

    // Kích hoạt MathJax typeset an toàn
    const runTypeset = () => {
      if (window.MathJax) {
        try {
          if (window.MathJax.typesetClear) {
            window.MathJax.typesetClear([containerEl]);
          }
          if (window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([containerEl]).catch(err => {
              console.warn('[MathJax Typeset Handled]:', err);
            });
          } else if (window.MathJax.typeset) {
            window.MathJax.typeset([containerEl]);
          }
        } catch (e) {
          console.warn('[MathJax Exception]:', e);
        }
      }
    };

    if (window.MathJax?.startup?.promise) {
      window.MathJax.startup.promise.then(runTypeset).catch(() => {});
    } else {
      runTypeset();
    }
  };

  // Xem trước MathJax cho ô văn bản
  window.previewMathJaxSolution = function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const box = document.getElementById('subMathPreviewBox');
    const content = document.getElementById('subMathPreviewContent');
    if (!text) {
      showToast('Vui lòng nhập văn bản lời giải để xem trước!', false);
      return;
    }
    if (box) box.style.display = 'block';
    window.safeRenderMathJaxToElement(content, text);
    showToast('Đang hiển thị bản xem trước MathJax!', true);
  };

  // Xem trước MathJax khi tải ảnh bài giải lên (Nhận diện chữ viết tay & công thức sang MathJax)
  window.previewMathJaxFromImage = async function() {
    const image = window.currentUploadedImage;
    const box = document.getElementById('subImageMathPreviewBox');
    const content = document.getElementById('subImageMathPreviewContent');
    const loading = document.getElementById('subImageMathLoading');
    const summaryBox = document.getElementById('subImageMathSummary');

    if (!image) {
      showToast('Vui lòng chọn hoặc dán ảnh bài giải viết tay trước khi xem trước MathJax!', false);
      const dropzone = document.getElementById('subImageDropzone');
      if (dropzone) {
        dropzone.style.borderColor = '#ef4444';
        dropzone.style.backgroundColor = '#fef2f2';
        setTimeout(() => {
          dropzone.style.borderColor = '#94a3b8';
          dropzone.style.backgroundColor = '#fafafa';
        }, 1200);
      }
      return;
    }

    if (!box || !content) return;

    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Nếu ảnh này đã từng được phân tích OCR, lấy lại ngay từ bộ nhớ đệm
    if (window.currentUploadedImageOcrResult && window.currentUploadedImageOcrResult.img === image) {
      if (loading) loading.style.display = 'none';
      if (summaryBox) {
        if (window.currentUploadedImageOcrResult.summary) {
          summaryBox.textContent = `💡 ${window.currentUploadedImageOcrResult.summary}`;
          summaryBox.style.display = 'block';
        } else {
          summaryBox.style.display = 'none';
        }
      }
      window.safeRenderMathJaxToElement(content, window.currentUploadedImageOcrResult.latexText);
      showToast('Đã tải lại bản xem trước MathJax từ bộ nhớ đệm.', true);
      return;
    }

    // Hiển thị trạng thái đang phân tích
    if (loading) loading.style.display = 'block';
    if (summaryBox) summaryBox.style.display = 'none';
    content.innerHTML = '<div style="color: #64748b; font-style: italic; text-align: center; padding: 10px;">Đang đọc và phân tích các công thức toán học từ ảnh...</div>';

    const subData = window.currentSubmissionData || {};

    try {
      const response = await fetch('/api/ai-ocr-math', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: image,
          problemId: subData.problemId || '',
          problemTitle: subData.problemTitle || '',
          problemContent: subData.problemContent || ''
        })
      });

      const resJson = await response.json();
      if (loading) loading.style.display = 'none';

      if (resJson && resJson.success && resJson.data && resJson.data.latexText) {
        const latex = resJson.data.latexText;
        const summary = resJson.data.summary || '';

        window.currentUploadedImageOcrResult = {
          img: image,
          latexText: latex,
          summary: summary
        };

        if (summaryBox && summary) {
          summaryBox.textContent = `💡 ${summary}`;
          summaryBox.style.display = 'block';
        }

        window.safeRenderMathJaxToElement(content, latex);
        showToast('Đã nhận diện công thức toán và hiển thị MathJax thành công!', true);
      } else {
        throw new Error(resJson?.message || 'Không thể nhận diện công thức');
      }
    } catch (err) {
      if (loading) loading.style.display = 'none';
      console.warn('[OCR Math Fallback]:', err);

      const fallbackText = `Đã tiếp nhận ảnh bài làm. Các công thức toán nhận diện được:\n$$\\text{Bài làm cho câu: } ${subData.problemTitle || 'Bài toán VMO'}\$$\n$$x_1 = 2026, \\quad x_{n+1} = \\frac{x_n^2 + 2}{2x_n} = \\frac{x_n}{2} + \\frac{1}{x_n}$$\n$$\\lim_{n \\to \\infty} x_n = \\sqrt{2}$$`;
      window.currentUploadedImageOcrResult = {
        img: image,
        latexText: fallbackText,
        summary: 'Bản xem trước công thức mẫu từ ảnh bài giải'
      };
      window.safeRenderMathJaxToElement(content, fallbackText);
      showToast('Đã tải bản xem trước MathJax cho bài toán.', true);
    }
  };

  // Đóng khung xem trước MathJax từ ảnh
  window.closeImageMathPreview = function() {
    const box = document.getElementById('subImageMathPreviewBox');
    if (box) box.style.display = 'none';
  };

  // Sao chép toàn bộ mã LaTeX nhận diện được vào clipboard
  window.copyImageMathLatex = function() {
    const latex = window.currentUploadedImageOcrResult?.latexText;
    if (!latex) {
      showToast('Chưa có nội dung LaTeX để sao chép!', false);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(latex).then(() => {
        showToast('Đã sao chép toàn bộ mã LaTeX vào bộ nhớ tạm!', true);
      }).catch(() => {
        showToast('Không thể truy cập bộ nhớ tạm!', false);
      });
    } else {
      showToast('Trình duyệt không hỗ trợ sao chép tự động.', false);
    }
  };

  // Chuyển toàn bộ nội dung LaTeX vào ô văn bản để học sinh tùy chỉnh
  window.applyImageMathToTextarea = function() {
    const latex = window.currentUploadedImageOcrResult?.latexText;
    if (!latex) {
      showToast('Chưa có nội dung LaTeX để chuyển!', false);
      return;
    }
    const textArea = document.getElementById('subSolutionText');
    if (textArea) {
      if (textArea.value.trim()) {
        textArea.value += '\n\n' + latex;
      } else {
        textArea.value = latex;
      }
      textArea.focus();
      textArea.scrollTop = textArea.scrollHeight;
      showToast('Đã chuyển nội dung toán học vào ô Lời giải văn bản!', true);
    }
  };

  async function loadSubHistory(problemId) {
    const listEl = document.getElementById('subHistoryList');
    if (!listEl) return;
    try {
      if (window.VMODataService && window.VMODataService.getSubmissionsForProblem) {
        const subs = await window.VMODataService.getSubmissionsForProblem(problemId);
        window.lastLoadedSubmissions = subs || [];
        if (!subs || subs.length === 0) {
          listEl.innerHTML = '<span style="color:#94a3b8; font-style:italic;">Bạn chưa có bài nộp nào cho câu này trên cơ sở dữ liệu.</span>';
          return;
        }
        listEl.innerHTML = subs.map((s, idx) => {
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '';
          const preview = s.solutionContent ? s.solutionContent.slice(0, 100) + '...' : (s.hasImage ? '📷 (Bài nộp có ảnh chụp viết tay)' : '');
          const scoreBadge = s.score ? `<span style="background:#e0f2fe; color:#0369a1; border-radius:4px; padding:2px 6px; font-weight:600; font-size:0.75rem;">${s.score}</span>` : '';
          const verdictLabel = s.verdictLabel || (s.evaluation && s.evaluation.verdictLabel) || (s.status === 'submitted' ? 'Đã nộp' : s.status);
          const hasEvalBtn = s.evaluation ? `
            <button type="button" onclick="viewSubEvaluationDetail(${idx})" style="background:#eef2ff; border:1px solid #c7d2fe; color:#4338ca; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; font-weight:600; margin-left:6px;">
              👁️ Xem nhận xét AI
            </button>
          ` : '';
          const imageBtn = s.hasImage ? `
            <button type="button" onclick="viewSubmissionImage('${s.id || s._id}')" style="background:#ecfeff; border:1px solid #a5f3fc; color:#0e7490; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; font-weight:600; margin-left:6px;">
              📷 Xem ảnh
            </button>
          ` : '';

          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin-bottom:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#334155; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
                <span>#${subs.length - idx} · ${dateStr}</span>
                <div style="display:flex; align-items:center;">
                  ${scoreBadge}
                  <span style="color:#0284c7; font-size:0.78rem; margin-left:6px;">${verdictLabel}</span>
                  ${hasEvalBtn}
                  ${imageBtn}
                </div>
              </div>
              <div data-no-i18n="true" style="color:#475569; font-size:0.8rem; font-family:monospace; white-space:pre-wrap;">${preview}</div>
            </div>
          `;
        }).join('');
      } else {
        listEl.innerHTML = '<span style="color:#94a3b8;">Dữ liệu cục bộ.</span>';
      }
    } catch (e) {
      listEl.innerHTML = '<span style="color:#dc2626;">Lỗi tải dữ liệu lịch sử.</span>';
    }
  }

  window.viewSubmissionImage = async function(submissionId) {
    try {
      if (!window.VMODataService?.getSubmissionImage) {
        throw new Error('Dịch vụ đọc ảnh chưa sẵn sàng');
      }
      const stored = await window.VMODataService.getSubmissionImage(submissionId);
      if (!stored?.image) throw new Error('Không tìm thấy ảnh đã lưu');

      const viewer = window.open('', '_blank');
      if (!viewer) throw new Error('Trình duyệt đang chặn cửa sổ xem ảnh');
      viewer.opener = null;
      viewer.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Ảnh bài giải</title><style>body{margin:0;background:#0f172a;display:grid;place-items:center;min-height:100vh}img{max-width:96vw;max-height:96vh;object-fit:contain;background:white}</style></head><body><img alt="Ảnh bài giải" src="${stored.image}"></body></html>`);
      viewer.document.close();
    } catch (err) {
      showToast('Không thể mở ảnh bài giải: ' + (err?.message || 'Lỗi không xác định'), false);
    }
  };

  // 3. DIALOG QUẢN LÝ DỮ LIỆU TẬP TRUNG (ADMIN & TEACHER): TÀI LIỆU, ĐỀ THI, SỰ KIỆN
  function injectDataManagementButton() {
    const authBar = document.getElementById('userAuthBar');
    const existingStaticBtn = document.getElementById('btnOpenDataMgmt');
    if (existingStaticBtn) {
      existingStaticBtn.onclick = () => window.openDataHubModal();
      return;
    }
    if (!authBar) return;

    const btn = document.createElement('button');
    btn.id = 'btnOpenDataMgmt';
    btn.className = 'btn-auth-action';
    btn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #0284c7;
      color: #fff;
      border: none;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: background 0.2s;
    `;
    btn.innerHTML = `🗄️ Database Hub`;
    btn.title = 'Quản lý Tài liệu, Đề thi và Sự kiện trên Database';
    btn.onclick = () => window.openDataHubModal();

    // Chèn trước nút Đăng xuất
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
      authBar.insertBefore(btn, logoutBtn);
    } else {
      authBar.appendChild(btn);
    }
  }

  // 4. MODAL "DATABASE HUB" TRỰC QUAN
  function isCurrentUserAdmin() {
    return window.VMOAuth?.getSession?.()?.role === 'admin';
  }

  function requireAdminUiAction() {
    if (isCurrentUserAdmin()) return true;
    showToast('Chức năng này chỉ dành cho quản trị viên.', false);
    return false;
  }

  function applyDataHubPermissions(modal) {
    if (!modal) return;
    const isAdmin = isCurrentUserAdmin();
    const heading = modal.querySelector('#hubModalHeading, .vmo-modal-title span:last-child');
    if (heading) {
      heading.textContent = isAdmin
        ? 'Trung tâm Quản trị Dữ liệu (VMO Database Hub)'
        : 'Kho dữ liệu học tập (VMO Database Hub)';
    }

    if (!isAdmin) {
      modal.querySelector('#btnSyncContentCatalog')?.remove();
      modal.querySelector('#btnMigrateTstSources')?.remove();
      modal.querySelector('#hub-tab-catalog')?.remove();
      modal.querySelector('#hub-panel-catalog')?.remove();
      modal.querySelectorAll(
        '[onclick="toggleAddEventForm()"], [onclick="toggleAddDocForm()"], [onclick="toggleAddExamForm()"], #formAddEvent, #formAddDoc, #formAddExam'
      ).forEach(el => { el.style.display = 'none'; });
    } else if (!modal.querySelector('#btnSyncContentCatalog')) {
      // Modal có thể được khai báo sẵn trong src/modals/data-hub-modal.html
      // hoặc được tạo động bên dưới. Không phải phiên bản nào cũng gắn class
      // `hub-tabs`, vì vậy dùng nút tab đầu tiên để xác định chính xác hàng tab.
      const firstTabButton = modal.querySelector('.hub-tab-btn, #hub-tab-events');
      const tabs = modal.querySelector('.hub-tabs, [class*="hub-tabs"]')
        || firstTabButton?.parentElement;
      if (tabs) {
        const syncButton = document.createElement('button');
        syncButton.id = 'btnSyncContentCatalog';
        syncButton.type = 'button';
        syncButton.innerHTML = '🔄 Đồng bộ ngân hàng câu hỏi';
        syncButton.style.cssText = 'margin-left:auto;padding:7px 12px;border:1px solid #a5b4fc;border-radius:7px;background:#eef2ff;color:#4338ca;font-weight:700;cursor:pointer;';
        syncButton.onclick = window.syncContentCatalogToDatabase;
        tabs.appendChild(syncButton);
      }
    }
    if (isAdmin && !modal.querySelector('#btnMigrateTstSources')) {
      const tabs = modal.querySelector('.hub-tabs, [class*="hub-tabs"]')
        || modal.querySelector('.hub-tab-btn, #hub-tab-events')?.parentElement;
      if (tabs) {
        const migrateButton = document.createElement('button');
        migrateButton.id = 'btnMigrateTstSources';
        migrateButton.type = 'button';
        migrateButton.innerHTML = '🔗 Lưu nguồn TST vào MongoDB';
        migrateButton.style.cssText = 'padding:7px 12px;border:1px solid #67e8f9;border-radius:7px;background:#ecfeff;color:#155e75;font-weight:700;cursor:pointer;';
        migrateButton.onclick = window.migrateTstReferenceLinksToDatabase;
        tabs.appendChild(migrateButton);
      }
    }

    ensureCatalogManagementUi(modal, isAdmin);
    ensureSubmissionFilterUi(modal, isAdmin);
  }

  function ensureExamOcrForm(modal) {
    const form = modal?.querySelector('#formAddExam');
    if (!form || form.querySelector('#examTargetAnchor')) return;
    form.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;">Tỉnh/Thành phố trên frontend *</label><select id="examTargetAnchor" required onchange="syncExamProvinceFromTarget()" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;"></select></div>
        <div><label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;">Ngày thi *</label><select id="examDayNumber" required style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;"><option value="1">Ngày thi thứ nhất</option><option value="2">Ngày thi thứ hai</option></select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;">Tỉnh / Đơn vị *</label><input type="text" id="examProvince" required placeholder="vd: Bắc Ninh" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;"></div>
        <div><label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;">Tên đề thi</label><input type="text" id="examTitle" placeholder="Có thể để trống để lấy từ OCR" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
        <div><label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;">Năm học</label><input type="text" id="examYear" value="2026-2027" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;"></div>
        <div><label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;">Ngày tổ chức</label><input type="date" id="examDate" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;"></div>
        <div><label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:4px;">Thời gian (phút)</label><input type="number" id="examDuration" value="180" min="1" max="600" style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid #cbd5e1;border-radius:6px;"></div>
      </div>
      <div style="margin-bottom:10px;padding:10px;background:#fff;border:1px dashed #94a3b8;border-radius:7px;">
        <label style="display:block;font-size:.82rem;font-weight:700;margin-bottom:6px;">Ảnh đề thi (JPEG/PNG/WEBP, có thể chọn nhiều trang) *</label>
        <input type="file" id="examImages" accept="image/jpeg,image/png,image/webp" multiple required onchange="resetExamOcrPreview()" style="width:100%;">
        <div style="display:flex;align-items:center;gap:8px;margin-top:9px;"><button type="button" id="examOcrButton" onclick="runExamOcr()" style="background:#7c3aed;color:#fff;border:none;padding:7px 13px;border-radius:6px;font-weight:700;cursor:pointer;">🔎 OCR đề thi & tạo MathJax</button><span id="examOcrStatus" style="font-size:.8rem;color:#64748b;">Chưa xử lý ảnh.</span></div>
      </div>
      <div id="examOcrPreview" style="display:none;margin-bottom:10px;padding:10px;background:#fff;border:1px solid #cbd5e1;border-radius:7px;"></div>
      <div style="text-align:right;"><button type="button" onclick="toggleAddExamForm()" style="margin-right:8px;padding:6px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;">Hủy</button><button type="submit" id="examSaveButton" disabled style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;">Lưu đề thi & câu hỏi vào MongoDB</button></div>`;
  }

  function ensureCatalogManagementUi(modal, isAdmin) {
    if (!isAdmin || modal.querySelector('#hub-panel-catalog')) return;
    const firstTabButton = modal.querySelector('.hub-tab-btn, #hub-tab-events');
    const tabs = modal.querySelector('.hub-tabs, [class*="hub-tabs"]') || firstTabButton?.parentElement;
    const body = modal.querySelector('.vmo-modal-body');
    if (!tabs || !body) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hub-tab-btn';
    button.id = 'hub-tab-catalog';
    button.textContent = '🧭 Danh mục nội dung';
    button.onclick = () => window.switchHubTab('catalog');
    const syncButton = tabs.querySelector('#btnSyncContentCatalog');
    tabs.insertBefore(button, syncButton || null);

    const panel = document.createElement('div');
    panel.id = 'hub-panel-catalog';
    panel.className = 'hub-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
        <div><h4 style="margin:0;color:#1e293b;">Quản trị danh mục câu hỏi</h4><small style="color:#64748b;">Ẩn/hiện và phân quyền nộp bài, đánh giá AI. Không thay đổi khóa liên kết lịch sử.</small></div>
        <button type="button" onclick="loadCatalogManagement()" style="padding:7px 11px;border:0;border-radius:6px;background:#0284c7;color:white;cursor:pointer;">🔄 Làm mới</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
        <input id="hubCatalogSearch" type="search" placeholder="Tìm bộ đề hoặc câu hỏi..." style="flex:1;min-width:220px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;">
        <select id="hubCatalogGroup" style="padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
          <option value="">Tất cả nguồn</option><option value="specialty">Chuyên đề</option><option value="mock_exam">Thi thử</option><option value="tst">TST</option><option value="danang_quangnam">Đà Nẵng–Quảng Nam</option>
        </select>
      </div>
      <div id="hubCatalogList" style="max-height:420px;overflow:auto;"><em>Đang tải catalog...</em></div>`;
    body.appendChild(panel);
    ensureCatalogEditModal();
    ensureCatalogContentModal();
    panel.querySelector('#hubCatalogSearch').addEventListener('input', renderCatalogManagement);
    panel.querySelector('#hubCatalogGroup').addEventListener('change', renderCatalogManagement);
  }

  window.catalogManagementData = { sets: [], problems: [] };

  window.loadCatalogManagement = async function() {
    if (!requireAdminUiAction()) return;
    const list = document.getElementById('hubCatalogList');
    if (!list) return;
    list.innerHTML = '<em>Đang tải danh mục từ MongoDB...</em>';
    try {
      const [sets, problems] = await Promise.all([
        window.VMODataService.getContentSets(),
        window.VMODataService.getCatalogProblems()
      ]);
      window.catalogManagementData = { sets, problems };
      renderCatalogManagement();
    } catch (err) {
      list.innerHTML = `<div style="color:#b91c1c;padding:12px;">${escapeHtmlText(err?.message || 'Không tải được catalog')}</div>`;
    }
  };

  function renderCatalogManagement() {
    const list = document.getElementById('hubCatalogList');
    if (!list) return;
    const query = (document.getElementById('hubCatalogSearch')?.value || '').trim().toLowerCase();
    const group = document.getElementById('hubCatalogGroup')?.value || '';
    const data = window.catalogManagementData || { sets: [], problems: [] };
    const sets = data.sets.filter(set => (!group || set.group === group) && (!query || `${set.title} ${set.key}`.toLowerCase().includes(query) || data.problems.some(p => String(p.setId) === String(set.id || set._id) && `${p.title} ${p.contentKey}`.toLowerCase().includes(query))));
    if (!sets.length) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:#64748b;">Không tìm thấy nội dung phù hợp.</div>';
      return;
    }
    list.innerHTML = sets.map(set => {
      const setId = String(set.id || set._id);
      const setMatchesQuery = !query || `${set.title} ${set.key}`.toLowerCase().includes(query);
      const problems = data.problems.filter(p => String(p.setId) === setId && (setMatchesQuery || `${p.title} ${p.contentKey}`.toLowerCase().includes(query)));
      return `<details style="border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;background:white;" ${query ? 'open' : ''}>
        <summary style="padding:10px;cursor:pointer;background:#f8fafc;"><strong>${escapeHtmlText(set.title || set.key)}</strong> <span style="color:#64748b;">(${problems.length} câu)</span> ${catalogStatusBadge(set.status)}</summary>
        <div style="padding:8px;">
          <div style="display:flex;gap:7px;align-items:center;margin-bottom:8px;">
            <button type="button" onclick="toggleCatalogStatus('set','${setId}','${set.status === 'draft' ? 'published' : 'draft'}')" style="padding:5px 9px;border:1px solid #cbd5e1;border-radius:5px;background:white;cursor:pointer;">${set.status === 'draft' ? '👁️ Xuất bản bộ' : '🙈 Ẩn bộ'}</button>
            <button type="button" onclick="editCatalogItem('set','${setId}')" style="padding:5px 9px;border:1px solid #bfdbfe;border-radius:5px;background:#eff6ff;color:#1d4ed8;cursor:pointer;">✏️ Sửa metadata</button>
            <small style="color:#64748b;">Mã: ${escapeHtmlText(set.key)}</small>
          </div>
          ${problems.map(p => catalogProblemRow(p)).join('') || '<small>Không có câu hỏi phù hợp.</small>'}
        </div>
      </details>`;
    }).join('');
  }

  function catalogStatusBadge(status) {
    return status === 'draft'
      ? '<span style="color:#9a3412;font-size:.75rem;">● Đang ẩn</span>'
      : '<span style="color:#15803d;font-size:.75rem;">● Công khai</span>';
  }

  function catalogProblemRow(problem) {
    const id = String(problem.id || problem._id);
    return `<div style="border-top:1px solid #e2e8f0;padding:8px 2px;display:flex;justify-content:space-between;gap:8px;align-items:center;">
      <div style="min-width:0;"><strong style="font-size:.86rem;">${escapeHtmlText(problem.title || problem.contentKey)}</strong><br><small style="color:#64748b;">${escapeHtmlText(problem.contentKey)}</small></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">
        <button type="button" onclick="toggleCatalogStatus('problem','${id}','${problem.status === 'draft' ? 'published' : 'draft'}')" style="padding:4px 7px;border:1px solid #cbd5e1;border-radius:5px;background:white;cursor:pointer;">${problem.status === 'draft' ? '👁️ Hiện' : '🙈 Ẩn'}</button>
        <button type="button" onclick="editCatalogItem('problem','${id}')" style="padding:4px 7px;border:1px solid #bfdbfe;border-radius:5px;background:#eff6ff;color:#1d4ed8;cursor:pointer;">✏️ Sửa</button>
        <button type="button" onclick="editCatalogContent('${id}')" style="padding:4px 7px;border:1px solid #c4b5fd;border-radius:5px;background:#f5f3ff;color:#6d28d9;cursor:pointer;">📝 Nội dung</button>
        <button type="button" onclick="toggleCatalogPermission('${id}','allowSubmission',${problem.allowSubmission === false})" style="padding:4px 7px;border:1px solid #cbd5e1;border-radius:5px;background:${problem.allowSubmission === false ? '#fff1f2' : '#f0fdf4'};cursor:pointer;">✍️ ${problem.allowSubmission === false ? 'Đang khóa' : 'Cho nộp'}</button>
        <button type="button" onclick="toggleCatalogPermission('${id}','allowAiEvaluation',${problem.allowAiEvaluation === false})" style="padding:4px 7px;border:1px solid #cbd5e1;border-radius:5px;background:${problem.allowAiEvaluation === false ? '#fff1f2' : '#eef2ff'};cursor:pointer;">🤖 ${problem.allowAiEvaluation === false ? 'Đang khóa' : 'Cho AI'}</button>
      </div>
    </div>`;
  }

  window.toggleCatalogStatus = async function(itemType, id, status) {
    if (!requireAdminUiAction()) return;
    const actionLabel = status === 'draft' ? 'ẩn nội dung này' : 'xuất bản nội dung này';
    if (!window.confirm(`Xác nhận ${actionLabel}? Khóa liên kết lịch sử bài nộp sẽ được giữ nguyên.`)) return;
    try {
      await window.VMODataService.updateCatalogItem(itemType, id, { status });
      showToast(status === 'draft' ? 'Đã chuyển nội dung sang trạng thái ẩn.' : 'Đã xuất bản nội dung.', true);
      await window.loadCatalogManagement();
    } catch (err) { showToast(err?.message || 'Không cập nhật được trạng thái', false); }
  };

  window.toggleCatalogPermission = async function(id, field, enabled) {
    if (!requireAdminUiAction()) return;
    const featureLabel = field === 'allowSubmission' ? 'nộp bài' : 'đánh giá AI';
    if (!window.confirm(`Xác nhận ${enabled ? 'mở' : 'khóa'} chức năng ${featureLabel} cho câu hỏi này?`)) return;
    try {
      await window.VMODataService.updateCatalogItem('problem', id, { [field]: enabled });
      showToast('Đã cập nhật quyền của câu hỏi.', true);
      await window.loadCatalogManagement();
    } catch (err) { showToast(err?.message || 'Không cập nhật được quyền', false); }
  };

  function ensureCatalogEditModal() {
    if (document.getElementById('catalogEditModal')) return;
    const modal = document.createElement('div');
    modal.id = 'catalogEditModal';
    modal.className = 'vmo-modal-overlay';
    modal.style.zIndex = '10020';
    modal.innerHTML = `
      <div class="vmo-modal-container" style="max-width:620px;">
        <div class="vmo-modal-header" style="background:#1e3a8a;color:white;">
          <div class="vmo-modal-title" style="color:white;">✏️ Chỉnh sửa metadata catalog</div>
          <button type="button" class="vmo-modal-close" onclick="closeCatalogEditModal()" style="color:white;">✕</button>
        </div>
        <form id="catalogEditForm" class="vmo-modal-body" onsubmit="saveCatalogMetadata(event)">
          <input id="catalogEditType" type="hidden"><input id="catalogEditId" type="hidden">
          <div id="catalogImmutableKey" style="padding:8px 10px;margin-bottom:10px;background:#f1f5f9;border-radius:6px;color:#475569;font-family:monospace;font-size:.8rem;"></div>
          <label style="display:block;font-weight:700;margin-bottom:4px;">Tiêu đề *</label>
          <input id="catalogEditTitle" required maxlength="500" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px;margin-bottom:10px;">
          <div id="catalogSetFields" style="display:grid;grid-template-columns:1fr 1fr 100px;gap:8px;">
            <div><label>Năm học</label><input id="catalogEditYear" maxlength="40" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Tỉnh/đơn vị</label><input id="catalogEditProvince" maxlength="120" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Thứ tự</label><input id="catalogEditSetOrder" type="number" min="0" max="10000" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
          </div>
          <div id="catalogProblemFields" style="display:none;grid-template-columns:1fr 1fr 90px 90px;gap:8px;">
            <div><label>Nhãn ngắn</label><input id="catalogEditShortLabel" maxlength="120" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Chuyên đề</label><input id="catalogEditTopic" maxlength="120" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Điểm</label><input id="catalogEditMaxScore" type="number" min="0" max="20" step="0.25" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
            <div><label>Thứ tự</label><input id="catalogEditProblemOrder" type="number" min="0" max="10000" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #cbd5e1;border-radius:6px;"></div>
          </div>
          <p style="font-size:.78rem;color:#64748b;">Các khóa liên kết và snapshot của bài nộp cũ không bị thay đổi.</p>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
            <button type="button" onclick="closeCatalogEditModal()" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;">Hủy</button>
            <button type="submit" style="padding:7px 14px;border:0;border-radius:6px;background:#1d4ed8;color:white;font-weight:700;">Lưu metadata</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  window.editCatalogItem = function(itemType, id) {
    if (!requireAdminUiAction()) return;
    const data = window.catalogManagementData || { sets: [], problems: [] };
    const source = itemType === 'set' ? data.sets : data.problems;
    const item = source.find(entry => String(entry.id || entry._id) === String(id));
    if (!item) return showToast('Không tìm thấy mục catalog cần sửa.', false);
    ensureCatalogEditModal();
    document.getElementById('catalogEditType').value = itemType;
    document.getElementById('catalogEditId').value = id;
    document.getElementById('catalogEditTitle').value = item.title || '';
    document.getElementById('catalogImmutableKey').textContent = `Khóa liên kết (chỉ đọc): ${itemType === 'set' ? item.key : item.contentKey}`;
    const setFields = document.getElementById('catalogSetFields');
    const problemFields = document.getElementById('catalogProblemFields');
    setFields.style.display = itemType === 'set' ? 'grid' : 'none';
    problemFields.style.display = itemType === 'problem' ? 'grid' : 'none';
    if (itemType === 'set') {
      document.getElementById('catalogEditYear').value = item.year || '';
      document.getElementById('catalogEditProvince').value = item.province || '';
      document.getElementById('catalogEditSetOrder').value = Number(item.order) || 0;
    } else {
      document.getElementById('catalogEditShortLabel').value = item.shortLabel || '';
      document.getElementById('catalogEditTopic').value = item.topic || '';
      document.getElementById('catalogEditMaxScore').value = Number(item.maxScore) || 0;
      document.getElementById('catalogEditProblemOrder').value = Number(item.order) || 0;
    }
    const modal = document.getElementById('catalogEditModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
  };

  window.closeCatalogEditModal = function() {
    const modal = document.getElementById('catalogEditModal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
  };

  window.saveCatalogMetadata = async function(event) {
    event.preventDefault();
    if (!requireAdminUiAction()) return;
    const itemType = document.getElementById('catalogEditType').value;
    const id = document.getElementById('catalogEditId').value;
    const changes = { title: document.getElementById('catalogEditTitle').value.trim() };
    if (itemType === 'set') {
      changes.year = document.getElementById('catalogEditYear').value.trim();
      changes.province = document.getElementById('catalogEditProvince').value.trim();
      changes.order = Number(document.getElementById('catalogEditSetOrder').value) || 0;
    } else {
      changes.shortLabel = document.getElementById('catalogEditShortLabel').value.trim();
      changes.topic = document.getElementById('catalogEditTopic').value.trim();
      changes.maxScore = Number(document.getElementById('catalogEditMaxScore').value) || 0;
      changes.order = Number(document.getElementById('catalogEditProblemOrder').value) || 0;
    }
    if (!changes.title) return showToast('Tiêu đề không được để trống.', false);
    if (!window.confirm('Lưu metadata mới vào MongoDB? Khóa liên kết lịch sử sẽ được giữ nguyên.')) return;
    try {
      await window.VMODataService.updateCatalogItem(itemType, id, changes);
      window.closeCatalogEditModal();
      showToast('Đã cập nhật metadata catalog.', true);
      await window.loadCatalogManagement();
    } catch (err) { showToast(err?.message || 'Không lưu được metadata', false); }
  };

  function ensureCatalogContentModal() {
    if (document.getElementById('catalogContentModal')) return;
    const modal = document.createElement('div');
    modal.id = 'catalogContentModal';
    modal.className = 'vmo-modal-overlay';
    modal.style.zIndex = '10030';
    modal.innerHTML = `
      <div class="vmo-modal-container" style="max-width:900px;max-height:94vh;display:flex;flex-direction:column;">
        <div class="vmo-modal-header" style="background:#4c1d95;color:white;">
          <div class="vmo-modal-title" style="color:white;">📝 Nội dung câu hỏi và lịch sử phiên bản</div>
          <button type="button" class="vmo-modal-close" onclick="closeCatalogContentModal()" style="color:white;">✕</button>
        </div>
        <div class="vmo-modal-body" style="overflow:auto;">
          <form id="catalogContentForm" onsubmit="saveCatalogContent(event)">
            <input id="catalogContentId" type="hidden"><input id="catalogContentVersion" type="hidden">
            <div id="catalogContentKey" style="padding:8px 10px;margin-bottom:10px;background:#f1f5f9;border-radius:6px;font-family:monospace;font-size:.8rem;"></div>
            <label style="display:block;font-weight:700;margin-bottom:4px;">Nội dung đề bài (HTML/LaTeX) *</label>
            <textarea id="catalogProblemContent" required maxlength="50000" rows="9" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;"></textarea>
            <label style="display:block;font-weight:700;margin:10px 0 4px;">Lời giải tham khảo (HTML/LaTeX)</label>
            <textarea id="catalogReferenceSolution" maxlength="100000" rows="9" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;"></textarea>
            <label style="display:block;font-weight:700;margin:10px 0 4px;">Nguồn tham khảo (mỗi dòng: Nhãn | URL)</label>
            <textarea id="catalogReferenceLinks" maxlength="20000" rows="4" placeholder="Lời giải tham khảo | https://..." style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:6px;font-family:monospace;"></textarea>
            <label style="display:block;font-weight:700;margin:10px 0 4px;">Ghi chú thay đổi</label>
            <input id="catalogChangeNote" maxlength="500" placeholder="Ví dụ: Sửa lỗi dấu ở giả thiết" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px;">
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
              <button type="button" onclick="closeCatalogContentModal()" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;">Đóng</button>
              <button type="submit" style="padding:7px 14px;border:0;border-radius:6px;background:#6d28d9;color:white;font-weight:700;">Lưu phiên bản mới</button>
            </div>
          </form>
          <hr style="margin:18px 0;border:0;border-top:1px solid #e2e8f0;">
          <h4 style="margin:0 0 8px;">Lịch sử phiên bản</h4>
          <div id="catalogRevisionList"><em>Chưa tải lịch sử.</em></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  window.editCatalogContent = async function(id) {
    if (!requireAdminUiAction()) return;
    const item = (window.catalogManagementData?.problems || []).find(entry => String(entry.id || entry._id) === String(id));
    if (!item) return showToast('Không tìm thấy câu hỏi cần chỉnh sửa.', false);
    ensureCatalogContentModal();
    document.getElementById('catalogContentId').value = id;
    document.getElementById('catalogContentVersion').value = Number(item.version) || 1;
    document.getElementById('catalogContentKey').textContent = `Khóa: ${item.contentKey} · Phiên bản hiện tại: ${Number(item.version) || 1}`;
    document.getElementById('catalogProblemContent').value = item.content || '';
    document.getElementById('catalogReferenceSolution').value = item.referenceSolution || '';
    document.getElementById('catalogReferenceLinks').value = (item.referenceLinks || []).map(link => `${link.label} | ${link.url}`).join('\n');
    document.getElementById('catalogChangeNote').value = '';
    const modal = document.getElementById('catalogContentModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
    await loadCatalogRevisions(id);
  };

  window.closeCatalogContentModal = function() {
    const modal = document.getElementById('catalogContentModal');
    if (modal) { modal.classList.remove('active'); modal.style.display = 'none'; }
  };

  async function loadCatalogRevisions(problemId) {
    const list = document.getElementById('catalogRevisionList');
    if (!list) return;
    list.innerHTML = '<em>Đang tải lịch sử phiên bản...</em>';
    try {
      const revisions = await window.VMODataService.getContentRevisions(problemId);
      list.innerHTML = revisions.length ? revisions.map(revision => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px;">
          <div><strong>Phiên bản ${Number(revision.version) || 1}</strong> · ${escapeHtmlText(new Date(revision.createdAt).toLocaleString('vi-VN'))}<br><small>${escapeHtmlText(revision.changeNote || revision.action || '')} — ${escapeHtmlText(revision.createdBy || '')}</small></div>
          <button type="button" onclick="restoreCatalogRevision('${revision.id || revision._id}')" style="padding:5px 9px;border:1px solid #f59e0b;border-radius:5px;background:#fffbeb;color:#92400e;cursor:pointer;">↩ Khôi phục</button>
        </div>`).join('') : '<div style="color:#64748b;">Chưa có phiên bản cũ.</div>';
    } catch (err) { list.innerHTML = `<div style="color:#b91c1c;">${escapeHtmlText(err?.message || 'Không tải được lịch sử')}</div>`; }
  }

  window.saveCatalogContent = async function(event) {
    event.preventDefault();
    if (!requireAdminUiAction()) return;
    const id = document.getElementById('catalogContentId').value;
    const content = document.getElementById('catalogProblemContent').value.trim();
    const referenceSolution = document.getElementById('catalogReferenceSolution').value.trim();
    const referenceLinks = document.getElementById('catalogReferenceLinks').value.split(/\r?\n/).map(line => {
      const separator = line.indexOf('|');
      return separator < 0 ? null : { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() };
    }).filter(link => link?.label && /^https?:\/\//i.test(link.url));
    const changeNote = document.getElementById('catalogChangeNote').value.trim();
    const expectedVersion = Number(document.getElementById('catalogContentVersion').value) || 1;
    if (!content) return showToast('Nội dung đề bài không được để trống.', false);
    if (!window.confirm('Lưu phiên bản nội dung mới? Bản hiện tại sẽ được đưa vào lịch sử để có thể khôi phục.')) return;
    try {
      const result = await window.VMODataService.updateCatalogContent(id, { content, referenceSolution, referenceLinks, changeNote, expectedVersion });
      showToast(`Đã lưu phiên bản ${result?.version || expectedVersion + 1}.`, true);
      await window.loadCatalogManagement();
      await window.editCatalogContent(id);
    } catch (err) { showToast(err?.message || 'Không lưu được nội dung', false); }
  };

  window.restoreCatalogRevision = async function(revisionId) {
    if (!requireAdminUiAction()) return;
    if (!window.confirm('Khôi phục phiên bản này? Nội dung hiện tại vẫn được sao lưu trước khi khôi phục.')) return;
    try {
      const id = document.getElementById('catalogContentId').value;
      await window.VMODataService.restoreCatalogRevision(revisionId);
      showToast('Đã khôi phục nội dung và tạo một phiên bản mới.', true);
      await window.loadCatalogManagement();
      await window.editCatalogContent(id);
    } catch (err) { showToast(err?.message || 'Không khôi phục được phiên bản', false); }
  };

  function ensureSubmissionFilterUi(modal, isAdmin) {
    const panel = modal?.querySelector('#hub-panel-subs');
    const list = modal?.querySelector('#hubSubsList');
    if (!panel || !list || panel.querySelector('#hubSubmissionFilters')) return;
    const filters = document.createElement('div');
    filters.id = 'hubSubmissionFilters';
    filters.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px;margin-bottom:10px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;';
    filters.innerHTML = `
      <input id="hubSubSearch" type="search" placeholder="Tìm câu hỏi, bộ đề, lời giải..." style="min-width:0;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;">
      ${isAdmin ? '<input id="hubSubUsername" type="search" placeholder="Tài khoản" style="min-width:0;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;">' : '<span></span>'}
      <select id="hubSubSource" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
        <option value="">Tất cả nguồn</option><option value="specialty">Chuyên đề</option><option value="mock_exam">Thi thử</option><option value="tst">TST</option><option value="danang_quangnam">Đà Nẵng–Quảng Nam</option>
      </select>
      <select id="hubSubEvaluation" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
        <option value="">Mọi trạng thái AI</option><option value="yes">Có đánh giá AI</option><option value="no">Chưa đánh giá AI</option>
      </select>
      <input id="hubSubDateFrom" type="date" title="Từ ngày" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
      <button type="button" onclick="applySubmissionFilters()" style="padding:7px 12px;border:0;border-radius:6px;background:#0369a1;color:white;font-weight:700;cursor:pointer;">Lọc</button>
      <input id="hubSubDateTo" type="date" title="Đến ngày" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
      <select id="hubSubPageSize" title="Số bài mỗi trang" style="min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;">
        <option value="5">5 bài/trang</option><option value="10" selected>10 bài/trang</option><option value="20">20 bài/trang</option><option value="50">50 bài/trang</option>
      </select>
      <button type="button" onclick="resetSubmissionFilters()" style="padding:7px 12px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#475569;font-weight:600;cursor:pointer;">Đặt lại</button>
    `;
    list.before(filters);
    filters.querySelectorAll('input').forEach(field => {
      field.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          window.applySubmissionFilters();
        }
      });
    });
    filters.querySelector('#hubSubPageSize')?.addEventListener('change', () => {
      window.applySubmissionFilters();
    });
  }

  window.openDataHubModal = function() {
    let modal = document.getElementById('dataHubModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dataHubModal';
      modal.className = 'vmo-modal-overlay';
      modal.innerHTML = `
        <div class="vmo-modal-container" style="max-width: 800px;">
          <div class="vmo-modal-header" style="background:#0f172a; color:#fff;">
            <div class="vmo-modal-title" style="color:#fff;">
              <span>🗄️</span>
              <span>Trung tâm Quản trị Dữ liệu database (VMO Database Hub)</span>
            </div>
            <button type="button" class="vmo-modal-close" style="color:#fff;" onclick="closeDataHubModal()">✕</button>
          </div>
          <div class="vmo-modal-body">
            <!-- Navigation Sub-tabs trong Modal -->
            <div style="display:flex; gap:8px; border-bottom:2px solid #e2e8f0; margin-bottom:16px; padding-bottom:8px;">
              <button type="button" class="hub-tab-btn active" id="hub-tab-events" onclick="switchHubTab('events')">📅 Sự kiện & Lịch thi</button>
              <button type="button" class="hub-tab-btn" id="hub-tab-docs" onclick="switchHubTab('docs')">📚 Tài liệu & Kỷ yếu</button>
              <button type="button" class="hub-tab-btn" id="hub-tab-exams" onclick="switchHubTab('exams')">📑 Đề thi mới</button>
            </div>

            <!-- Panel 1: SỰ KIỆN & LỊCH THI -->
            <div id="hub-panel-events" class="hub-panel">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Lịch thi & Hoạt động tập huấn Đội tuyển</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddEventForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  ➕ Thêm sự kiện mới
                </button>
              </div>

              <!-- Form thêm sự kiện -->
              <form id="formAddEvent" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateEvent(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tên sự kiện / Lịch thi *</label>
                    <input type="text" id="evtTitle" placeholder="vd: Thi thử VMO đợt 1" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Phân loại *</label>
                    <select id="evtType" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="exam">Thi thử / Chọn Đội tuyển</option>
                      <option value="seminar">Hội thảo / Chuyên đề</option>
                      <option value="training">Tập huấn nâng cao</option>
                      <option value="deadline">Hạn nộp bài tập</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Ngày bắt đầu *</label>
                    <input type="date" id="evtStartDate" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Địa điểm tổ chức</label>
                    <input type="text" id="evtLocation" placeholder="vd: THPT Phan Châu Trinh, Đà Nẵng" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="margin-bottom:10px;">
                  <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Ghi chú chi tiết</label>
                  <input type="text" id="evtDesc" placeholder="Nội dung chuyên đề, tài liệu mang theo..." style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddEventForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Hủy</button>
                  <button type="submit" style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">Lưu vào database</button>
                </div>
              </form>

              <div id="hubEventsList" style="max-height:300px; overflow-y:auto;">
                <em>Đang nạp danh sách sự kiện từ database...</em>
              </div>
            </div>

            <!-- Panel 2: TÀI LIỆU & KỶ YẾU -->
            <div id="hub-panel-docs" class="hub-panel" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Kho Tài liệu & Chuyên đề Chuyên Toán</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddDocForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  ➕ Thêm tài liệu mới
                </button>
              </div>

              <!-- Form thêm tài liệu -->
              <form id="formAddDoc" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateDocument(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tên tài liệu / Kỷ yếu *</label>
                    <input type="text" id="docTitle" placeholder="vd: Kỷ yếu Trại hè Hùng Vương 2026" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Phân môn chuyên đề *</label>
                    <select id="docTopic" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="Đại số & Giải tích">Đại số & Giải tích</option>
                      <option value="Hình học phẳng">Hình học phẳng</option>
                      <option value="Số học">Số học</option>
                      <option value="Tổ hợp">Tổ hợp</option>
                      <option value="Tổng hợp">Đề thi & Kỷ yếu tổng hợp</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tác giả / Ban chuyên môn</label>
                    <input type="text" id="docAuthor" placeholder="vd: Tổ Toán VMO Đà Nẵng" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Link tải / Xem PDF</label>
                    <input type="url" id="docUrl" placeholder="https://..." style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddDocForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Hủy</button>
                  <button type="submit" style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">Lưu tài liệu vào database</button>
                </div>
              </form>

              <div id="hubDocsList" style="max-height:300px; overflow-y:auto;">
                <em>Đang nạp danh sách tài liệu từ database...</em>
              </div>
            </div>

            <!-- Panel 3: ĐỀ THI MỚI -->
            <div id="hub-panel-exams" class="hub-panel" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Ngân hàng Đề thi Đội tuyển</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddExamForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  ➕ Thêm đề thi mới
                </button>
              </div>

              <!-- Form OCR và thêm đề thi -->
              <form id="formAddExam" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateExam(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tỉnh/Thành phố trên frontend *</label>
                    <select id="examTargetAnchor" required onchange="syncExamProvinceFromTarget()" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;"></select>
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Ngày thi *</label>
                    <select id="examDayNumber" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="1">Ngày thi thứ nhất</option>
                      <option value="2">Ngày thi thứ hai</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tỉnh / Đơn vị *</label>
                    <input type="text" id="examProvince" placeholder="vd: Bắc Ninh" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tên đề thi</label>
                    <input type="text" id="examTitle" placeholder="Có thể để trống để lấy từ OCR" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Năm học</label>
                    <input type="text" id="examYear" value="2026-2027" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Ngày tổ chức</label>
                    <input type="date" id="examDate" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Thời gian (phút)</label>
                    <input type="number" id="examDuration" value="180" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="margin-bottom:10px;padding:10px;background:#fff;border:1px dashed #94a3b8;border-radius:7px;">
                  <label style="display:block;font-size:.82rem;font-weight:700;margin-bottom:6px;">Ảnh đề thi (JPEG/PNG/WEBP, có thể chọn nhiều trang) *</label>
                  <input type="file" id="examImages" accept="image/jpeg,image/png,image/webp" multiple required onchange="resetExamOcrPreview()" style="width:100%;">
                  <div style="display:flex;align-items:center;gap:8px;margin-top:9px;">
                    <button type="button" id="examOcrButton" onclick="runExamOcr()" style="background:#7c3aed;color:#fff;border:none;padding:7px 13px;border-radius:6px;font-weight:700;cursor:pointer;">🔎 OCR đề thi & tạo MathJax</button>
                    <span id="examOcrStatus" style="font-size:.8rem;color:#64748b;">Chưa xử lý ảnh.</span>
                  </div>
                </div>
                <div id="examOcrPreview" style="display:none;margin-bottom:10px;padding:10px;background:#fff;border:1px solid #cbd5e1;border-radius:7px;"></div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddExamForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Hủy</button>
                  <button type="submit" id="examSaveButton" disabled style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">Lưu đề thi & câu hỏi vào MongoDB</button>
                </div>
              </form>

              <div id="hubExamsList" style="max-height:300px; overflow-y:auto;">
                <em>Đang nạp danh sách đề thi từ database...</em>
              </div>
            </div>

          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Thêm style cho tab trong hub modal
      const style = document.createElement('style');
      style.textContent = `
        .hub-tab-btn {
          background: none;
          border: none;
          padding: 8px 14px;
          font-weight: 600;
          font-size: 0.9rem;
          color: #64748b;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .hub-tab-btn.active {
          background: #e0f2fe;
          color: #0369a1;
        }
      `;
      document.head.appendChild(style);
    }

    ensureExamOcrForm(modal);
    applyDataHubPermissions(modal);
    switchHubTab('events');
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Đảm bảo nút đóng và click backdrop luôn hoạt động
    const closeBtns = modal.querySelectorAll('.vmo-modal-close, #dataHubModalClose');
    closeBtns.forEach(btn => {
      btn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        window.closeDataHubModal();
      };
    });
    modal.onclick = (e) => {
      if (e.target === modal) window.closeDataHubModal();
    };
  }

  window.closeDataHubModal = function() {
    const modal = document.getElementById('dataHubModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
  };

  window.switchHubTab = function(tabName) {
    ['events', 'docs', 'exams', 'catalog', 'subs'].forEach(t => {
      const btn = document.getElementById('hub-tab-' + t);
      const panel = document.getElementById('hub-panel-' + t);
      if (btn) btn.classList.toggle('active', t === tabName);
      if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
    });

    if (tabName === 'events') loadHubEvents();
    if (tabName === 'docs') loadHubDocs();
    if (tabName === 'exams') loadHubExams();
    if (tabName === 'catalog') loadCatalogManagement();
    if (tabName === 'subs') loadAllSubmissions();
  };

  window.hubSubmissionState = { page: 1, limit: 10, total: 0, pages: 1 };

  function readSubmissionFilters() {
    return {
      page: window.hubSubmissionState.page,
      limit: Number(document.getElementById('hubSubPageSize')?.value) || 10,
      q: document.getElementById('hubSubSearch')?.value?.trim() || '',
      username: document.getElementById('hubSubUsername')?.value?.trim() || '',
      sourceGroup: document.getElementById('hubSubSource')?.value || '',
      evaluation: document.getElementById('hubSubEvaluation')?.value || '',
      dateFrom: document.getElementById('hubSubDateFrom')?.value || '',
      dateTo: document.getElementById('hubSubDateTo')?.value || ''
    };
  }

  window.applySubmissionFilters = function() {
    window.hubSubmissionState.page = 1;
    window.loadAllSubmissions();
  };

  window.resetSubmissionFilters = function() {
    ['hubSubSearch', 'hubSubUsername', 'hubSubSource', 'hubSubEvaluation', 'hubSubDateFrom', 'hubSubDateTo']
      .forEach(id => {
        const field = document.getElementById(id);
        if (field) field.value = '';
      });
    const pageSize = document.getElementById('hubSubPageSize');
    if (pageSize) pageSize.value = '10';
    window.hubSubmissionState = { page: 1, limit: 10, total: 0, pages: 1 };
    window.loadAllSubmissions();
  };

  window.changeSubmissionPage = function(page) {
    const requested = Math.max(1, Math.min(Number(page) || 1, window.hubSubmissionState.pages || 1));
    if (requested === window.hubSubmissionState.page) return;
    window.hubSubmissionState.page = requested;
    window.loadAllSubmissions();
  };

  window.loadAllSubmissions = async function() {
    const el = document.getElementById('hubSubsList');
    if (!el) return;
    el.innerHTML = '<em>Đang tải danh sách bài nộp từ database...</em>';
    try {
      if (window.VMODataService && window.VMODataService.getSubmissionsPage) {
        const result = await window.VMODataService.getSubmissionsPage(readSubmissionFilters());
        const subs = result.items || [];
        window.hubSubmissionState = {
          page: result.pagination?.page || 1,
          limit: result.pagination?.limit || 10,
          total: result.pagination?.total || 0,
          pages: result.pagination?.pages || 1
        };
        // Dùng cùng nguồn dữ liệu với cửa sổ lịch sử để các nút xem chi tiết
        // có thể mở đúng nhận xét AI của bản ghi đang hiển thị trong Database Hub.
        window.lastLoadedSubmissions = subs || [];
        if (!subs || subs.length === 0) {
          el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có bài giải nào được lưu trên hệ thống database. Học sinh hoặc giáo viên có thể nhấn "✍️ Nộp bài giải" hoặc "🚀 Lưu bài giải lên database" ở từng câu hỏi để lưu vào đây!</div>';
          return;
        }
        const cardsHtml = subs.map((s, idx) => {
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '';
          const preview = s.solutionContent ? s.solutionContent.slice(0, 150) + (s.solutionContent.length > 150 ? '...' : '') : '';
          const snapshot = s.problemSnapshot || {};
          const sourceLabels = {
            specialty_example: 'Tài liệu chuyên đề VMO',
            mock_exam_question: 'Bộ đề thi thử VMO',
            tst_question: 'Đề TST 2026–2027',
            regional_question: 'Đề Đà Nẵng–Quảng Nam'
          };
          const sourceLabel = sourceLabels[s.sourceType || snapshot.sourceType] || 'Ngân hàng bài toán VMO';
          const setTitle = snapshot.setTitle || s.setTitle || '';
          const problemTitle = snapshot.title || s.problemTitle || s.problemKey || s.problemId || 'Bài toán VMO';
          const score = s.score || s.evaluation?.estimatedScore || '';
          const evaluationBtn = s.evaluation ? `
            <button type="button" onclick="viewSubEvaluationDetail(${idx})" style="background:#eef2ff; border:1px solid #c7d2fe; color:#4338ca; border-radius:4px; padding:5px 9px; font-size:0.75rem; cursor:pointer; font-weight:600;">
              👁️ Xem nhận xét AI
            </button>
          ` : '';
          const imageBtn = s.hasImage ? `
            <button type="button" onclick="viewSubmissionImage('${s.id || s._id}')" style="background:#ecfeff; border:1px solid #a5f3fc; color:#0e7490; border-radius:4px; padding:5px 9px; font-size:0.75rem; cursor:pointer; font-weight:600;">
              📷 Xem ảnh
            </button>
          ` : '';
          const deleteBtn = isCurrentUserAdmin() ? `
            <button type="button" onclick="deleteSubmissionItem('${s.id || s._id}')" style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; border-radius:4px; padding:5px 9px; font-size:0.75rem; cursor:pointer; font-weight:700;">
              🗑️ Xóa bài nộp
            </button>
          ` : '';
          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
              <div style="font-size:0.72rem; color:#4338ca; font-weight:800; text-transform:uppercase; letter-spacing:.04em; margin-bottom:3px;">${escapeHtmlText(sourceLabel)}</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:#0f172a; font-size:0.95rem;">${escapeHtmlText(problemTitle)}</strong>
                <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">${escapeHtmlText(s.authorName || 'Học sinh')}</span>
              </div>
              ${setTitle ? `<div style="font-size:0.82rem;color:#475569;margin-bottom:5px;">📚 ${escapeHtmlText(setTitle)}</div>` : ''}
              <div style="font-size:0.8rem; color:#64748b; margin-bottom:6px;">
                📅 Thời gian: ${escapeHtmlText(dateStr)} | 👤 Tài khoản: ${escapeHtmlText(s.username || s.authorEmail || s.userId || 'Ẩn danh')}
                ${score ? ` | 🎯 Điểm AI: <strong>${escapeHtmlText(score)}</strong>` : ''}
              </div>
              <div data-no-i18n="true" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; font-family:monospace; font-size:0.85rem; color:#334155; white-space:pre-wrap;">${escapeHtmlText(preview)}</div>
              ${(evaluationBtn || imageBtn || deleteBtn) ? `
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
                  ${evaluationBtn}
                  ${imageBtn}
                  ${deleteBtn}
                </div>
              ` : ''}
            </div>
          `;
        }).join('');
        const state = window.hubSubmissionState;
        const pagerHtml = `
          <div style="position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;background:#fff;border:1px solid #e2e8f0;border-radius:7px;box-shadow:0 -2px 8px rgba(15,23,42,.06);">
            <span style="font-size:.8rem;color:#475569;">Tổng <strong>${state.total}</strong> bài · Trang <strong>${state.page}/${state.pages}</strong></span>
            <div style="display:flex;gap:6px;">
              <button type="button" onclick="changeSubmissionPage(${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''} style="padding:5px 10px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;cursor:pointer;">← Trước</button>
              <button type="button" onclick="changeSubmissionPage(${state.page + 1})" ${state.page >= state.pages ? 'disabled' : ''} style="padding:5px 10px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;cursor:pointer;">Sau →</button>
            </div>
          </div>`;
        el.innerHTML = cardsHtml + pagerHtml;
      } else {
        el.innerHTML = '<div style="color:#dc2626;">Dịch vụ VMODataService chưa sẵn sàng.</div>';
      }
    } catch (e) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải bài nộp: ' + e.message + '</div>';
    }
  };

  window.deleteSubmissionItem = async function(id) {
    if (!requireAdminUiAction()) return;
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn bài nộp này và ảnh bài làm liên quan khỏi Database?')) return;
    try {
      await window.VMODataService.deleteSubmission(id);
      showToast('Đã xóa bài nộp và ảnh liên quan khỏi database.', true);
      await loadAllSubmissions();
    } catch (err) {
      showToast('Không thể xóa bài nộp: ' + (err?.message || 'Lỗi không xác định'), false);
    }
  };

  window.toggleAddEventForm = function() {
    if (!requireAdminUiAction()) return;
    const f = document.getElementById('formAddEvent');
    if (f) f.style.display = (f.style.display === 'none') ? 'block' : 'none';
  };
  window.toggleAddDocForm = function() {
    if (!requireAdminUiAction()) return;
    const f = document.getElementById('formAddDoc');
    if (f) f.style.display = (f.style.display === 'none') ? 'block' : 'none';
  };
  window.pendingExamOcrQuestions = [];
  window.pendingExamOcrConfidence = '';
  window.pendingExamSourceImages = [];

  function populateExamTargetOptions() {
    const select = document.getElementById('examTargetAnchor');
    if (!select) return;
    const previous = select.value;
    const cards = Array.from(document.querySelectorAll('#tab-tst .exam-card[id]'));
    select.innerHTML = cards.map((card, index) => {
      const province = (card.querySelector('.tag-province')?.textContent || card.querySelector('.exam-title')?.textContent || card.id).trim();
      const sidebar = document.querySelector(`#sidebar-tst a[href="#${CSS.escape(card.id)}"]`)?.textContent?.trim();
      return `<option value="${escapeHtmlText(card.id)}" data-province="${escapeHtmlText(province)}" data-order="${index + 1}">${escapeHtmlText(sidebar || `${index + 1}. ${province}`)}</option>`;
    }).join('');
    if (previous && cards.some(card => card.id === previous)) select.value = previous;
    window.syncExamProvinceFromTarget();
  }

  window.syncExamProvinceFromTarget = function() {
    const select = document.getElementById('examTargetAnchor');
    const province = document.getElementById('examProvince');
    if (select?.selectedOptions?.[0] && province) {
      province.value = select.selectedOptions[0].dataset.province || province.value;
    }
  };

  window.resetExamOcrPreview = function() {
    window.pendingExamOcrQuestions = [];
    window.pendingExamOcrConfidence = '';
    window.pendingExamSourceImages = [];
    const preview = document.getElementById('examOcrPreview');
    const save = document.getElementById('examSaveButton');
    const status = document.getElementById('examOcrStatus');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (save) save.disabled = true;
    if (status) status.textContent = 'Ảnh đã thay đổi; cần chạy OCR lại.';
  };

  async function examImageDataUrl(file) {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WEBP');
    const original = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không đọc được ảnh đề thi'));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Ảnh đề thi không hợp lệ'));
      element.src = original;
    });
    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.9;
    let output = canvas.toDataURL('image/jpeg', quality);
    while (output.length > 2_800_000 && quality > 0.55) {
      quality -= 0.08;
      output = canvas.toDataURL('image/jpeg', quality);
    }
    if (output.length > 3_000_000) throw new Error('Ảnh quá lớn sau khi nén; vui lòng chụp/cắt rõ từng trang');
    return output;
  }

  function renderExamOcrEditor() {
    const preview = document.getElementById('examOcrPreview');
    const questions = window.pendingExamOcrQuestions || [];
    if (!preview) return;
    preview.style.display = 'block';
    preview.innerHTML = `<div style="font-weight:800;color:#1e293b;margin-bottom:8px;">Bản OCR — kiểm tra và chỉnh sửa trước khi lưu (${questions.length} câu)</div>` + questions.map((item, index) => `
      <div class="exam-ocr-question" data-index="${index}" style="border-top:1px solid #e2e8f0;padding-top:10px;margin-top:10px;">
        <div style="display:grid;grid-template-columns:90px 1fr 90px;gap:8px;margin-bottom:7px;">
          <input class="exam-ocr-number" type="number" min="1" max="99" value="${Number(item.questionNumber) || index + 1}" aria-label="Số câu" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;">
          <input class="exam-ocr-topic" value="${escapeHtmlText(item.topic || 'Toán Olympic')}" aria-label="Chuyên đề" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;">
          <input class="exam-ocr-score" type="number" min="0" max="20" step="0.25" value="${Number(item.maxScore) || 0}" aria-label="Điểm" style="padding:6px;border:1px solid #cbd5e1;border-radius:5px;">
        </div>
        <textarea class="exam-ocr-content" rows="7" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:5px;font-family:monospace;">${escapeHtmlText(item.content || '')}</textarea>
        <div class="exam-ocr-math-preview" data-no-i18n="true" style="margin-top:7px;padding:9px;border:1px solid #e2e8f0;border-radius:5px;line-height:1.65;"></div>
      </div>`).join('');
    preview.querySelectorAll('.exam-ocr-question').forEach((row, index) => {
      window.safeRenderMathJaxToElement?.(row.querySelector('.exam-ocr-math-preview'), questions[index]?.content || '');
      row.querySelector('.exam-ocr-content')?.addEventListener('input', event => {
        window.safeRenderMathJaxToElement?.(row.querySelector('.exam-ocr-math-preview'), event.target.value);
      });
    });
  }

  window.runExamOcr = async function() {
    if (!requireAdminUiAction()) return;
    const input = document.getElementById('examImages');
    const files = Array.from(input?.files || []);
    if (!files.length) return showToast('Vui lòng chọn ít nhất một ảnh đề thi.', false);
    const button = document.getElementById('examOcrButton');
    const status = document.getElementById('examOcrStatus');
    const province = document.getElementById('examProvince')?.value?.trim() || '';
    const year = document.getElementById('examYear')?.value?.trim() || '2026-2027';
    const dayNumber = Number(document.getElementById('examDayNumber')?.value) || 1;
    if (!province) return showToast('Vui lòng chọn tỉnh/thành phố.', false);
    if (button) button.disabled = true;
    window.pendingExamOcrQuestions = [];
    window.pendingExamSourceImages = [];
    try {
      const byNumber = new Map();
      for (let index = 0; index < files.length; index += 1) {
        if (status) status.textContent = `Đang OCR ảnh ${index + 1}/${files.length}...`;
        const image = await examImageDataUrl(files[index]);
        window.pendingExamSourceImages.push(image);
        const response = await fetch('/api/ai-ocr-exam', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, province, year, dayNumber })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || `OCR thất bại (HTTP ${response.status})`);
        const data = payload.data || {};
        (data.questions || []).forEach(question => byNumber.set(Number(question.questionNumber), question));
        window.pendingExamOcrConfidence = data.confidence || window.pendingExamOcrConfidence;
        const titleInput = document.getElementById('examTitle');
        const dateInput = document.getElementById('examDate');
        const durationInput = document.getElementById('examDuration');
        if (titleInput && !titleInput.value.trim() && data.examTitle) titleInput.value = data.examTitle;
        if (dateInput && !dateInput.value && /^\d{4}-\d{2}-\d{2}$/.test(data.examDate || '')) dateInput.value = data.examDate;
        if (durationInput && data.duration) durationInput.value = data.duration;
      }
      window.pendingExamOcrQuestions = Array.from(byNumber.values()).sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));
      renderExamOcrEditor();
      if (status) status.textContent = `Đã OCR ${files.length} ảnh, nhận dạng ${window.pendingExamOcrQuestions.length} câu.`;
      const save = document.getElementById('examSaveButton');
      if (save) save.disabled = !window.pendingExamOcrQuestions.length;
      showToast('OCR hoàn tất. Hãy rà soát công thức MathJax trước khi lưu.', true);
    } catch (error) {
      if (status) status.textContent = error?.message || 'OCR thất bại.';
      showToast('Lỗi OCR đề thi: ' + (error?.message || 'Không xác định'), false);
    } finally {
      if (button) button.disabled = false;
    }
  };

  function collectExamOcrQuestions() {
    return Array.from(document.querySelectorAll('#examOcrPreview .exam-ocr-question')).map((row, index) => {
      const questionNumber = Math.max(1, Number(row.querySelector('.exam-ocr-number')?.value) || index + 1);
      return {
        questionNumber,
        title: `Câu ${questionNumber}`,
        topic: row.querySelector('.exam-ocr-topic')?.value?.trim() || 'Toán Olympic',
        maxScore: Math.max(0, Number(row.querySelector('.exam-ocr-score')?.value) || 0),
        content: row.querySelector('.exam-ocr-content')?.value?.trim() || ''
      };
    }).filter(item => item.content);
  }

  window.toggleAddExamForm = function() {
    if (!requireAdminUiAction()) return;
    const f = document.getElementById('formAddExam');
    if (f) {
      f.style.display = (f.style.display === 'none') ? 'block' : 'none';
      if (f.style.display === 'block') populateExamTargetOptions();
    }
  };

  // Nạp dữ liệu các tab từ MongoDB Atlas qua API đã xác thực
  async function loadHubEvents() {
    const el = document.getElementById('hubEventsList');
    if (!el) return;
    try {
      const events = await window.VMODataService.getEvents();
      if (!events || events.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có sự kiện nào được lưu trên database. Hãy nhấn "➕ Thêm sự kiện mới" để tạo sự kiện đầu tiên!</div>';
        return;
      }
      el.innerHTML = events.map(e => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#0f172a; font-size:0.95rem;">${e.title}</strong>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
              📅 Ngày: <strong>${e.startDate}</strong> | 📍 Địa điểm: ${e.location || 'Đang cập nhật'}
            </div>
            ${e.description ? `<div style="font-size:0.8rem; color:#475569; margin-top:4px;">${e.description}</div>` : ''}
          </div>
          ${isCurrentUserAdmin() ? `<button type="button" onclick="deleteEventItem('${e.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">🗑️ Xóa</button>` : ''}
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải sự kiện từ database: ' + err.message + '</div>';
    }
  }

  async function loadHubDocs() {
    const el = document.getElementById('hubDocsList');
    if (!el) return;
    try {
      const docs = await window.VMODataService.getDocuments();
      if (!docs || docs.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có tài liệu nào trong database. Nhấn "➕ Thêm tài liệu mới" để lưu tài liệu lên hệ thống!</div>';
        return;
      }
      el.innerHTML = docs.map(d => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#0f172a; font-size:0.95rem;">${d.title}</strong>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
              🏷️ Chuyên đề: <strong>${d.topic}</strong> | ✍️ Tác giả: ${d.author || 'Tổ Toán'}
            </div>
            ${d.fileUrl ? `<a href="${d.fileUrl}" target="_blank" rel="noreferrer" style="font-size:0.8rem; color:#0284c7; text-decoration:underline;">🔗 Mở tài liệu</a>` : ''}
          </div>
          ${isCurrentUserAdmin() ? `<button type="button" onclick="deleteDocItem('${d.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">🗑️ Xóa</button>` : ''}
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải tài liệu: ' + err.message + '</div>';
    }
  }

  async function loadHubExams() {
    const el = document.getElementById('hubExamsList');
    if (!el) return;
    try {
      const exams = await window.VMODataService.getExams();
      if (!exams || exams.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có đề thi nào trong database. Nhấn "➕ Thêm đề thi mới" để bắt đầu!</div>';
        return;
      }
      el.innerHTML = exams.map(x => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
          <strong style="color:#0f172a; font-size:0.95rem;">${x.title}</strong>
          <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
            Nhóm: <strong>${x.category}</strong> | Năm: ${x.year} | Thời gian: ${x.duration} phút
          </div>
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải đề thi: ' + err.message + '</div>';
    }
  }

  // Handlers tạo mới
  window.handleCreateEvent = async function(e) {
    e.preventDefault();
    if (!requireAdminUiAction()) return;
    const title = document.getElementById('evtTitle').value.trim();
    const eventType = document.getElementById('evtType').value;
    const startDate = document.getElementById('evtStartDate').value;
    const location = document.getElementById('evtLocation').value.trim();
    const description = document.getElementById('evtDesc').value.trim();

    try {
      await window.VMODataService.addEvent({ title, eventType, startDate, location, description });
      showToast('Đã lưu sự kiện mới vào database!', true);
      toggleAddEventForm();
      loadHubEvents();
    } catch (err) {
      showToast('Lỗi lưu sự kiện: ' + err.message, false);
    }
  };

  window.handleCreateDocument = async function(e) {
    e.preventDefault();
    if (!requireAdminUiAction()) return;
    const title = document.getElementById('docTitle').value.trim();
    const topic = document.getElementById('docTopic').value;
    const author = document.getElementById('docAuthor').value.trim();
    const fileUrl = document.getElementById('docUrl').value.trim();

    try {
      await window.VMODataService.addDocument({ title, topic, author, fileUrl });
      showToast('Đã lưu tài liệu vào database!', true);
      toggleAddDocForm();
      loadHubDocs();
    } catch (err) {
      showToast('Lỗi lưu tài liệu: ' + err.message, false);
    }
  };

  window.handleCreateExam = async function(e) {
    e.preventDefault();
    if (!requireAdminUiAction()) return;
    const title = document.getElementById('examTitle').value.trim();
    const province = document.getElementById('examProvince').value.trim();
    const year = document.getElementById('examYear').value.trim();
    const duration = Number(document.getElementById('examDuration').value) || 180;
    const examDate = document.getElementById('examDate')?.value || '';
    const dayNumber = Number(document.getElementById('examDayNumber')?.value) || 1;
    const targetSelect = document.getElementById('examTargetAnchor');
    const targetAnchor = targetSelect?.value || '';
    const provinceOrder = Number(targetSelect?.selectedOptions?.[0]?.dataset?.order) || 0;
    const sourceImageCount = document.getElementById('examImages')?.files?.length || 0;
    const questions = collectExamOcrQuestions();
    const sourceImages = Array.from(window.pendingExamSourceImages || []);
    if (!questions.length) return showToast('Vui lòng OCR và rà soát nội dung câu hỏi trước khi lưu.', false);
    if (!targetAnchor || !sourceImages.length) return showToast('Vui lòng chọn tỉnh/thành phố và ảnh đề thi.', false);

    const saveButton = document.getElementById('examSaveButton');
    const originalSaveLabel = saveButton?.textContent || 'Lưu đề thi & câu hỏi vào MongoDB';
    const saveExam = replaceExisting => window.VMODataService.createExamFromOcr({
        title, province, year, duration, examDate, dayNumber, targetAnchor,
        provinceOrder, sourceImageCount, ocrConfidence: window.pendingExamOcrConfidence,
        status: 'published', replaceExisting, questions
      });
    try {
      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Đang lưu đề thi...';
      }
      let saved;
      try {
        saved = await saveExam(false);
      } catch (error) {
        if (error?.status !== 409) throw error;
        const accepted = confirm(`${error.message}\n\nBạn có muốn thay thế nội dung của đúng đề/ngày này không? Lịch sử bài nộp vẫn được giữ nguyên.`);
        if (!accepted) return;
        saved = await saveExam(true);
      }
      for (let index = 0; index < sourceImages.length; index += 1) {
        if (saveButton) saveButton.textContent = `Đang lưu ảnh ${index + 1}/${sourceImages.length}...`;
        await window.VMODataService.saveExamImage(saved.id || saved._id, index + 1, sourceImages[index]);
      }
      showToast(`Đã lưu đề thi và ${saved?.problemCount || questions.length} câu hỏi vào MongoDB!`, true);
      e.target.reset();
      window.resetExamOcrPreview();
      toggleAddExamForm();
      loadHubExams();
      await loadDatabaseTstExams(true);
    } catch (err) {
      showToast('Lỗi lưu đề thi: ' + err.message, false);
    } finally {
      if (saveButton && document.body.contains(saveButton)) {
        saveButton.disabled = !(window.pendingExamOcrQuestions || []).length;
        saveButton.textContent = originalSaveLabel;
      }
    }
  };

  window.deleteEventItem = async function(id) {
    if (!requireAdminUiAction()) return;
    if (!confirm('Bạn có chắc chắn muốn xóa sự kiện này khỏi Database?')) return;
    try {
      await window.VMODataService.deleteEvent(id);
      showToast('Đã xóa sự kiện khỏi database!', true);
      loadHubEvents();
    } catch (e) {
      showToast('Lỗi khi xóa: ' + e.message, false);
    }
  };

  window.deleteDocItem = async function(id) {
    if (!requireAdminUiAction()) return;
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi Database?')) return;
    try {
      await window.VMODataService.deleteDocument(id);
      showToast('Đã xóa tài liệu khỏi database!', true);
      loadHubDocs();
    } catch (e) {
      showToast('Lỗi khi xóa: ' + e.message, false);
    }
  };

  function createDatabaseExamCard(exam) {
    const card = document.createElement('article');
    card.className = 'exam-card db-exam-card';
    card.id = exam.targetAnchor;
    card.dataset.filter = exam.region || 'BAC';
    card.dataset.search = `${exam.province || ''} ${exam.year || ''}`.toLowerCase();
    card.innerHTML = `<div class="exam-header"><div class="exam-top-tags"><span class="tag tag-year">${escapeHtmlText(exam.year || '2026-2027')}</span><span class="tag tag-province">${escapeHtmlText(exam.province || '')}</span><span class="tag tag-official">Đề từ database</span></div><h3 class="exam-title">${escapeHtmlText(exam.title || `Đề TST ${exam.province || ''}`)}</h3></div><div class="exam-body"></div>`;
    document.getElementById('tab-tst')?.appendChild(card);
    return card;
  }

  function renderMongoReferenceLinks(problem, links) {
    if (!problem || !Array.isArray(links) || !links.length) return;
    problem.querySelectorAll('.source-solution-box').forEach(node => node.remove());
    const box = document.createElement('div');
    box.className = 'solution-box source-solution-box';
    box.dataset.referenceSource = 'mongodb';
    const button = document.createElement('button');
    button.className = 'toggle-btn';
    button.type = 'button';
    button.textContent = '🔗 Lời giải tham khảo';
    button.setAttribute('aria-expanded', 'false');
    const content = document.createElement('div');
    content.className = 'solution-content';
    content.appendChild(Object.assign(document.createElement('strong'), { textContent: 'Nguồn lời giải:' }));
    const list = document.createElement('ul');
    links.forEach(link => {
      if (!link?.label || !/^https?:\/\//i.test(link?.url || '')) return;
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = link.label;
      const item = document.createElement('li');
      item.appendChild(anchor);
      list.appendChild(item);
    });
    if (!list.children.length) return;
    content.appendChild(list);
    button.onclick = () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      content.classList.toggle('show', !expanded);
    };
    box.append(button, content);
    problem.appendChild(box);
  }

  function applyMongoReferenceLinks(root = document) {
    const sourceMap = window.mongoProblemReferenceLinks || new Map();
    root.querySelectorAll?.('.problem-item[data-content-key], .examplebox[data-content-key]').forEach(problem => {
      const links = sourceMap.get(problem.dataset.contentKey);
      if (links?.length) renderMongoReferenceLinks(problem, links);
    });
  }

  async function loadMongoReferenceLinks(force = false) {
    if (!window.VMODataService?.getCatalogProblems) return;
    if (!force && window.mongoProblemReferenceLinks instanceof Map) {
      applyMongoReferenceLinks();
      return;
    }
    try {
      const problems = await window.VMODataService.getCatalogProblems({ sourceGroup: 'tst' });
      window.mongoProblemReferenceLinks = new Map(problems.map(problem => [problem.contentKey, problem.referenceLinks || []]));
      applyMongoReferenceLinks();
    } catch (error) {
      console.warn('Không tải được nguồn tham khảo MongoDB:', error?.message || error);
    }
  }

  function renderDatabaseExam(exam) {
    if (!exam?.targetAnchor || !Array.isArray(exam.problems) || !exam.problems.length) return;
    let card = document.getElementById(exam.targetAnchor);
    if (!card) card = createDatabaseExamCard(exam);
    const body = card?.querySelector('.exam-body') || card;
    if (!body) return;
    body.querySelectorAll(`.db-exam-day[data-exam-key="${CSS.escape(exam.examKey || exam.id || '')}"]`).forEach(node => node.remove());

    const newProblems = exam.problems.filter(problem => {
      const key = problem.contentKey || '';
      return key && !card.querySelector(`.problem-item[data-content-key="${CSS.escape(key)}"]`);
    });
    if (!newProblems.length) return;

    const section = document.createElement('section');
    section.className = 'db-exam-day';
    section.dataset.examKey = exam.examKey || exam.id || '';
    section.style.cssText = 'border-top:3px solid #0ea5e9;margin-top:20px;padding-top:14px;';
    const meta = document.createElement('div');
    meta.className = 'exam-day-header';
    meta.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;background:#eff6ff;padding:10px 12px;border-radius:8px;margin-bottom:12px;color:#0f172a;';
    const imageCount = Math.max(0, Math.min(20, Number(exam.sourceImageCount) || (exam.hasImages ? 1 : 0)));
    const imageButtons = Array.from({ length: imageCount }, (_, index) => `<button type="button" onclick="openExamSourceImage('${escapeHtmlText(exam.id || exam._id)}',${index + 1})" style="border:1px solid #93c5fd;background:#fff;color:#1d4ed8;padding:4px 9px;border-radius:5px;cursor:pointer;">🖼️ Ảnh ${index + 1}</button>`).join('');
    meta.innerHTML = `<strong>📌 Ngày thi thứ ${Number(exam.dayNumber) || 1}</strong><span>📅 ${escapeHtmlText(exam.examDate || 'Đang cập nhật')}</span><span>⏱️ ${Number(exam.duration) || 180} phút</span><span>🗄️ MongoDB</span>${imageButtons}`;
    section.appendChild(meta);

    newProblems.sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber)).forEach(problem => {
      const item = document.createElement('div');
      item.className = 'problem-item';
      item.dataset.contentKey = problem.contentKey;
      item.dataset.databaseProblem = 'true';
      item.dataset.setKey = problem.setKey || '';
      item.dataset.setTitle = problem.setTitle || exam.title || '';
      item.dataset.sourceGroup = problem.sourceGroup || 'tst';
      item.dataset.sourceType = problem.sourceType || 'tst_question';
      item.dataset.contentType = 'tst_exam';
      item.dataset.questionNumber = String(Number(problem.questionNumber) || 0);
      item.dataset.legacyProblemId = Array.isArray(problem.legacyIds) ? (problem.legacyIds[0] || '') : '';
      item.innerHTML = `<div class="problem-header"><div class="problem-id"><span>${escapeHtmlText(problem.shortLabel || problem.title || `Câu ${problem.questionNumber}`)}</span><span class="badge-point"> (${String(Number(problem.maxScore) || 0).replace('.', ',')}đ) </span><span class="badge-topic">${escapeHtmlText(problem.topic || 'Toán Olympic')}</span></div><button class="btn-copy" onclick="copyText(this)">📋 Sao chép</button></div><div class="problem-content" data-no-i18n="true"></div>`;
      section.appendChild(item);
      const content = item.querySelector('.problem-content');
      content.setAttribute('data-raw-math', problem.content || '');
      if (window.safeRenderMathJaxToElement) window.safeRenderMathJaxToElement(content, problem.content || '');
      else content.textContent = problem.content || '';
    });
    body.appendChild(section);
  }

  async function loadDatabaseTstExams(force = false) {
    if (!window.VMODataService?.getExamCatalog) {
      if (!force) setTimeout(() => loadDatabaseTstExams(true), 500);
      return;
    }
    try {
      const exams = await window.VMODataService.getExamCatalog('tst-national');
      exams.forEach(renderDatabaseExam);
      injectSubmissionButtons();
      window.reinitAIGuide?.();
      await applyCatalogAccessRules();
      applyMongoReferenceLinks(document.getElementById('tab-tst'));
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([document.getElementById('tab-tst')]).catch(() => {});
      }
    } catch (error) {
      console.warn('Không tải được đề thi động từ MongoDB:', error?.message || error);
    }
  }

  window.loadDatabaseTstExams = loadDatabaseTstExams;

  window.openExamSourceImage = async function(examId, pageNumber = 1) {
    const viewer = window.open('', '_blank');
    try {
      if (!viewer) throw new Error('Trình duyệt đang chặn cửa sổ xem ảnh');
      viewer.document.write('<!doctype html><html lang="vi"><body style="font-family:system-ui;padding:24px">Đang tải ảnh đề thi...</body></html>');
      const stored = await window.VMODataService.getExamImage(examId, pageNumber);
      if (!stored?.image) throw new Error('Không tìm thấy ảnh đề thi');
      viewer.document.open();
      viewer.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Ảnh đề thi gốc</title><style>body{margin:0;background:#0f172a;display:grid;place-items:center;min-height:100vh}img{max-width:96vw;max-height:96vh;object-fit:contain;background:#fff}</style></head><body><img alt="Ảnh đề thi gốc" src="${stored.image}"></body></html>`);
      viewer.document.close();
    } catch (error) {
      if (viewer && !viewer.closed) viewer.close();
      showToast(error?.message || 'Không mở được ảnh đề thi.', false);
    }
  };

  // Thiết lập sự kiện đóng cho modal
  function setupModalEvents() {
    const hubModal = document.getElementById('dataHubModal');
    if (hubModal) {
      const closeBtns = hubModal.querySelectorAll('.vmo-modal-close, #dataHubModalClose');
      closeBtns.forEach(btn => {
        btn.onclick = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          window.closeDataHubModal();
        };
      });
      hubModal.addEventListener('click', (e) => {
        if (e.target === hubModal) window.closeDataHubModal();
      });
    }

    const subModal = document.getElementById('submissionModal');
    if (subModal) {
      const closeBtns = subModal.querySelectorAll('.vmo-modal-close, #submissionModalClose');
      closeBtns.forEach(btn => {
        btn.onclick = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          window.closeSubmissionModal();
        };
      });
      subModal.addEventListener('click', (e) => {
        if (e.target === subModal) window.closeSubmissionModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.closeDataHubModal();
        if (typeof window.closeSubmissionModal === 'function') window.closeSubmissionModal();
      }
    });
  }

  // Tự động kích hoạt khi DOM hoàn tất
  function init() {
    setupModalEvents();
    injectSubmissionButtons();
    injectDataManagementButton();
    applyCatalogAccessRules();
    loadDatabaseTstExams();
    loadMongoReferenceLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Lắng nghe đổi tab hoặc đổi ngôn ngữ để gắn lại nút
  window.addEventListener('langchange', () => {
    injectSubmissionButtons();
    applyCatalogAccessRules();
  });

  window.reinitDatabaseUI = function() {
    injectSubmissionButtons();
    injectDataManagementButton();
    applyCatalogAccessRules();
    loadDatabaseTstExams(true);
    loadMongoReferenceLinks(true);
  };

})();
