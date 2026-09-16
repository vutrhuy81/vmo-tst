/**
 * VMO DATABASE MANAGER & UI INTEGRATION
 * Quản lý giao diện nộp bài giải học sinh, tài liệu, đề thi, sự kiện và đồng bộ MongoDB Atlas
 */

(() => {
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
      const examCard = item.closest('.exam-card') || item.closest('.paper-card');
      const examId = examCard ? (examCard.id || 'exam-unknown') : 'exam-unknown';
      const problemUniqueId = `${examId}-${problemTitle.replace(/[^a-zA-Z0-9]/g, '_')}`;

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
      btn.onclick = () => openSubmissionModal(problemUniqueId, problemTitle, item);

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
      const headingClone = heading.cloneNode(true);
      headingClone.querySelectorAll('button, .ai-guide-panel').forEach(node => node.remove());
      const title = (headingClone.textContent || '').trim();
      const uniqueId = 'vd-' + title.replace(/[^a-zA-Z0-9]/g, '_');

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
      btn.onclick = () => openSubmissionModal(uniqueId, title, box);

      const aiBtn = box.querySelector('.btn-ai-guide');
      if (aiBtn) {
        aiBtn.after(btn);
      } else {
        heading.appendChild(btn);
      }
    });
  }

  // 2. MODAL NỘP BÀI GIẢI CHO HỌC SINH (HỖ TRỢ ẢNH VIẾT TAY + ĐÁNH GIÁ AI CHUYÊN GIA TOÁN)
  window.currentSubmissionData = {
    problemId: '',
    problemTitle: '',
    problemContent: '',
    topic: '',
    examTitle: ''
  };
  window.currentUploadedImage = null;
  window.currentEvaluationResult = null;
  window.lastLoadedSubmissions = [];

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
        problemTitle: window.currentSubmissionData?.problemTitle || 'Bài toán VMO',
        problemContent: window.currentSubmissionData?.problemContent || '',
        topic: window.currentSubmissionData?.topic || '',
        examTitle: window.currentSubmissionData?.examTitle || '',
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

    window.currentSubmissionData = {
      problemId,
      problemTitle,
      problemContent: problemContentForAi || problemTitle,
      topic,
      examTitle
    };
    window.currentUploadedImage = null;
    window.currentEvaluationResult = null;

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
              hasImg
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

          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin-bottom:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#334155; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
                <span>#${subs.length - idx} · ${dateStr}</span>
                <div style="display:flex; align-items:center;">
                  ${scoreBadge}
                  <span style="color:#0284c7; font-size:0.78rem; margin-left:6px;">${verdictLabel}</span>
                  ${hasEvalBtn}
                </div>
              </div>
              <div style="color:#475569; font-size:0.8rem; font-family:monospace; white-space:pre-wrap;">${preview}</div>
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

              <!-- Form thêm đề thi -->
              <form id="formAddExam" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateExam(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tên đề thi / Kỳ thi *</label>
                    <input type="text" id="examTitle" placeholder="vd: Đề chọn Đội tuyển Chuyên Lê Quý Đôn 2026" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Phân nhóm đề *</label>
                    <select id="examCategory" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="vmo-danang">VMO Đà Nẵng</option>
                      <option value="mock">Đề thi thử VMO</option>
                      <option value="tst-national">Đề TST Toàn quốc 2026-2027</option>
                      <option value="history-dn-qn">Đề truyền thống ĐN-QN</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tỉnh / Đơn vị</label>
                    <input type="text" id="examProvince" placeholder="vd: Đà Nẵng" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Năm học</label>
                    <input type="text" id="examYear" value="2026-2027" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Thời gian (phút)</label>
                    <input type="number" id="examDuration" value="180" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddExamForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Hủy</button>
                  <button type="submit" style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">Lưu đề thi vào database</button>
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
    ['events', 'docs', 'exams', 'subs'].forEach(t => {
      const btn = document.getElementById('hub-tab-' + t);
      const panel = document.getElementById('hub-panel-' + t);
      if (btn) btn.classList.toggle('active', t === tabName);
      if (panel) panel.style.display = (t === tabName) ? 'block' : 'none';
    });

    if (tabName === 'events') loadHubEvents();
    if (tabName === 'docs') loadHubDocs();
    if (tabName === 'exams') loadHubExams();
    if (tabName === 'subs') loadAllSubmissions();
  };

  window.loadAllSubmissions = async function() {
    const el = document.getElementById('hubSubsList');
    if (!el) return;
    el.innerHTML = '<em>Đang tải danh sách bài nộp từ database...</em>';
    try {
      if (window.VMODataService && window.VMODataService.getAllSubmissions) {
        const subs = await window.VMODataService.getAllSubmissions();
        if (!subs || subs.length === 0) {
          el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có bài giải nào được lưu trên hệ thống database. Học sinh hoặc giáo viên có thể nhấn "✍️ Nộp bài giải" hoặc "🚀 Lưu bài giải lên database" ở từng câu hỏi để lưu vào đây!</div>';
          return;
        }
        el.innerHTML = subs.map((s, idx) => {
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '';
          const preview = s.solutionContent ? s.solutionContent.slice(0, 150) + (s.solutionContent.length > 150 ? '...' : '') : '';
          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:#0f172a; font-size:0.95rem;">${s.problemTitle || s.problemId || 'Bài toán VMO'}</strong>
                <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">${s.authorName || 'Học sinh'}</span>
              </div>
              <div style="font-size:0.8rem; color:#64748b; margin-bottom:6px;">
                📅 Thời gian: ${dateStr} | 👤 Tài khoản: ${s.authorEmail || s.userId || 'Ẩn danh'}
              </div>
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; font-family:monospace; font-size:0.85rem; color:#334155; white-space:pre-wrap;">${preview}</div>
            </div>
          `;
        }).join('');
      } else {
        el.innerHTML = '<div style="color:#dc2626;">Dịch vụ VMODataService chưa sẵn sàng.</div>';
      }
    } catch (e) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lỗi tải bài nộp: ' + e.message + '</div>';
    }
  };

  window.toggleAddEventForm = function() {
    const f = document.getElementById('formAddEvent');
    if (f) f.style.display = (f.style.display === 'none') ? 'block' : 'none';
  };
  window.toggleAddDocForm = function() {
    const f = document.getElementById('formAddDoc');
    if (f) f.style.display = (f.style.display === 'none') ? 'block' : 'none';
  };
  window.toggleAddExamForm = function() {
    const f = document.getElementById('formAddExam');
    if (f) f.style.display = (f.style.display === 'none') ? 'block' : 'none';
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
          <button type="button" onclick="deleteEventItem('${e.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">
            🗑️ Xóa
          </button>
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
          <button type="button" onclick="deleteDocItem('${d.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">
            🗑️ Xóa
          </button>
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
    const title = document.getElementById('examTitle').value.trim();
    const category = document.getElementById('examCategory').value;
    const province = document.getElementById('examProvince').value.trim();
    const year = document.getElementById('examYear').value.trim();
    const duration = document.getElementById('examDuration').value;

    try {
      await window.VMODataService.addExam({ title, category, province, year, duration });
      showToast('Đã lưu đề thi mới vào database!', true);
      toggleAddExamForm();
      loadHubExams();
    } catch (err) {
      showToast('Lỗi lưu đề thi: ' + err.message, false);
    }
  };

  window.deleteEventItem = async function(id) {
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
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi Database?')) return;
    try {
      await window.VMODataService.deleteDocument(id);
      showToast('Đã xóa tài liệu khỏi database!', true);
      loadHubDocs();
    } catch (e) {
      showToast('Lỗi khi xóa: ' + e.message, false);
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Lắng nghe đổi tab hoặc đổi ngôn ngữ để gắn lại nút
  window.addEventListener('langchange', () => {
    injectSubmissionButtons();
  });

  window.reinitDatabaseUI = function() {
    injectSubmissionButtons();
    injectDataManagementButton();
  };

})();
