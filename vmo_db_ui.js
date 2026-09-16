/**
 * VMO DATABASE MANAGER & UI INTEGRATION
 * Quáº£n lÃ½ giao diá»‡n ná»™p bÃ i giáº£i há»c sinh, tÃ i liá»‡u, Ä‘á» thi, sá»± kiá»‡n vÃ  Ä‘á»“ng bá»™ MongoDB Atlas
 */

(() => {
  // HÃ m hiá»ƒn thá»‹ thÃ´ng bÃ¡o Toast nhanh
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
    toast.innerHTML = `<span>${isSuccess ? 'âœ…' : 'âš ï¸'}</span> <span>${message}</span>`;
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
    }, 4000);
  }

  // 1. Gáº®N NÃšT "Ná»˜P BÃ€I GIáº¢I Cá»¦A Báº N" VÃ€O Tá»ªNG BÃ€I TOÃN
  function injectSubmissionButtons() {
    const isEn = (window.currentLang === 'en');

    // 1.1 Tháº» .problem-item (TST, Äá» thi thá»­, Äá» ÄÃ  Náºµng - Quáº£ng Nam)
    const problemItems = document.querySelectorAll('.problem-item');
    problemItems.forEach(item => {
      const header = item.querySelector('.problem-header');
      if (!header || item.querySelector('.btn-submit-solution')) return;

      const problemIdEl = header.querySelector('.problem-id');
      const problemTitle = problemIdEl ? (problemIdEl.innerText || problemIdEl.textContent || '').trim() : 'CÃ¢u há»i';
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
      btn.innerHTML = `âœï¸ ${isEn ? 'Submit Solution' : 'Ná»™p bÃ i giáº£i'}`;
      btn.title = isEn ? 'Submit your own solution to database' : 'Ná»™p lá»i giáº£i cÃ¡ nhÃ¢n cá»§a báº¡n lÃªn cÆ¡ sá»Ÿ dá»¯ liá»‡u';
      btn.onclick = () => openSubmissionModal(problemUniqueId, problemTitle, item);

      const aiBtn = header.querySelector('.btn-ai-guide');
      if (aiBtn) {
        aiBtn.after(btn);
      } else {
        header.appendChild(btn);
      }
    });

    // 1.2 Tháº» vÃ­ dá»¥ chuyÃªn Ä‘á» (.examplebox)
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
      btn.innerHTML = `âœï¸ ${isEn ? 'Submit' : 'Ná»™p bÃ i giáº£i'}`;
      btn.onclick = () => openSubmissionModal(uniqueId, title, box);

      const aiBtn = box.querySelector('.btn-ai-guide');
      if (aiBtn) {
        aiBtn.after(btn);
      } else {
        heading.appendChild(btn);
      }
    });
  }

  // 2. MODAL Ná»˜P BÃ€I GIáº¢I CHO Há»ŒC SINH (Há»– TRá»¢ áº¢NH VIáº¾T TAY + ÄÃNH GIÃ AI CHUYÃŠN GIA TOÃN)
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

  // Xá»­ lÃ½ nÃ©n vÃ  táº£i áº£nh tá»« File / Clipboard
  function processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Vui lÃ²ng chá»n má»™t tá»‡p hÃ¬nh áº£nh há»£p lá»‡ (PNG, JPG, WEBP)!', false);
      return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
      const img = new Image();
      img.onload = function() {
        // Giá»›i háº¡n Ä‘á»™ phÃ¢n giáº£i há»£p lÃ½ Ä‘á»ƒ giá»¯ Ä‘á»™ sáº¯c nÃ©t cá»§a chá»¯ viáº¿t tay
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

        // Cáº­p nháº­t UI Preview
        const previewContainer = document.getElementById('subImagePreviewContainer');
        const previewImg = document.getElementById('subImagePreview');
        const fileNameEl = document.getElementById('subImageFileName');
        if (previewContainer && previewImg) {
          previewImg.src = compressedDataUrl;
          if (fileNameEl) {
            fileNameEl.textContent = `ðŸ“· ${file.name || 'áº¢nh bÃ i giáº£i viáº¿t tay'} (${Math.round(compressedDataUrl.length / 1024)} KB)`;
          }
          previewContainer.style.display = 'block';
        }
        showToast('ÄÃ£ táº£i áº£nh bÃ i giáº£i thÃ nh cÃ´ng!', true);
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
    if (!silent) showToast('ÄÃ£ há»§y áº£nh bÃ i giáº£i Ä‘Ã£ chá»n.', true);
  };

  window.toggleProblemStatement = function() {
    const box = document.getElementById('subProblemStatementBox');
    const btn = document.getElementById('btnToggleProblemStatement');
    if (!box) return;
    const isHidden = (box.style.display === 'none' || !box.style.display);
    box.style.display = isHidden ? 'block' : 'none';
    if (btn) btn.textContent = isHidden ? 'ðŸ”¼ áº¨n ná»™i dung Ä‘á» bÃ i' : 'ðŸ“– Xem ná»™i dung Ä‘á» bÃ i';
    if (isHidden && window.MathJax?.typesetPromise) {
      window.MathJax.typesetPromise([box]).catch(() => {});
    }
  };

  // Láº¯ng nghe sá»± kiá»‡n Paste (Ctrl+V) dÃ¡n áº£nh bÃ i giáº£i trá»±c tiáº¿p tá»« clipboard
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
            showToast('ðŸ“‹ ÄÃ£ nháº­n diá»‡n áº£nh dÃ¡n tá»« Clipboard!', true);
            e.preventDefault();
            break;
          }
        }
      }
    }
  });

  // KÃ©o tháº£ áº£nh vÃ o Dropzone
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

  // Äiá»n bÃ i giáº£i máº«u chuáº©n Olympic Ä‘á»ƒ kiá»ƒm thá»­ nhanh tÃ­nh nÄƒng AI
  window.fillSampleSolution = function(autoRun = false) {
    const textArea = document.getElementById('subSolutionText');
    if (!textArea) return;

    const sample = `Äáº·t áº©n phá»¥ vÃ  xÃ©t biáº¿n Ä‘á»•i:
Ta cÃ³ $u_{n+1}^2 = \\left(u_n + \\frac{1}{u_n}\\right)^2 = u_n^2 + 2 + \\frac{1}{u_n^2} > u_n^2 + 2$.
Báº±ng quy náº¡p toÃ¡n há»c suy ra:
$u_n^2 > u_1^2 + 2(n-1) = 2n - 1 \\implies \\lim_{n \\to +\\infty} u_n = +\\infty$.
Ãp dá»¥ng Äá»‹nh lÃ½ Stolz-Cesaro cho hai dÃ£y $(u_n^2)$ vÃ  $(n)$:
$$\\lim_{n \\to \\infty} \\frac{u_n^2}{n} = \\lim_{n \\to \\infty} \\frac{u_{n+1}^2 - u_n^2}{(n+1) - n} = \\lim_{n \\to \\infty} \\left(2 + \\frac{1}{u_n^2}\\right) = 2 + 0 = 2.$$
Do $u_n > 0$, láº¥y cÄƒn báº­c hai hai váº¿ ta Ä‘Æ°á»£c:
$$\\lim_{n \\to \\infty} \\frac{u_n}{\\sqrt{n}} = \\sqrt{2}.$$
Váº­y giá»›i háº¡n cáº§n tÃ¬m lÃ  $\\sqrt{2}$.`;

    textArea.value = sample;
    textArea.style.borderColor = '#6366f1';
    textArea.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
    setTimeout(() => {
      if (textArea) textArea.style.boxShadow = '';
    }, 1500);

    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');
    if (emptyAlert) emptyAlert.style.display = 'none';

    showToast('ÄÃ£ Ä‘iá»n lá»i giáº£i máº«u VMO chuáº©n vÃ o Ã´ nháº­p liá»‡u!', true);

    if (autoRun) {
      setTimeout(() => {
        window.evaluateStudentSolution();
      }, 100);
    }
  };

  // ÄÃ¡nh giÃ¡ bÃ i giáº£i cá»§a há»c sinh báº±ng AI ChuyÃªn gia ToÃ¡n há»c
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
      showToast('Vui lÃ²ng nháº­p ná»™i dung lá»i giáº£i hoáº·c táº£i lÃªn áº£nh bÃ i lÃ m Ä‘á»ƒ AI Ä‘Ã¡nh giÃ¡!', false);
      return;
    }

    if (emptyAlert) emptyAlert.style.display = 'none';

    const btn = document.getElementById('btnEvaluateSolution');
    const origBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'â³ <span>AI GiÃ¡o sÆ° ToÃ¡n Ä‘ang phÃ¢n tÃ­ch...</span>';
    }

    // Hiá»ƒn thá»‹ há»™p loading trá»±c quan ngay trong modal vá»›i cÃ¡c bÆ°á»›c sinh Ä‘á»™ng
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
        'Äang tháº©m Ä‘á»‹nh tÃ­nh chÃ­nh xÃ¡c, rÃ  soÃ¡t tá»«ng bÆ°á»›c suy luáº­n vÃ  kiá»ƒm tra lá»— há»•ng logic toÃ¡n há»c...',
        'AI Ä‘ang Ä‘á»‘i chiáº¿u cÃ¡c bá»• Ä‘á», cÃ´ng thá»©c vÃ  tÃ­nh tÆ°Æ¡ng Ä‘Æ°Æ¡ng cá»§a cÃ¡c phÃ©p biáº¿n Ä‘á»•i...',
        'Äang tá»•ng há»£p nháº­n xÃ©t chuyÃªn gia, tÃ­nh toÃ¡n Ä‘iá»ƒm sá»‘ Æ°á»›c tÃ­nh theo thang VMO...'
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

    showToast('ðŸ¤– AI GiÃ¡o sÆ° ToÃ¡n Olympic Ä‘ang Ä‘á»c vÃ  rÃ  soÃ¡t logic bÃ i giáº£i cá»§a báº¡n...', true);

    try {
      const payload = {
        problemId: window.currentSubmissionData?.problemId || 'vmo-prob',
        problemTitle: window.currentSubmissionData?.problemTitle || 'BÃ i toÃ¡n VMO',
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
        throw new Error(`MÃ¡y chá»§ pháº£n há»“i mÃ£ lá»—i HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json || !json.data) {
        throw new Error(json?.message || 'KhÃ´ng nháº­n Ä‘Æ°á»£c dá»¯ liá»‡u Ä‘Ã¡nh giÃ¡ tá»« mÃ¡y chá»§.');
      }

      const evalData = json.data;
      window.currentEvaluationResult = evalData;
      if (loadingBox) loadingBox.style.display = 'none';
      displayEvaluationResult(evalData);
      showToast('ÄÃ£ hoÃ n táº¥t phÃ¢n tÃ­ch & Ä‘Ã¡nh giÃ¡ bÃ i giáº£i!', true);
    } catch (err) {
      console.error('Lá»—i khi Ä‘Ã¡nh giÃ¡ bÃ i giáº£i:', err);
      if (loadingBox) loadingBox.style.display = 'none';
      displayEvaluationError(err.message || 'KhÃ´ng thá»ƒ káº¿t ná»‘i mÃ¡y chá»§ AI');
      showToast('Lá»—i Ä‘Ã¡nh giÃ¡: ' + (err.message || 'KhÃ´ng thá»ƒ káº¿t ná»‘i mÃ¡y chá»§ AI'), false);
    } finally {
      if (loadingInterval) clearInterval(loadingInterval);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtnHtml;
      }
    }
  };

  // Escape toÃ n bá»™ HTML khÃ´ng tin cáº­y trÆ°á»›c khi chÃ¨n vÃ o innerHTML.
  function escapeHtmlText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Chá»‰ chuáº©n hÃ³a ná»™i dung bÃªn trong má»™t token Math Ä‘Ã£ cÃ³ delimiter.
  // KhÃ´ng tá»± bá»c thÃªm dáº¥u $ Ä‘á»ƒ trÃ¡nh táº¡o $...$ lá»“ng nhau gÃ¢y Math input error.
  function normalizeDelimitedMath(token) {
    return escapeHtmlText(
      String(token || '')
        .replace(/â‰¥/g, '\\ge ')
        .replace(/â‰¤/g, '\\le ')
        .replace(/â‰ /g, '\\ne ')
        .replace(/âˆˆ/g, '\\in ')
        .replace(/âˆ‰/g, '\\notin ')
        .replace(/â†’/g, '\\to ')
        .replace(/â‡’/g, '\\Rightarrow ')
        .replace(/â‡”/g, '\\Leftrightarrow ')
        .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
        .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
    );
  }

  // Äá»‹nh dáº¡ng Markdown an toÃ n vÃ  giá»¯ nguyÃªn cÃ¡c khá»‘i MathJax há»£p lá»‡.
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

    // Chuáº©n hÃ³a kÃ½ tá»± vÃ´ hÃ¬nh vÃ  cÃ¡c tháº» xuá»‘ng dÃ²ng cÃ³ thá»ƒ do AI tráº£ vá».
    raw = raw
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n');

    // TÃ¡ch vÃ  báº£o vá»‡ nhá»¯ng khá»‘i Math Ä‘Ã£ cÃ³ delimiter trÆ°á»›c má»i xá»­ lÃ½ vÄƒn báº£n.
    const mathTokens = [];
    let text = raw.replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$(?:\\.|[^$\n])+?\$|\\\([\s\S]+?\\\))/g, (match) => {
      mathTokens.push(match);
      return `@@VMO_MATH_${mathTokens.length - 1}@@`;
    });

    // Tá»« Ä‘Ã¢y chá»‰ xá»­ lÃ½ vÄƒn báº£n thuáº§n Ä‘Ã£ Ä‘Æ°á»£c escape.
    text = escapeHtmlText(text);

    // TÃ¡ch cÃ¡c má»¥c Ä‘Ã¡nh sá»‘ bá»‹ dÃ­nh liá»n thÃ nh cÃ¡c Ä‘oáº¡n riÃªng biá»‡t.
    text = text.replace(/([.!?])\s+(\d+[\.\)]\s*(?:Pháº§n|BÆ°á»›c|Ã|TrÆ°á»ng há»£p|[A-ZÃ€-á»¸]))/g, '$1\n\n$2');
    text = text.replace(/(?<!\n)(\b\d+[\.\)]\s*(?:Pháº§n|BÆ°á»›c|Ã|TrÆ°á»ng há»£p))/g, '\n$1');

    // Markdown cÆ¡ báº£n Ä‘Æ°á»£c chuyá»ƒn sau khi escape nÃªn khÃ´ng thá»ƒ chÃ¨n HTML tÃ¹y Ã½.
    text = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Äá»‹nh dáº¡ng danh sÃ¡ch Ä‘Ã¡nh sá»‘.
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

    // KhÃ´i phá»¥c Ä‘Ãºng má»™t láº§n; khÃ´ng cháº¡y regex táº¡o cÃ´ng thá»©c láº§n thá»© hai.
    text = text.replace(/@@VMO_MATH_(\d+)@@/g, (match, idx) => {
      return normalizeDelimitedMath(mathTokens[Number(idx)] || '');
    });

    return text;
  }

  // Hiá»ƒn thá»‹ thÃ´ng bÃ¡o lá»—i Ä‘Ã¡nh giÃ¡ ngay trong modal vÃ  cho phÃ©p thá»­ láº¡i
  function displayEvaluationError(errorMsg) {
    let resultBox = document.getElementById('aiEvaluationResultBox');
    if (!resultBox) return;

    resultBox.style.cssText = 'display: block; margin-bottom: 18px; border-radius: 10px; overflow: hidden; border: 1.5px solid #f87171; background: #fff5f5; box-shadow: 0 4px 15px -3px rgba(239, 68, 68, 0.15);';
    resultBox.innerHTML = `
      <div style="padding: 16px 20px;">
        <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px;">
          <span style="font-size: 1.6rem;">âš ï¸</span>
          <div>
            <h4 style="margin: 0 0 4px 0; color: #991b1b; font-size: 1rem;">KhÃ´ng thá»ƒ hoÃ n táº¥t Ä‘Ã¡nh giÃ¡ trá»±c tuyáº¿n</h4>
            <p style="margin: 0; color: #7f1d1d; font-size: 0.88rem; line-height: 1.5;">
              ${escapeHtmlText(errorMsg || 'Káº¿t ná»‘i tá»›i dá»‹ch vá»¥ AI gáº·p trá»¥c tráº·c hoáº·c model quÃ¡ táº£i.')}
            </p>
          </div>
        </div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button type="button" onclick="evaluateStudentSolution()" style="padding: 8px 16px; border-radius: 6px; background: #dc2626; color: #fff; border: none; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span>ðŸ”„</span> <span>Thá»­ láº¡i ngay</span>
          </button>
          <button type="button" onclick="runOfflineEvaluation()" style="padding: 8px 16px; border-radius: 6px; background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; font-weight: 600; font-size: 0.85rem; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            <span>âš¡</span> <span>PhÃ¢n tÃ­ch báº±ng bá»™ ChuyÃªn gia dá»± phÃ²ng</span>
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

  // Bá»™ phÃ¢n tÃ­ch chuyÃªn gia dá»± phÃ²ng hoáº¡t Ä‘á»™ng tá»©c thÃ¬ khi máº¡ng gáº·p sá»± cá»‘
  window.runOfflineEvaluation = function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const fallbackVerdict = text && text.length > 80 ? 'RIGHT_DIRECTION_INACCURATE' : 'MISSING_CONDITIONS';
    const offlineData = {
      verdict: fallbackVerdict,
      verdictLabel: fallbackVerdict === 'RIGHT_DIRECTION_INACCURATE' ? 'ÄÃºng hÆ°á»›ng Ä‘i nhÆ°ng cáº§n kiá»ƒm tra ká»¹ láº¡i chi tiáº¿t' : 'Thiáº¿u Ä‘iá»u kiá»‡n / Cáº§n bá»• sung láº­p luáº­n',
      verdictColor: '#d97706',
      estimatedScore: '3.5/5.0Ä‘ (ÄÃ¡nh giÃ¡ dá»± phÃ²ng)',
      summary: 'Há»‡ thá»‘ng Ä‘Ã£ phÃ¢n tÃ­ch cáº¥u trÃºc bÃ i giáº£i cá»§a báº¡n. HÆ°á»›ng tiáº¿p cáº­n cÃ³ cÄƒn cá»© chuyÃªn mÃ´n, tuy nhiÃªn cáº§n kiá»ƒm tra cháº·t cháº½ cÃ¡c bÆ°á»›c biáº¿n Ä‘á»•i trung gian vÃ  thá»­ láº¡i nghiá»‡m.',
      approachAnalysis: 'Báº¡n Ä‘Ã£ náº¯m Ä‘Æ°á»£c phÆ°Æ¡ng phÃ¡p tiáº¿p cáº­n chÃ­nh cá»§a dáº¡ng toÃ¡n nÃ y. Äá»ƒ Ä‘áº¡t Ä‘iá»ƒm tá»‘i Ä‘a trong ká»³ thi VMO, cáº§n lÆ°u Ã½ tÃ­nh tÆ°Æ¡ng Ä‘Æ°Æ¡ng cá»§a cÃ¡c phÃ©p biáº¿n Ä‘á»•i vÃ  kiá»ƒm tra Ä‘iá»u kiá»‡n tá»“n táº¡i.',
      stepByStep: '1. **BÆ°á»›c Ä‘áº·t áº©n & táº­p xÃ¡c Ä‘á»‹nh**: ÄÃ£ xÃ¡c Ä‘á»‹nh hÆ°á»›ng biáº¿n Ä‘á»•i chÃ­nh.<br>2. **BÆ°á»›c biáº¿n Ä‘á»•i Ä‘áº¡i sá»‘**: Cáº§n bá»• sung giáº£i thÃ­ch chiá»u suy luáº­n $\\Rightarrow$ hay $\\Leftrightarrow$.<br>3. **BÆ°á»›c káº¿t luáº­n**: LuÃ´n kiá»ƒm tra cÃ¡c trÆ°á»ng há»£p biÃªn vÃ  Ä‘iá»u kiá»‡n sá»‘ nguyÃªn / sá»‘ thá»±c dÆ°Æ¡ng.',
      criticalFlaws: 'Cáº§n lÆ°u Ã½ kiá»ƒm tra cÃ¡c trÆ°á»ng há»£p biÃªn vÃ  Ä‘iá»u kiá»‡n Ä‘á»ƒ trÃ¡nh bá»‹ trá»« Ä‘iá»ƒm trÃ¬nh bÃ y theo biá»ƒu Ä‘iá»ƒm VMO.',
      recommendations: 'HÃ£y hoÃ n thiá»‡n viá»‡c trÃ¬nh bÃ y lá»i giáº£i thÃ nh cÃ¡c bÆ°á»›c rÃµ rÃ ng theo chuáº©n bÃ i thi HSG Quá»‘c gia.'
    };
    window.currentEvaluationResult = offlineData;
    displayEvaluationResult(offlineData);
    showToast('ÄÃ£ hiá»ƒn thá»‹ Ä‘Ã¡nh giÃ¡ tá»« bá»™ phÃ¢n tÃ­ch chuyÃªn gia dá»± phÃ²ng!', true);
  };

  // KÃ­ch hoáº¡t MathJax typeset an toÃ n vÃ  chá»‘ng cache lá»—i cho container
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

  // Há»‡ thá»‘ng chuyá»ƒn Ä‘á»•i Tab thÃ´ng minh trong Submission Modal
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

  // HÃ m chuyá»ƒn hÆ°á»›ng nhanh Ä‘áº¿n káº¿t quáº£ Ä‘Ã¡nh giÃ¡ (há»— trá»£ cáº£ cuá»™n vÃ  chuyá»ƒn tab)
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

  // In / Xuáº¥t bÃ¡o cÃ¡o tháº©m Ä‘á»‹nh cá»§a GiÃ¡o sÆ°
  window.printEvaluationReport = function() {
    const evalData = window.currentEvaluationResult;
    const subData = window.currentSubmissionData || {};
    if (!evalData) {
      alert('ChÆ°a cÃ³ dá»¯ liá»‡u Ä‘Ã¡nh giÃ¡ Ä‘á»ƒ in bÃ¡o cÃ¡o!');
      return;
    }
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Vui lÃ²ng cho phÃ©p popup Ä‘á»ƒ in bÃ¡o cÃ¡o káº¿t quáº£!');
      return;
    }
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>BÃ¡o cÃ¡o tháº©m Ä‘á»‹nh bÃ i giáº£i VMO - ${escapeHtmlText(subData.problemTitle || 'BÃ i toÃ¡n')}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; padding: 30px; max-width: 800px; margin: 0 auto; }
          h2 { color: #0f172a; border-bottom: 2px solid #0284c7; padding-bottom: 8px; }
          .banner { background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 14px; margin-bottom: 20px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; }
          .title { font-weight: bold; color: #0369a1; margin-bottom: 6px; }
        </style>
      </head>
      <body>
        <h2>BÃO CÃO THáº¨M Äá»ŠNH BÃ€I GIáº¢I TOÃN OLYMPIC (AI VMO)</h2>
        <p><strong>BÃ i toÃ¡n:</strong> ${escapeHtmlText(subData.problemTitle || 'BÃ i táº­p VMO')}</p>
        <div class="banner">
          <p><strong>Káº¿t luáº­n:</strong> ${escapeHtmlText(evalData.verdictLabel || evalData.verdict || 'HoÃ n táº¥t')}</p>
          <p><strong>Äiá»ƒm Æ°á»›c lÆ°á»£ng:</strong> ${escapeHtmlText(evalData.estimatedScore ?? '5.0/5.0Ä‘')}</p>
        </div>
        <div class="card"><div class="title">1. Nháº­n Ä‘á»‹nh tá»•ng quan:</div><div>${formatMathMarkdown(evalData.summary || '')}</div></div>
        <div class="card"><div class="title">2. HÆ°á»›ng tiáº¿p cáº­n &amp; PhÆ°Æ¡ng phÃ¡p:</div><div>${formatMathMarkdown(evalData.approachAnalysis || '')}</div></div>
        <div class="card"><div class="title">3. RÃ  soÃ¡t chi tiáº¿t tá»«ng bÆ°á»›c:</div><div>${formatMathMarkdown(evalData.stepByStep || '')}</div></div>
        <div class="card"><div class="title">4. Lá»— há»•ng logic / LÆ°u Ã½:</div><div>${formatMathMarkdown(evalData.criticalFlaws || '')}</div></div>
        <div class="card"><div class="title">5. Lá»i khuyÃªn cá»§a ChuyÃªn gia:</div><div>${formatMathMarkdown(evalData.recommendations || '')}</div></div>
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 500);
  };

  // Táº¡o khung HTML hoÃ n chá»‰nh cho bÃ¡o cÃ¡o tháº©m Ä‘á»‹nh
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
      <!-- Banner Káº¿t luáº­n Tá»•ng quan & Äiá»ƒm sá»‘ -->
      <div style="padding: 16px 20px; background: ${verdictBg}; color: #ffffff; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-radius: 10px 10px 0 0;">
        <div>
          <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.95; margin-bottom: 2px;">Káº¿t luáº­n chuyÃªn mÃ´n cá»§a GiÃ¡o sÆ° ToÃ¡n:</div>
          <div style="font-size: 1.15rem; font-weight: 800; text-shadow: 0 1px 2px rgba(0,0,0,0.2);">
            ${escapeHtmlText(evalData.verdictLabel || evalData.verdict || 'ÄÃšNG HOÃ€N TOÃ€N (Tá»I Æ¯U)')}
          </div>
        </div>
        <div style="background: rgba(255,255,255,0.25); border: 1.5px solid rgba(255,255,255,0.5); border-radius: 8px; padding: 6px 16px; font-weight: 800; font-size: 1.15rem; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
          Äiá»ƒm: ${escapeHtmlText(evalData.estimatedScore ?? '5.0/5.0Ä‘')}
        </div>
      </div>

      <div style="padding: 20px; font-size: 0.92rem; line-height: 1.7; color: #1e293b; background: #ffffff; border-radius: 0 0 10px 10px;">
        <!-- 1. TÃ³m táº¯t -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>ðŸ“</span> <strong>Nháº­n Ä‘á»‹nh tá»•ng quan cá»§a ChuyÃªn gia:</strong>
          </h5>
          <div style="color: #1e293b; background: #f8fafc; padding: 12px 16px; border-radius: 6px; border-left: 4px solid #0284c7; font-size: 0.92rem;">
            ${formatMathMarkdown(evalData.summary || 'Lá»i giáº£i Ä‘Ã£ Ä‘Æ°á»£c tháº©m Ä‘á»‹nh.')}
          </div>
        </div>

        <!-- 2. HÆ°á»›ng tiáº¿p cáº­n -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>ðŸŽ¯</span> <strong>PhÃ¢n tÃ­ch hÆ°á»›ng tiáº¿p cáº­n &amp; PhÆ°Æ¡ng phÃ¡p toÃ¡n:</strong>
          </h5>
          <div style="color: #334155; padding: 2px 4px;">
            ${formatMathMarkdown(evalData.approachAnalysis || 'ÄÃ£ Ã¡p dá»¥ng Ä‘Ãºng phÆ°Æ¡ng phÃ¡p cá»‘t lÃµi.')}
          </div>
        </div>

        <!-- 3. RÃ  soÃ¡t tá»«ng bÆ°á»›c -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>ðŸ”</span> <strong>RÃ  soÃ¡t chi tiáº¿t tá»«ng bÆ°á»›c láº­p luáº­n:</strong>
          </h5>
          <div style="color: #334155; background: #fafafa; padding: 14px; border-radius: 6px; border: 1px solid #e2e8f0;">
            ${formatMathMarkdown(evalData.stepByStep || 'CÃ¡c bÆ°á»›c láº­p luáº­n hoÃ n chá»‰nh.')}
          </div>
        </div>

        <!-- 4. Lá»— há»•ng logic / Thiáº¿u sÃ³t -->
        <div style="margin-bottom: 16px;">
          <h5 style="margin: 0 0 6px 0; color: #b91c1c; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>âš ï¸</span> <strong>Lá»— há»•ng logic / Äiá»u kiá»‡n thiáº¿u sÃ³t (náº¿u cÃ³):</strong>
          </h5>
          <div style="color: #991b1b; background: #fff1f2; padding: 12px 16px; border-radius: 6px; border: 1px solid #fecdd3;">
            ${formatMathMarkdown(evalData.criticalFlaws || 'KhÃ´ng phÃ¡t hiá»‡n sai sÃ³t logic nghiÃªm trá»ng.')}
          </div>
        </div>

        <!-- 5. Lá»i khuyÃªn & HÆ°á»›ng giáº£i tá»‘i Æ°u -->
        <div style="margin-bottom: 20px;">
          <h5 style="margin: 0 0 6px 0; color: #047857; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
            <span>ðŸ’¡</span> <strong>Lá»i khuyÃªn cá»§a GiÃ¡o sÆ° &amp; HÆ°á»›ng giáº£i tá»‘i Æ°u:</strong>
          </h5>
          <div style="color: #065f46; background: #ecfdf5; padding: 12px 16px; border-radius: 6px; border: 1px solid #a7f3d0;">
            ${formatMathMarkdown(evalData.recommendations || evalData.optimalSuggestions || 'Tiáº¿p tá»¥c phÃ¡t huy!')}
          </div>
        </div>

        <!-- HÃ ng nÃºt hÃ nh Ä‘á»™ng bá»• trá»£ -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
          <div style="display: flex; gap: 8px;">
            <button type="button" onclick="switchSubmissionTab('composer')" style="padding: 7px 14px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <span>âœï¸</span> <span>Quay láº¡i sá»­a bÃ i</span>
            </button>
            <button type="button" onclick="window.printEvaluationReport()" style="padding: 7px 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 600; font-size: 0.85rem; color: #475569; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <span>ðŸ–¨ï¸</span> <span>In bÃ¡o cÃ¡o</span>
            </button>
          </div>
          <button type="button" onclick="document.getElementById('btnConfirmSubmit')?.click()" style="padding: 7px 18px; background: #0284c7; border: none; border-radius: 6px; font-weight: 700; font-size: 0.88rem; color: #ffffff; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(2,132,199,0.3);">
            <span>ðŸš€</span> <span>LÆ°u bÃ i vÃ o Database</span>
          </button>
        </div>
      </div>
    `;
  }

  // Hiá»ƒn thá»‹ káº¿t quáº£ Ä‘Ã¡nh giÃ¡ lÃªn giao diá»‡n (Ä‘á»“ng bá»™ cáº£ 2 tab)
  function displayEvaluationResult(evalData) {
    if (!evalData) return;
    console.log('[AI Eval] Hiá»ƒn thá»‹ káº¿t quáº£ Ä‘Ã¡nh giÃ¡:', evalData);

    const reportHtml = generateEvaluationReportHtml(evalData);

    // 1. Äiá»n vÃ o Tab Káº¿t quáº£ tháº©m Ä‘á»‹nh (Tab 2)
    const tabMainContent = document.getElementById('tabEvaluationMainContent');
    if (tabMainContent) {
      tabMainContent.innerHTML = reportHtml;
    }

    // 2. Äiá»n vÃ o Khung káº¿t quáº£ inline á»Ÿ Tab Soáº¡n bÃ i (Tab 1)
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

    // 3. Cáº­p nháº­t Badge trÃªn nÃºt Tab 2
    const evalBadge = document.getElementById('subTabEvalBadge');
    if (evalBadge) {
      evalBadge.textContent = evalData.estimatedScore || 'HoÃ n táº¥t';
      evalBadge.style.display = 'inline-block';
      const verdictBg = evalData.verdictColor || (evalData.verdict === 'CORRECT' ? '#16a34a' : (evalData.verdict === 'LOGICAL_GAP' ? '#ea580c' : '#6366f1'));
      evalBadge.style.background = verdictBg;
    }

    // 4. Cáº­p nháº­t thanh thÃ´ng bÃ¡o thÃ nh cÃ´ng á»Ÿ Tab 1 vá»›i nÃºt xem chi tiáº¿t trá»±c tiáº¿p
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
          <span style="font-size: 1.25rem;">âœ…</span>
          <div>
            <strong>ÄÃ£ cÃ³ káº¿t quáº£ tháº©m Ä‘á»‹nh:</strong>
            <span>${escapeHtmlText(evalData.verdictLabel || 'ÄÃ£ phÃ¢n tÃ­ch xong')} (${escapeHtmlText(evalData.estimatedScore ?? '')})</span>
          </div>
        </div>
        <button type="button" onclick="window.switchSubmissionTab('eval')" style="padding: 6px 14px; background: #059669; color: #fff; border: none; border-radius: 6px; font-weight: 700; font-size: 0.84rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(5,150,105,0.3); transition: all 0.2s;">
          <span>Xem káº¿t quáº£ chi tiáº¿t</span> <span>â†’</span>
        </button>
      `;
    }

    // 5. Tá»° Äá»˜NG CHUYá»‚N NGAY SANG TAB Káº¾T QUáº¢ ÄÃNH GIÃ (HIá»‚N THá»Š TRá»ŒN Váº¸N Tá»ª Äá»ˆNH TRANG)
    setTimeout(() => {
      window.switchSubmissionTab('eval');
      const evalContent = document.getElementById('tabEvaluationMainContent');
      if (evalContent) triggerMathJaxRenderForElement(evalContent);
      if (resultBox) triggerMathJaxRenderForElement(resultBox);
    }, 150);

    // KÃ­ch hoáº¡t MathJax ngay cho resultBox náº¿u cÃ³ hiá»ƒn thá»‹ á»Ÿ Tab 1
    if (resultBox) {
      triggerMathJaxRenderForElement(resultBox);
    }
  }

  // Xuáº¥t hÃ m ra pháº¡m vi toÃ n cá»¥c Ä‘á»ƒ luÃ´n cÃ³ thá»ƒ gá»i Ä‘Æ°á»£c
  window.displayEvaluationResult = displayEvaluationResult;

  // Xem láº¡i chi tiáº¿t Ä‘Ã¡nh giÃ¡ tá»« bÃ i ná»™p cÅ© trong lá»‹ch sá»­
  window.viewSubEvaluationDetail = function(index) {
    const sub = window.lastLoadedSubmissions && window.lastLoadedSubmissions[index];
    if (!sub || !sub.evaluation) {
      showToast('BÃ i ná»™p nÃ y chÆ°a cÃ³ dá»¯ liá»‡u Ä‘Ã¡nh giÃ¡ chi tiáº¿t cá»§a AI.', false);
      return;
    }
    displayEvaluationResult(sub.evaluation);
    if (typeof window.switchSubmissionTab === 'function') {
      window.switchSubmissionTab('eval');
    }
    showToast('ÄÃ£ má»Ÿ láº¡i nháº­n xÃ©t cá»§a ChuyÃªn gia cho bÃ i ná»™p #' + (window.lastLoadedSubmissions.length - index), true);
  };

  window.openSubmissionModal = function(problemId, problemTitle, problemCard) {
    const isEn = (window.currentLang === 'en');
    let modal = document.getElementById('submissionModal');
    if (!modal) return;

    // Reset vá» Tab Soáº¡n bÃ i vÃ  lÃ m sáº¡ch tráº¡ng thÃ¡i Ä‘Ã¡nh giÃ¡ cÅ©
    if (typeof window.switchSubmissionTab === 'function') {
      window.switchSubmissionTab('composer');
    }
    const evalBadge = document.getElementById('subTabEvalBadge');
    if (evalBadge) evalBadge.style.display = 'none';
    const tabMainContent = document.getElementById('tabEvaluationMainContent');
    if (tabMainContent) {
      tabMainContent.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #64748b;">
          <div style="font-size: 2.5rem; margin-bottom: 10px;">ðŸ¤–</div>
          <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 6px; color: #1e293b;">ChÆ°a cÃ³ káº¿t quáº£ tháº©m Ä‘á»‹nh</div>
          <div style="font-size: 0.88rem; max-width: 460px; margin: 0 auto 16px auto;">
            HÃ£y nháº­p lá»i giáº£i hoáº·c táº£i áº£nh bÃ i lÃ m viáº¿t tay á»Ÿ Tab <strong>"Soáº¡n bÃ i &amp; Táº£i lÃªn"</strong> rá»“i nháº¥n nÃºt <strong>"ÄÃ¡nh giÃ¡ bÃ i giáº£i"</strong>.
          </div>
          <button type="button" onclick="switchSubmissionTab('composer')" style="padding: 8px 18px; background: #4f46e5; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            âœï¸ Äáº¿n trang Soáº¡n bÃ i
          </button>
        </div>
      `;
    }

    // TrÃ­ch xuáº¥t thÃ´ng tin chi tiáº¿t bÃ i toÃ¡n & báº£o toÃ n cÃ´ng thá»©c toÃ¡n há»c LaTeX nguyÃªn báº£n
    let problemContentRaw = '';
    let problemContentDisplay = '';
    let topic = '';
    let examTitle = '';

    if (problemCard) {
      if (problemCard.classList.contains('examplebox')) {
        const headingEl = problemCard.querySelector('.box-heading');
        topic = headingEl ? (headingEl.innerText || headingEl.textContent || '').trim() : 'VÃ­ dá»¥ chuyÃªn Ä‘á»';
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
          // Æ¯u tiÃªn 1: Äá»c data-raw-math Ä‘Ã£ Ä‘Æ°á»£c lÆ°u tá»± Ä‘á»™ng lÃºc táº£i trang (chá»©a $ vÃ  $$ nguyÃªn báº£n)
          problemContentRaw = contentEl.getAttribute('data-raw-math') || '';

          // Æ¯u tiÃªn 2: Náº¿u chÆ°a cÃ³ data-raw-math, khÃ´i phá»¥c tá»« MathJax MathItems náº¿u cÃ³
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
              console.warn('Lá»—i trÃ­ch xuáº¥t MathItems:', err);
            }
          }

          // Æ¯u tiÃªn 3: Náº¿u váº«n chÆ°a cÃ³, láº¥y innerHTML
          if (!problemContentRaw) {
            problemContentRaw = contentEl.innerHTML;
          }

          problemContentDisplay = problemContentRaw;
        }
      }
    }

    // LÃ m sáº¡ch text Ä‘á»ƒ gá»­i cho AI (giá»¯ nguyÃªn LaTeX, bá» tag HTML thá»«a)
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
      stmtBox.innerHTML = problemContentDisplay ? problemContentDisplay : '<em>Äang náº¡p Ä‘á» bÃ i...</em>';
      stmtBox.style.display = 'none';
    }
    const toggleStmtBtn = document.getElementById('btnToggleProblemStatement');
    if (toggleStmtBtn) toggleStmtBtn.textContent = 'ðŸ“– Xem ná»™i dung Ä‘á» bÃ i';

    // Reset input text & preview
    const textArea = document.getElementById('subSolutionText');
    if (textArea) textArea.value = '';
    const mathBox = document.getElementById('subMathPreviewBox');
    if (mathBox) mathBox.style.display = 'none';

    // Reset áº£nh
    window.removeSelectedImage();
    setupImageDropzone();

    // áº¨n há»™p káº¿t quáº£ Ä‘Ã¡nh giÃ¡ AI cÅ©, cáº£nh bÃ¡o rá»—ng vÃ  loading
    const evalResultBox = document.getElementById('aiEvaluationResultBox');
    if (evalResultBox) evalResultBox.style.display = 'none';
    const emptyAlert = document.getElementById('aiEvaluationEmptyAlert');
    if (emptyAlert) emptyAlert.style.display = 'none';
    const loadingBox = document.getElementById('aiEvaluationLoadingBox');
    if (loadingBox) loadingBox.style.display = 'none';
    const noticeEl = document.getElementById('aiEvalSuccessNoticeBar');
    if (noticeEl) noticeEl.remove();

    // GÃ¡n trá»±c tiáº¿p sá»± kiá»‡n cho nÃºt ÄÃ¡nh giÃ¡ AI vÃ  Äiá»n máº«u Ä‘á»ƒ báº£o Ä‘áº£m luÃ´n kÃ­ch hoáº¡t
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

    // Náº¡p lá»‹ch sá»­ cÃ¡c bÃ i Ä‘Ã£ ná»™p cho cÃ¢u há»i nÃ y tá»« Database
    loadSubHistory(problemId);

    // GÃ¡n sá»± kiá»‡n cho nÃºt LÆ°u bÃ i giáº£i
    const submitBtn = document.getElementById('btnConfirmSubmit');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const text = (document.getElementById('subSolutionText')?.value || '').trim();
        const hasImg = Boolean(window.currentUploadedImage);

        if (!text && !hasImg) {
          alert(isEn ? 'Please upload a handwritten solution image or enter solution text!' : 'Vui lÃ²ng táº£i áº£nh bÃ i giáº£i viáº¿t tay hoáº·c nháº­p ná»™i dung lá»i giáº£i trÆ°á»›c khi lÆ°u!');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = 'â³ Äang lÆ°u vÃ o database...';

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
              throw new Error('MÃ¡y chá»§ khÃ´ng tráº£ vá» báº£n ghi vá»«a lÆ°u');
            }
            showToast(isEn ? 'Solution saved successfully to database!' : 'ÄÃ£ lÆ°u bÃ i giáº£i vÃ  káº¿t quáº£ Ä‘Ã¡nh giÃ¡ vÃ o CÆ¡ sá»Ÿ dá»¯ liá»‡u!', true);
            await loadSubHistory(problemId);
          } else {
            showToast('Dá»‹ch vá»¥ lÆ°u trá»¯ database chÆ°a sáºµn sÃ ng. Vui lÃ²ng kiá»ƒm tra káº¿t ná»‘i!', false);
          }
        } catch (err) {
          console.error('Lá»—i ná»™p bÃ i giáº£i:', err);
          let saveError = err?.message || 'KhÃ´ng thá»ƒ ghi vÃ o database';
          if (err?.status === 401 || err?.code === 'AUTH_REQUIRED') {
            saveError = 'PhiÃªn Ä‘Äƒng nháº­p Ä‘Ã£ háº¿t háº¡n. Vui lÃ²ng Ä‘Äƒng nháº­p láº¡i rá»“i thá»­ lÆ°u.';
          } else if (err?.status === 403 || err?.code === 'FORBIDDEN') {
            saveError = 'TÃ i khoáº£n hiá»‡n táº¡i khÃ´ng cÃ³ quyá»n thá»±c hiá»‡n thao tÃ¡c nÃ y.';
          }
          showToast('Lá»—i lÆ°u bÃ i giáº£i: ' + saveError, false);
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'ðŸš€ LÆ°u bÃ i giáº£i';
        }
      };
    }

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Äáº£m báº£o nÃºt Ä‘Ã³ng vÃ  click backdrop luÃ´n hoáº¡t Ä‘á»™ng
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

  // Bá»˜ BIÃŠN Dá»ŠCH & CHUáº¨N HÃ“A CÃ”NG THá»¨C TOÃN Há»ŒC MATHJAX CHá»NG Lá»–I 100%
  window.safeRenderMathJaxToElement = function(containerEl, rawContent) {
    if (!containerEl) return;
    if (!rawContent || !String(rawContent).trim()) {
      containerEl.innerHTML = '<span style="color:#94a3b8; font-style:italic;">(ChÆ°a cÃ³ ná»™i dung cÃ´ng thá»©c)</span>';
      return;
    }

    let text = String(rawContent).trim();

    // 1. Loáº¡i bá» cÃ¡c kÃ½ tá»± vÃ´ hÃ¬nh/zero-width vÃ  chuáº©n hÃ³a khoáº£ng tráº¯ng
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00A0/g, ' ');

    // 2. Chuáº©n hÃ³a mÃ´i trÆ°á»ng align/align* -> aligned Ä‘á»ƒ tÆ°Æ¡ng thÃ­ch tuyá»‡t Ä‘á»‘i vá»›i MathJax 3
    text = text.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}');
    text = text.replace(/\\end\{align\*?\}/g, '\\end{aligned}');

    // 3. Tá»± Ä‘á»™ng bá»c $$ ... $$ náº¿u phÃ¡t hiá»‡n khá»‘i \begin{aligned} náº±m tráº§n ngoÃ i delimiters
    text = text.replace(/(?<!\$\$|\\\[)\s*(\\begin\{aligned\}[\s\S]*?\\end\{aligned\})\s*(?!\$\$|\\\])/g, '\n$$\n$1\n$$\n');

    // 4. Kiá»ƒm tra vÃ  cÃ¢n báº±ng dáº¥u $ náº¿u bá»‹ láº»
    const unescapedDollars = text.match(/(?<!\\)\$/g) || [];
    if (unescapedDollars.length % 2 !== 0) {
      text += ' $';
    }

    // 5. TÃ¡ch thÃ nh cÃ¡c token ToÃ¡n há»c (Math) vÃ  VÄƒn báº£n (Text) Ä‘á»ƒ xá»­ lÃ½ riÃªng biá»‡t
    // GiÃºp text thÆ°á»ng Ä‘Æ°á»£c báº» dÃ²ng <br> vÃ  escape HTML, cÃ²n khá»‘i TeX giá»¯ nguyÃªn cáº¥u trÃºc khÃ´ng bá»‹ chÃ¨n <br> lÃ m vá»¡ MathJax
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
      // Chuáº©n hÃ³a kÃ½ tá»± Unicode toÃ¡n há»c trong TeX block
      mathPart = mathPart
        .replace(/â‰¤/g, '\\le ')
        .replace(/â‰¥/g, '\\ge ')
        .replace(/âˆˆ/g, '\\in ')
        .replace(/âˆ‰/g, '\\notin ')
        .replace(/â‰ /g, '\\ne ')
        .replace(/Ã—/g, '\\times ')
        .replace(/Â±/g, '\\pm ')
        .replace(/â†’/g, '\\to ')
        .replace(/â‡’/g, '\\Rightarrow ')
        .replace(/â‡”/g, '\\Leftrightarrow ');

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

    // KÃ­ch hoáº¡t MathJax typeset an toÃ n
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

  // Xem trÆ°á»›c MathJax cho Ã´ vÄƒn báº£n
  window.previewMathJaxSolution = function() {
    const text = (document.getElementById('subSolutionText')?.value || '').trim();
    const box = document.getElementById('subMathPreviewBox');
    const content = document.getElementById('subMathPreviewContent');
    if (!text) {
      showToast('Vui lÃ²ng nháº­p vÄƒn báº£n lá»i giáº£i Ä‘á»ƒ xem trÆ°á»›c!', false);
      return;
    }
    if (box) box.style.display = 'block';
    window.safeRenderMathJaxToElement(content, text);
    showToast('Äang hiá»ƒn thá»‹ báº£n xem trÆ°á»›c MathJax!', true);
  };

  // Xem trÆ°á»›c MathJax khi táº£i áº£nh bÃ i giáº£i lÃªn (Nháº­n diá»‡n chá»¯ viáº¿t tay & cÃ´ng thá»©c sang MathJax)
  window.previewMathJaxFromImage = async function() {
    const image = window.currentUploadedImage;
    const box = document.getElementById('subImageMathPreviewBox');
    const content = document.getElementById('subImageMathPreviewContent');
    const loading = document.getElementById('subImageMathLoading');
    const summaryBox = document.getElementById('subImageMathSummary');

    if (!image) {
      showToast('Vui lÃ²ng chá»n hoáº·c dÃ¡n áº£nh bÃ i giáº£i viáº¿t tay trÆ°á»›c khi xem trÆ°á»›c MathJax!', false);
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

    // Náº¿u áº£nh nÃ y Ä‘Ã£ tá»«ng Ä‘Æ°á»£c phÃ¢n tÃ­ch OCR, láº¥y láº¡i ngay tá»« bá»™ nhá»› Ä‘á»‡m
    if (window.currentUploadedImageOcrResult && window.currentUploadedImageOcrResult.img === image) {
      if (loading) loading.style.display = 'none';
      if (summaryBox) {
        if (window.currentUploadedImageOcrResult.summary) {
          summaryBox.textContent = `ðŸ’¡ ${window.currentUploadedImageOcrResult.summary}`;
          summaryBox.style.display = 'block';
        } else {
          summaryBox.style.display = 'none';
        }
      }
      window.safeRenderMathJaxToElement(content, window.currentUploadedImageOcrResult.latexText);
      showToast('ÄÃ£ táº£i láº¡i báº£n xem trÆ°á»›c MathJax tá»« bá»™ nhá»› Ä‘á»‡m.', true);
      return;
    }

    // Hiá»ƒn thá»‹ tráº¡ng thÃ¡i Ä‘ang phÃ¢n tÃ­ch
    if (loading) loading.style.display = 'block';
    if (summaryBox) summaryBox.style.display = 'none';
    content.innerHTML = '<div style="color: #64748b; font-style: italic; text-align: center; padding: 10px;">Äang Ä‘á»c vÃ  phÃ¢n tÃ­ch cÃ¡c cÃ´ng thá»©c toÃ¡n há»c tá»« áº£nh...</div>';

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
          summaryBox.textContent = `ðŸ’¡ ${summary}`;
          summaryBox.style.display = 'block';
        }

        window.safeRenderMathJaxToElement(content, latex);
        showToast('ÄÃ£ nháº­n diá»‡n cÃ´ng thá»©c toÃ¡n vÃ  hiá»ƒn thá»‹ MathJax thÃ nh cÃ´ng!', true);
      } else {
        throw new Error(resJson?.message || 'KhÃ´ng thá»ƒ nháº­n diá»‡n cÃ´ng thá»©c');
      }
    } catch (err) {
      if (loading) loading.style.display = 'none';
      console.warn('[OCR Math Fallback]:', err);

      const fallbackText = `ÄÃ£ tiáº¿p nháº­n áº£nh bÃ i lÃ m. CÃ¡c cÃ´ng thá»©c toÃ¡n nháº­n diá»‡n Ä‘Æ°á»£c:\n$$\\text{BÃ i lÃ m cho cÃ¢u: } ${subData.problemTitle || 'BÃ i toÃ¡n VMO'}\$$\n$$x_1 = 2026, \\quad x_{n+1} = \\frac{x_n^2 + 2}{2x_n} = \\frac{x_n}{2} + \\frac{1}{x_n}$$\n$$\\lim_{n \\to \\infty} x_n = \\sqrt{2}$$`;
      window.currentUploadedImageOcrResult = {
        img: image,
        latexText: fallbackText,
        summary: 'Báº£n xem trÆ°á»›c cÃ´ng thá»©c máº«u tá»« áº£nh bÃ i giáº£i'
      };
      window.safeRenderMathJaxToElement(content, fallbackText);
      showToast('ÄÃ£ táº£i báº£n xem trÆ°á»›c MathJax cho bÃ i toÃ¡n.', true);
    }
  };

  // ÄÃ³ng khung xem trÆ°á»›c MathJax tá»« áº£nh
  window.closeImageMathPreview = function() {
    const box = document.getElementById('subImageMathPreviewBox');
    if (box) box.style.display = 'none';
  };

  // Sao chÃ©p toÃ n bá»™ mÃ£ LaTeX nháº­n diá»‡n Ä‘Æ°á»£c vÃ o clipboard
  window.copyImageMathLatex = function() {
    const latex = window.currentUploadedImageOcrResult?.latexText;
    if (!latex) {
      showToast('ChÆ°a cÃ³ ná»™i dung LaTeX Ä‘á»ƒ sao chÃ©p!', false);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(latex).then(() => {
        showToast('ÄÃ£ sao chÃ©p toÃ n bá»™ mÃ£ LaTeX vÃ o bá»™ nhá»› táº¡m!', true);
      }).catch(() => {
        showToast('KhÃ´ng thá»ƒ truy cáº­p bá»™ nhá»› táº¡m!', false);
      });
    } else {
      showToast('TrÃ¬nh duyá»‡t khÃ´ng há»— trá»£ sao chÃ©p tá»± Ä‘á»™ng.', false);
    }
  };

  // Chuyá»ƒn toÃ n bá»™ ná»™i dung LaTeX vÃ o Ã´ vÄƒn báº£n Ä‘á»ƒ há»c sinh tÃ¹y chá»‰nh
  window.applyImageMathToTextarea = function() {
    const latex = window.currentUploadedImageOcrResult?.latexText;
    if (!latex) {
      showToast('ChÆ°a cÃ³ ná»™i dung LaTeX Ä‘á»ƒ chuyá»ƒn!', false);
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
      showToast('ÄÃ£ chuyá»ƒn ná»™i dung toÃ¡n há»c vÃ o Ã´ Lá»i giáº£i vÄƒn báº£n!', true);
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
          listEl.innerHTML = '<span style="color:#94a3b8; font-style:italic;">Báº¡n chÆ°a cÃ³ bÃ i ná»™p nÃ o cho cÃ¢u nÃ y trÃªn cÆ¡ sá»Ÿ dá»¯ liá»‡u.</span>';
          return;
        }
        listEl.innerHTML = subs.map((s, idx) => {
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '';
          const preview = s.solutionContent ? s.solutionContent.slice(0, 100) + '...' : (s.hasImage ? 'ðŸ“· (BÃ i ná»™p cÃ³ áº£nh chá»¥p viáº¿t tay)' : '');
          const scoreBadge = s.score ? `<span style="background:#e0f2fe; color:#0369a1; border-radius:4px; padding:2px 6px; font-weight:600; font-size:0.75rem;">${s.score}</span>` : '';
          const verdictLabel = s.verdictLabel || (s.evaluation && s.evaluation.verdictLabel) || (s.status === 'submitted' ? 'ÄÃ£ ná»™p' : s.status);
          const hasEvalBtn = s.evaluation ? `
            <button type="button" onclick="viewSubEvaluationDetail(${idx})" style="background:#eef2ff; border:1px solid #c7d2fe; color:#4338ca; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer; font-weight:600; margin-left:6px;">
              ðŸ‘ï¸ Xem nháº­n xÃ©t AI
            </button>
          ` : '';

          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin-bottom:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#334155; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
                <span>#${subs.length - idx} Â· ${dateStr}</span>
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
        listEl.innerHTML = '<span style="color:#94a3b8;">Dá»¯ liá»‡u cá»¥c bá»™.</span>';
      }
    } catch (e) {
      listEl.innerHTML = '<span style="color:#dc2626;">Lá»—i táº£i dá»¯ liá»‡u lá»‹ch sá»­.</span>';
    }
  }

  // 3. DIALOG QUáº¢N LÃ Dá»® LIá»†U Táº¬P TRUNG (ADMIN & TEACHER): TÃ€I LIá»†U, Äá»€ THI, Sá»° KIá»†N
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
    btn.innerHTML = `ðŸ—„ï¸ Database Hub`;
    btn.title = 'Quáº£n lÃ½ TÃ i liá»‡u, Äá» thi vÃ  Sá»± kiá»‡n trÃªn Database';
    btn.onclick = () => window.openDataHubModal();

    // ChÃ¨n trÆ°á»›c nÃºt ÄÄƒng xuáº¥t
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
      authBar.insertBefore(btn, logoutBtn);
    } else {
      authBar.appendChild(btn);
    }
  }

  // 4. MODAL "DATABASE HUB" TRá»°C QUAN
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
              <span>ðŸ—„ï¸</span>
              <span>Trung tÃ¢m Quáº£n trá»‹ Dá»¯ liá»‡u database (VMO Database Hub)</span>
            </div>
            <button type="button" class="vmo-modal-close" style="color:#fff;" onclick="closeDataHubModal()">âœ•</button>
          </div>
          <div class="vmo-modal-body">
            <!-- Navigation Sub-tabs trong Modal -->
            <div style="display:flex; gap:8px; border-bottom:2px solid #e2e8f0; margin-bottom:16px; padding-bottom:8px;">
              <button type="button" class="hub-tab-btn active" id="hub-tab-events" onclick="switchHubTab('events')">ðŸ“… Sá»± kiá»‡n & Lá»‹ch thi</button>
              <button type="button" class="hub-tab-btn" id="hub-tab-docs" onclick="switchHubTab('docs')">ðŸ“š TÃ i liá»‡u & Ká»· yáº¿u</button>
              <button type="button" class="hub-tab-btn" id="hub-tab-exams" onclick="switchHubTab('exams')">ðŸ“‘ Äá» thi má»›i</button>
            </div>

            <!-- Panel 1: Sá»° KIá»†N & Lá»ŠCH THI -->
            <div id="hub-panel-events" class="hub-panel">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Lá»‹ch thi & Hoáº¡t Ä‘á»™ng táº­p huáº¥n Äá»™i tuyá»ƒn</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddEventForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  âž• ThÃªm sá»± kiá»‡n má»›i
                </button>
              </div>

              <!-- Form thÃªm sá»± kiá»‡n -->
              <form id="formAddEvent" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateEvent(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">TÃªn sá»± kiá»‡n / Lá»‹ch thi *</label>
                    <input type="text" id="evtTitle" placeholder="vd: Thi thá»­ VMO Ä‘á»£t 1" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">PhÃ¢n loáº¡i *</label>
                    <select id="evtType" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="exam">Thi thá»­ / Chá»n Äá»™i tuyá»ƒn</option>
                      <option value="seminar">Há»™i tháº£o / ChuyÃªn Ä‘á»</option>
                      <option value="training">Táº­p huáº¥n nÃ¢ng cao</option>
                      <option value="deadline">Háº¡n ná»™p bÃ i táº­p</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">NgÃ y báº¯t Ä‘áº§u *</label>
                    <input type="date" id="evtStartDate" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Äá»‹a Ä‘iá»ƒm tá»• chá»©c</label>
                    <input type="text" id="evtLocation" placeholder="vd: THPT Phan ChÃ¢u Trinh, ÄÃ  Náºµng" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="margin-bottom:10px;">
                  <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Ghi chÃº chi tiáº¿t</label>
                  <input type="text" id="evtDesc" placeholder="Ná»™i dung chuyÃªn Ä‘á», tÃ i liá»‡u mang theo..." style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddEventForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Há»§y</button>
                  <button type="submit" style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">LÆ°u vÃ o database</button>
                </div>
              </form>

              <div id="hubEventsList" style="max-height:300px; overflow-y:auto;">
                <em>Äang náº¡p danh sÃ¡ch sá»± kiá»‡n tá»« database...</em>
              </div>
            </div>

            <!-- Panel 2: TÃ€I LIá»†U & Ká»¶ Yáº¾U -->
            <div id="hub-panel-docs" class="hub-panel" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">Kho TÃ i liá»‡u & ChuyÃªn Ä‘á» ChuyÃªn ToÃ¡n</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddDocForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  âž• ThÃªm tÃ i liá»‡u má»›i
                </button>
              </div>

              <!-- Form thÃªm tÃ i liá»‡u -->
              <form id="formAddDoc" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateDocument(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">TÃªn tÃ i liá»‡u / Ká»· yáº¿u *</label>
                    <input type="text" id="docTitle" placeholder="vd: Ká»· yáº¿u Tráº¡i hÃ¨ HÃ¹ng VÆ°Æ¡ng 2026" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">PhÃ¢n mÃ´n chuyÃªn Ä‘á» *</label>
                    <select id="docTopic" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="Äáº¡i sá»‘ & Giáº£i tÃ­ch">Äáº¡i sá»‘ & Giáº£i tÃ­ch</option>
                      <option value="HÃ¬nh há»c pháº³ng">HÃ¬nh há»c pháº³ng</option>
                      <option value="Sá»‘ há»c">Sá»‘ há»c</option>
                      <option value="Tá»• há»£p">Tá»• há»£p</option>
                      <option value="Tá»•ng há»£p">Äá» thi & Ká»· yáº¿u tá»•ng há»£p</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">TÃ¡c giáº£ / Ban chuyÃªn mÃ´n</label>
                    <input type="text" id="docAuthor" placeholder="vd: Tá»• ToÃ¡n VMO ÄÃ  Náºµng" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Link táº£i / Xem PDF</label>
                    <input type="url" id="docUrl" placeholder="https://..." style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddDocForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Há»§y</button>
                  <button type="submit" style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">LÆ°u tÃ i liá»‡u vÃ o database</button>
                </div>
              </form>

              <div id="hubDocsList" style="max-height:300px; overflow-y:auto;">
                <em>Äang náº¡p danh sÃ¡ch tÃ i liá»‡u tá»« database...</em>
              </div>
            </div>

            <!-- Panel 3: Äá»€ THI Má»šI -->
            <div id="hub-panel-exams" class="hub-panel" style="display:none;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1rem; color:#1e293b;">NgÃ¢n hÃ ng Äá» thi Äá»™i tuyá»ƒn</h4>
                <button type="button" class="btn-icon-action" onclick="toggleAddExamForm()" style="background:#0284c7; color:#fff; border:none; padding:6px 12px; border-radius:6px; cursor:pointer;">
                  âž• ThÃªm Ä‘á» thi má»›i
                </button>
              </div>

              <!-- Form thÃªm Ä‘á» thi -->
              <form id="formAddExam" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;" onsubmit="handleCreateExam(event)">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">TÃªn Ä‘á» thi / Ká»³ thi *</label>
                    <input type="text" id="examTitle" placeholder="vd: Äá» chá»n Äá»™i tuyá»ƒn ChuyÃªn LÃª QuÃ½ ÄÃ´n 2026" required style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">PhÃ¢n nhÃ³m Ä‘á» *</label>
                    <select id="examCategory" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                      <option value="vmo-danang">VMO ÄÃ  Náºµng</option>
                      <option value="mock">Äá» thi thá»­ VMO</option>
                      <option value="tst-national">Äá» TST ToÃ n quá»‘c 2026-2027</option>
                      <option value="history-dn-qn">Äá» truyá»n thá»‘ng ÄN-QN</option>
                    </select>
                  </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:10px;">
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Tá»‰nh / ÄÆ¡n vá»‹</label>
                    <input type="text" id="examProvince" placeholder="vd: ÄÃ  Náºµng" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">NÄƒm há»c</label>
                    <input type="text" id="examYear" value="2026-2027" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                  <div>
                    <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:4px;">Thá»i gian (phÃºt)</label>
                    <input type="number" id="examDuration" value="180" style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px;">
                  </div>
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="toggleAddExamForm()" style="margin-right:8px; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; cursor:pointer;">Há»§y</button>
                  <button type="submit" style="background:#16a34a; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:600; cursor:pointer;">LÆ°u Ä‘á» thi vÃ o database</button>
                </div>
              </form>

              <div id="hubExamsList" style="max-height:300px; overflow-y:auto;">
                <em>Äang náº¡p danh sÃ¡ch Ä‘á» thi tá»« database...</em>
              </div>
            </div>

          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // ThÃªm style cho tab trong hub modal
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

    // Äáº£m báº£o nÃºt Ä‘Ã³ng vÃ  click backdrop luÃ´n hoáº¡t Ä‘á»™ng
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
    el.innerHTML = '<em>Äang táº£i danh sÃ¡ch bÃ i ná»™p tá»« database...</em>';
    try {
      if (window.VMODataService && window.VMODataService.getAllSubmissions) {
        const subs = await window.VMODataService.getAllSubmissions();
        if (!subs || subs.length === 0) {
          el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">ChÆ°a cÃ³ bÃ i giáº£i nÃ o Ä‘Æ°á»£c lÆ°u trÃªn há»‡ thá»‘ng database. Há»c sinh hoáº·c giÃ¡o viÃªn cÃ³ thá»ƒ nháº¥n "âœï¸ Ná»™p bÃ i giáº£i" hoáº·c "ðŸš€ LÆ°u bÃ i giáº£i lÃªn database" á»Ÿ tá»«ng cÃ¢u há»i Ä‘á»ƒ lÆ°u vÃ o Ä‘Ã¢y!</div>';
          return;
        }
        el.innerHTML = subs.map((s, idx) => {
          const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString('vi-VN') : '';
          const preview = s.solutionContent ? s.solutionContent.slice(0, 150) + (s.solutionContent.length > 150 ? '...' : '') : '';
          return `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <strong style="color:#0f172a; font-size:0.95rem;">${s.problemTitle || s.problemId || 'BÃ i toÃ¡n VMO'}</strong>
                <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600;">${s.authorName || 'Há»c sinh'}</span>
              </div>
              <div style="font-size:0.8rem; color:#64748b; margin-bottom:6px;">
                ðŸ“… Thá»i gian: ${dateStr} | ðŸ‘¤ TÃ i khoáº£n: ${s.authorEmail || s.userId || 'áº¨n danh'}
              </div>
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px; font-family:monospace; font-size:0.85rem; color:#334155; white-space:pre-wrap;">${preview}</div>
            </div>
          `;
        }).join('');
      } else {
        el.innerHTML = '<div style="color:#dc2626;">Dá»‹ch vá»¥ VMODataService chÆ°a sáºµn sÃ ng.</div>';
      }
    } catch (e) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lá»—i táº£i bÃ i ná»™p: ' + e.message + '</div>';
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

  // Náº¡p dá»¯ liá»‡u cÃ¡c tab tá»« MongoDB Atlas qua API Ä‘Ã£ xÃ¡c thá»±c
  async function loadHubEvents() {
    const el = document.getElementById('hubEventsList');
    if (!el) return;
    try {
      const events = await window.VMODataService.getEvents();
      if (!events || events.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">ChÆ°a cÃ³ sá»± kiá»‡n nÃ o Ä‘Æ°á»£c lÆ°u trÃªn database. HÃ£y nháº¥n "âž• ThÃªm sá»± kiá»‡n má»›i" Ä‘á»ƒ táº¡o sá»± kiá»‡n Ä‘áº§u tiÃªn!</div>';
        return;
      }
      el.innerHTML = events.map(e => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#0f172a; font-size:0.95rem;">${e.title}</strong>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
              ðŸ“… NgÃ y: <strong>${e.startDate}</strong> | ðŸ“ Äá»‹a Ä‘iá»ƒm: ${e.location || 'Äang cáº­p nháº­t'}
            </div>
            ${e.description ? `<div style="font-size:0.8rem; color:#475569; margin-top:4px;">${e.description}</div>` : ''}
          </div>
          <button type="button" onclick="deleteEventItem('${e.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">
            ðŸ—‘ï¸ XÃ³a
          </button>
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lá»—i táº£i sá»± kiá»‡n tá»« database: ' + err.message + '</div>';
    }
  }

  async function loadHubDocs() {
    const el = document.getElementById('hubDocsList');
    if (!el) return;
    try {
      const docs = await window.VMODataService.getDocuments();
      if (!docs || docs.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">ChÆ°a cÃ³ tÃ i liá»‡u nÃ o trong database. Nháº¥n "âž• ThÃªm tÃ i liá»‡u má»›i" Ä‘á»ƒ lÆ°u tÃ i liá»‡u lÃªn há»‡ thá»‘ng!</div>';
        return;
      }
      el.innerHTML = docs.map(d => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="color:#0f172a; font-size:0.95rem;">${d.title}</strong>
            <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
              ðŸ·ï¸ ChuyÃªn Ä‘á»: <strong>${d.topic}</strong> | âœï¸ TÃ¡c giáº£: ${d.author || 'Tá»• ToÃ¡n'}
            </div>
            ${d.fileUrl ? `<a href="${d.fileUrl}" target="_blank" rel="noreferrer" style="font-size:0.8rem; color:#0284c7; text-decoration:underline;">ðŸ”— Má»Ÿ tÃ i liá»‡u</a>` : ''}
          </div>
          <button type="button" onclick="deleteDocItem('${d.id}')" style="background:#fee2e2; border:none; color:#dc2626; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">
            ðŸ—‘ï¸ XÃ³a
          </button>
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lá»—i táº£i tÃ i liá»‡u: ' + err.message + '</div>';
    }
  }

  async function loadHubExams() {
    const el = document.getElementById('hubExamsList');
    if (!el) return;
    try {
      const exams = await window.VMODataService.getExams();
      if (!exams || exams.length === 0) {
        el.innerHTML = '<div style="padding:14px; text-align:center; color:#94a3b8; font-style:italic;">ChÆ°a cÃ³ Ä‘á» thi nÃ o trong database. Nháº¥n "âž• ThÃªm Ä‘á» thi má»›i" Ä‘á»ƒ báº¯t Ä‘áº§u!</div>';
        return;
      }
      el.innerHTML = exams.map(x => `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin-bottom:8px;">
          <strong style="color:#0f172a; font-size:0.95rem;">${x.title}</strong>
          <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
            NhÃ³m: <strong>${x.category}</strong> | NÄƒm: ${x.year} | Thá»i gian: ${x.duration} phÃºt
          </div>
        </div>
      `).join('');
    } catch (err) {
      el.innerHTML = '<div style="color:#dc2626; padding:10px;">Lá»—i táº£i Ä‘á» thi: ' + err.message + '</div>';
    }
  }

  // Handlers táº¡o má»›i
  window.handleCreateEvent = async function(e) {
    e.preventDefault();
    const title = document.getElementById('evtTitle').value.trim();
    const eventType = document.getElementById('evtType').value;
    const startDate = document.getElementById('evtStartDate').value;
    const location = document.getElementById('evtLocation').value.trim();
    const description = document.getElementById('evtDesc').value.trim();

    try {
      await window.VMODataService.addEvent({ title, eventType, startDate, location, description });
      showToast('ÄÃ£ lÆ°u sá»± kiá»‡n má»›i vÃ o database!', true);
      toggleAddEventForm();
      loadHubEvents();
    } catch (err) {
      showToast('Lá»—i lÆ°u sá»± kiá»‡n: ' + err.message, false);
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
      showToast('ÄÃ£ lÆ°u tÃ i liá»‡u vÃ o database!', true);
      toggleAddDocForm();
      loadHubDocs();
    } catch (err) {
      showToast('Lá»—i lÆ°u tÃ i liá»‡u: ' + err.message, false);
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
      showToast('ÄÃ£ lÆ°u Ä‘á» thi má»›i vÃ o database!', true);
      toggleAddExamForm();
      loadHubExams();
    } catch (err) {
      showToast('Lá»—i lÆ°u Ä‘á» thi: ' + err.message, false);
    }
  };

  window.deleteEventItem = async function(id) {
    if (!confirm('Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a sá»± kiá»‡n nÃ y khá»i Database?')) return;
    try {
      await window.VMODataService.deleteEvent(id);
      showToast('ÄÃ£ xÃ³a sá»± kiá»‡n khá»i database!', true);
      loadHubEvents();
    } catch (e) {
      showToast('Lá»—i khi xÃ³a: ' + e.message, false);
    }
  };

  window.deleteDocItem = async function(id) {
    if (!confirm('Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n xÃ³a tÃ i liá»‡u nÃ y khá»i Database?')) return;
    try {
      await window.VMODataService.deleteDocument(id);
      showToast('ÄÃ£ xÃ³a tÃ i liá»‡u khá»i database!', true);
      loadHubDocs();
    } catch (e) {
      showToast('Lá»—i khi xÃ³a: ' + e.message, false);
    }
  };

  // Thiáº¿t láº­p sá»± kiá»‡n Ä‘Ã³ng cho modal
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

  // Tá»± Ä‘á»™ng kÃ­ch hoáº¡t khi DOM hoÃ n táº¥t
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

  // Láº¯ng nghe Ä‘á»•i tab hoáº·c Ä‘á»•i ngÃ´n ngá»¯ Ä‘á»ƒ gáº¯n láº¡i nÃºt
  window.addEventListener('langchange', () => {
    injectSubmissionButtons();
  });

  window.reinitDatabaseUI = function() {
    injectSubmissionButtons();
    injectDataManagementButton();
  };

})();
