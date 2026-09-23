/**
 * VMO ĐÀ NẴNG 2026-2027 - CORE APPLICATION LOGIC
 * Quản lý tương tác Tabs, Bộ lọc đề, Tìm kiếm nhanh, Lời giải & MathJax, Giao diện Sáng/Tối
 */

(() => {
  const qs = (s, c = document) => c.querySelector(s);
  const qsa = (s, c = document) => [...c.querySelectorAll(s)];

  const search = qs('#searchInput');
  const searchSummary = qs('#searchSummary');
  const tabLoadPromises = new Map();

  function hrefKeys(selector, pattern) {
    return new Set(qsa(selector)
      .map(link => String(link.getAttribute('href') || '').replace(/^#/, ''))
      .filter(key => pattern.test(key)));
  }

  function formatCount(value) {
    return String(Math.max(0, Number(value) || 0)).padStart(2, '0');
  }

  function renderCatalogStats(values) {
    Object.entries(values).forEach(([key, value]) => {
      qsa(`[data-catalog-stat="${key}"]`).forEach(node => {
        node.textContent = String(value);
      });
    });
  }

  function staticCatalogStats() {
    return {
      tstTargets: hrefKeys('#sidebar-tst a.nav-link[href^="#tst-"]', /^tst-/),
      regionalTargets: hrefKeys('#sidebar-history a.nav-link[href^="#hist-"]', /^hist-(?:dn|qn)-/),
      mockEntries: hrefKeys('#sidebar-mock a.nav-link[href*="-day"]', /^mock-set\d+-day\d+$/),
      chapters: qsa('#book-content .chapter-block[data-chapter]:not([data-chapter="meta"])').length,
      theory: qsa('#book-content .theorybox').length,
      examples: qsa('#book-content .examplebox .example-solution').length
    };
  }

  function mockDimensions(entries) {
    const sets = new Set();
    const days = new Set();
    entries.forEach(key => {
      const match = String(key).match(/^mock-set(\d+)-day(\d+)$/);
      if (!match) return;
      sets.add(match[1]);
      days.add(match[2]);
    });
    return { sets: sets.size, days: days.size };
  }

  window.refreshVMOCatalogStats = async function() {
    const stats = staticCatalogStats();
    const apply = () => {
      const mock = mockDimensions(stats.mockEntries);
      renderCatalogStats({
        tst: formatCount(stats.tstTargets.size),
        regional: formatCount(stats.regionalTargets.size),
        chapters: formatCount(stats.chapters),
        theory: formatCount(stats.theory),
        examples: formatCount(stats.databaseExamples ?? stats.examples),
        mock: formatCount(mock.sets),
        mockSets: formatCount(mock.sets)
      });
    };

    // Hiển thị ngay số liệu từ catalog tĩnh, không chờ mạng/MongoDB.
    apply();
    if (!window.VMODataService?.getHomeStats) return;

    try {
      const databaseStats = await window.VMODataService.getHomeStats();
      if (Number.isInteger(Number(databaseStats?.specialtyExamples))) {
        stats.databaseExamples = Math.max(0, Number(databaseStats.specialtyExamples));
      }
      (Array.isArray(databaseStats?.exams) ? databaseStats.exams : []).forEach(exam => {
        const target = String(exam?.targetAnchor || '');
        if (exam?.category === 'tst-national' && target) stats.tstTargets.add(target);
        if (exam?.category === 'history-dn-qn' && target) stats.regionalTargets.add(target);
        if (exam?.category !== 'vmo-mock') return;

        const setNumber = Math.max(0,
          Number(exam.setNumber) || Number(target.match(/^mock-set(\d+)/)?.[1]) || 0);
        const dayNumber = Math.max(0,
          Number(exam.dayNumber) || Number(target.match(/-day(\d+)$/)?.[1]) || 0);
        if (setNumber && dayNumber) stats.mockEntries.add(`mock-set${setNumber}-day${dayNumber}`);
      });
      apply();
    } catch (error) {
      console.warn('Không tải được thống kê catalog từ MongoDB:', error?.message || error);
    }
  };

  window.addEventListener('vmo:data-service-ready', () => window.refreshVMOCatalogStats());
  window.addEventListener('vmo:data-changed', () => window.refreshVMOCatalogStats());
  window.refreshVMOCatalogStats();

  async function ensureTabContent(tabId) {
    let pane = qs('#' + tabId);
    const fragmentUrl = pane?.dataset?.fragmentUrl;
    if (!pane || !fragmentUrl) return pane;
    if (tabLoadPromises.has(tabId)) return tabLoadPromises.get(tabId);

    const pending = fetch(fragmentUrl, { credentials: 'same-origin', cache: 'force-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then(html => {
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        const loadedPane = parsed.getElementById(tabId);
        if (!loadedPane) throw new Error(`Fragment không chứa #${tabId}`);
        if (pane.classList.contains('active')) loadedPane.classList.add('active');
        pane.replaceWith(loadedPane);
        pane = loadedPane;
        return loadedPane;
      })
      .catch(error => {
        pane.innerHTML = `<div class="tab-load-error" role="alert">Không tải được nội dung. Vui lòng tải lại trang. (${String(error.message || error).replace(/[<>&]/g, '')})</div>`;
        throw error;
      })
      .finally(() => tabLoadPromises.delete(tabId));

    tabLoadPromises.set(tabId, pending);
    return pending;
  }

  // Cho các chế độ xem theo ngữ cảnh (ví dụ: luyện tập từ báo cáo xu hướng)
  // nạp kho đề theo yêu cầu mà không phải chuyển tab đang xem.
  window.ensureVMOTabContent = ensureTabContent;

  // Khởi động MathJax typeset an toàn
  function typeset(el) {
    if (el && window.renderMathInContainer) {
      window.renderMathInContainer(el).catch(() => {});
      return;
    }
    if (window.MathJax && window.MathJax.typesetPromise) {
      const target = el || qs('.tab-pane.active');
      if (target) MathJax.typesetPromise([target]).catch(() => {});
    }
  }

  // 1. Chuyển đổi Tab nội dung chính & đồng bộ Sidebar tương ứng
  window.switchTab = async function (tabId, btn) {
    qsa('.tab-pane').forEach(x => x.classList.remove('active'));
    qsa('.tab-btn').forEach(x => x.classList.remove('active'));

    let targetPane = qs('#' + tabId);
    if (targetPane) targetPane.classList.add('active');

    const targetBtn = btn || (window.event && window.event.currentTarget) || qs(`.tab-btn[onclick*="${tabId}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    const isM = (tabId === 'tab-mock');
    const isT = (tabId === 'tab-tst');
    const isH = (tabId === 'tab-history');

    // Cập nhật hiển thị Sidebar
    const sbDanang = qs('#sidebar-danang');
    const sbMock = qs('#sidebar-mock');
    const sbTst = qs('#sidebar-tst');
    const sbHistory = qs('#sidebar-history');

    if (sbDanang) sbDanang.style.display = (!isM && !isT && !isH) ? 'block' : 'none';
    if (sbMock) sbMock.style.display = isM ? 'block' : 'none';
    if (sbTst) sbTst.style.display = isT ? 'block' : 'none';
    if (sbHistory) sbHistory.style.display = isH ? 'block' : 'none';

    // Cập nhật thanh lọc vùng miền / bộ đề
    const pillsMock = qs('#mockFilterPills');
    const pillsTst = qs('#tstFilterPills');
    const pillsHist = qs('#historyFilterPills');

    if (pillsMock) pillsMock.style.display = isM ? 'flex' : 'none';
    if (pillsTst) pillsTst.style.display = isT ? 'flex' : 'none';
    if (pillsHist) pillsHist.style.display = isH ? 'flex' : 'none';

    if (search) {
      search.value = '';
      clearSearch();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      targetPane = await ensureTabContent(tabId);
      targetPane?.classList.add('active');
    } catch {
      return;
    }

    // Đồng bộ lại các nút AI Hướng dẫn giải & Nút Nộp bài Database nếu cần
    window.reinitAIGuide?.(targetPane);
    window.reinitDatabaseUI?.(targetPane);
    if (isT) window.injectTstSources?.();
    if (isH) window.injectHistorySources?.();
    window.applyCurrentLanguage?.();

    // Render công thức toán nếu tab vừa mở chưa được biên dịch
    typeset(targetPane);
  };

  // 2. Hiện / Ẩn lời giải và barem điểm từng bài
  window.toggleSolution = function (btn) {
    const content = btn.nextElementSibling;
    if (!content) return;
    const open = getComputedStyle(content).display !== 'none';
    content.style.display = open ? 'none' : 'block';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');

    const isEn = (window.currentLang === 'en');
    const isSourceBox = !!btn.closest('.source-solution-box');

    if (isSourceBox) {
      btn.textContent = open
        ? (isEn ? '🔗 Reference Solutions' : '🔗 Lời giải tham khảo')
        : (isEn ? '🙈 Hide Reference Solutions' : '🙈 Ẩn lời giải tham khảo');
    } else {
      btn.textContent = open
        ? (isEn ? '👁️ View Solution & Rubric' : '👁️ Xem lời giải & Thang điểm')
        : (isEn ? '🙈 Hide Solution & Rubric' : '🙈 Ẩn lời giải & Thang điểm');
    }

    if (!open) typeset(content);
  };

  // 3. Sao chép nội dung bài toán vào Clipboard
  window.copyText = function (btn) {
    const card = btn.closest('.problem-item');
    if (!card) return;
    const isEn = (window.currentLang === 'en');
    const id = card.querySelector('.problem-id span:first-child')?.innerText || (isEn ? 'Problem' : 'Bài toán');
    const content = card.querySelector('.problem-content')?.innerText || card.innerText;

    navigator.clipboard.writeText(`${id}:\n${content}`).then(() => {
      const old = btn.textContent;
      btn.textContent = isEn ? '✅ Copied' : '✅ Đã sao chép';
      setTimeout(() => { btn.textContent = old; }, 1500);
    });
  };

  // 4. Tìm kiếm nội dung theo từ khóa tiếng Việt / không dấu
  function norm(s) {
    return (s || '')
      .toLocaleLowerCase('vi')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  function clearSearch() {
    qsa('.hidden-by-search').forEach(x => x.classList.remove('hidden-by-search'));
    if (searchSummary) {
      searchSummary.classList.remove('visible');
      searchSummary.textContent = '';
    }
  }

  function searchBook(val) {
    let matches = 0;
    qsa('#tab-danang .chapter-block').forEach(ch => {
      let any = false;
      const subs = qsa('.book-subsection', ch);
      if (!subs.length) {
        const hit = norm(ch.textContent).includes(val);
        ch.classList.toggle('hidden-by-search', !hit);
        if (hit) { matches++; any = true; }
        return;
      }
      subs.forEach(sub => {
        const hit = norm(sub.textContent).includes(val);
        sub.classList.toggle('hidden-by-search', !hit);
        if (hit) { matches++; any = true; }
      });
      const headText = norm(ch.querySelector('.chapter-heading')?.textContent || '');
      if (headText.includes(val)) {
        subs.forEach(s => s.classList.remove('hidden-by-search'));
        any = true;
        matches = Math.max(matches, 1);
      }
      ch.classList.toggle('hidden-by-search', !any);
    });
    return matches;
  }

  function searchExamBank(tabId, val) {
    let matches = 0;
    qsa('#' + tabId + ' .exam-card').forEach(card => {
      const hit = norm((card.dataset.search || '') + ' ' + card.innerText).includes(val);
      card.classList.toggle('hidden-by-search', !hit);
      if (hit) matches++;
    });
    return matches;
  }

  function applySearch() {
    const raw = search ? search.value.trim() : '';
    if (!raw) {
      clearSearch();
      return;
    }
    const val = norm(raw);
    const active = qs('.tab-pane.active');
    let n = 0;
    if (active?.id === 'tab-mock' || active?.id === 'tab-tst' || active?.id === 'tab-history') {
      n = searchExamBank(active.id, val);
    } else {
      n = searchBook(val);
    }
    if (searchSummary) {
      searchSummary.textContent = `Tìm thấy ${n} mục phù hợp với “${raw}”.`;
      searchSummary.classList.add('visible');
    }
  }

  search?.addEventListener('input', applySearch);

  // 5. Thanh lọc theo bộ đề / vùng miền
  function setupPills(containerId, tabId) {
    qsa(`#${containerId} .pill`).forEach(p => {
      p.addEventListener('click', () => {
        qsa(`#${containerId} .pill`).forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        const f = p.dataset.filter;
        qsa(`#${tabId} .exam-card`).forEach(card => {
          card.classList.toggle('hidden-by-search', !(f === 'ALL' || card.dataset.filter === f));
        });
      });
    });
  }

  setupPills('mockFilterPills', 'tab-mock');
  setupPills('tstFilterPills', 'tab-tst');
  setupPills('historyFilterPills', 'tab-history');

  // 6. Lời giải mẫu trong tài liệu chuyên đề
  qsa('.solution-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const sol = btn.nextElementSibling;
      if (!sol) return;
      const collapsed = sol.classList.toggle('is-collapsed');
      btn.textContent = collapsed ? 'Hiện lời giải' : 'Ẩn lời giải';
      btn.setAttribute('aria-expanded', String(!collapsed));
      if (!collapsed) typeset(sol);
    });
  });

  // Nút Ẩn/Hiện toàn bộ lời giải mẫu
  const allBtn = qs('#toggleAllSolutions');
  let allShown = true;
  allBtn?.addEventListener('click', () => {
    allShown = !allShown;
    qsa('.example-solution').forEach(s => s.classList.toggle('is-collapsed', !allShown));
    qsa('.solution-toggle').forEach(b => {
      b.textContent = allShown ? 'Ẩn lời giải' : 'Hiện lời giải';
      b.setAttribute('aria-expanded', String(allShown));
    });
    allBtn.textContent = allShown ? '🙈 Ẩn toàn bộ lời giải mẫu' : '👁️ Hiện toàn bộ lời giải mẫu';
    if (allShown) typeset(qs('#book-content'));
  });

  // 7. Gắn nguồn tham khảo TST từ tstSources
  function injectTstSources() {
    const sources = window.tstSources || {};
    Object.entries(sources).forEach(([cardId, cfg]) => {
      const card = qs('#' + cardId);
      if (!card) return;
      qsa('.problem-item', card).forEach((problem, i) => {
        if (problem.querySelector('.source-solution-box')) return; // Tránh trùng lặp
        const sList = cfg.byIndex?.[i] || cfg.all;
        if (!sList?.length) return;

        const box = document.createElement('div');
        box.className = 'solution-box source-solution-box';

        const button = document.createElement('button');
        button.className = 'toggle-btn';
        button.type = 'button';
        button.textContent = '🔗 Lời giải tham khảo';
        button.setAttribute('aria-expanded', 'false');
        button.onclick = () => toggleSolution(button);

        const content = document.createElement('div');
        content.className = 'solution-content';

        const heading = document.createElement('strong');
        heading.textContent = 'Nguồn lời giải:';
        content.appendChild(heading);

        const list = document.createElement('ul');
        sList.forEach(([label, url]) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = label;
          li.appendChild(a);
          list.appendChild(li);
        });

        content.appendChild(list);
        box.append(button, content);
        problem.appendChild(box);
      });
    });
  }

  // 8. Gắn nguồn tham khảo History từ historySources
  function injectHistorySources() {
    const sources = window.historySources || {};
    Object.entries(sources).forEach(([cardId, cfg]) => {
      const card = qs('#' + cardId);
      if (!card) return;
      qsa('.problem-item', card).forEach((problem, i) => {
        if (problem.querySelector('.source-solution-box')) return; // Tránh trùng lặp
        const sList = cfg.byIndex?.[i] || cfg.all;
        if (!sList?.length) return;

        const box = document.createElement('div');
        box.className = 'solution-box source-solution-box';

        const button = document.createElement('button');
        button.className = 'toggle-btn';
        button.type = 'button';
        button.textContent = '🔗 Lời giải tham khảo';
        button.setAttribute('aria-expanded', 'false');
        button.onclick = () => toggleSolution(button);

        const content = document.createElement('div');
        content.className = 'solution-content';

        const heading = document.createElement('strong');
        heading.textContent = 'Nguồn lời giải:';
        content.appendChild(heading);

        const list = document.createElement('ul');
        sList.forEach(([label, url]) => {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = label;
          li.appendChild(a);
          list.appendChild(li);
        });

        content.appendChild(list);
        box.append(button, content);
        problem.appendChild(box);
      });
    });
  }

  window.injectTstSources = injectTstSources;
  window.injectHistorySources = injectHistorySources;

  // Nguồn tham khảo của các kho đề được gắn khi tab tương ứng được mở.
  const initialPane = qs('.tab-pane.active');
  if (initialPane?.id === 'tab-tst') injectTstSources();
  if (initialPane?.id === 'tab-history') injectHistorySources();

  window.printVMODocument = async function() {
    try {
      const mockPane = await ensureTabContent('tab-mock');
      window.reinitAIGuide?.(mockPane);
      window.reinitDatabaseUI?.(mockPane);
      typeset(mockPane);
    } catch (error) {
      console.warn('Không thể chuẩn bị toàn bộ nội dung để in:', error);
    }
    window.print();
  };

  // 8. Chế độ Giao diện Sáng / Tối (Theme Mode)
  const theme = qs('#themeToggle');
  const saved = localStorage.getItem('vmo-theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
    if (theme) theme.textContent = '☀️';
  }
  theme?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const d = document.body.classList.contains('dark');
    theme.textContent = d ? '☀️' : '🌙';
    localStorage.setItem('vmo-theme', d ? 'dark' : 'light');
  });

  // 9. Nút Về đầu trang (Back to Top)
  const top = qs('#backToTop');
  window.addEventListener('scroll', () => {
    if (top) top.classList.toggle('visible', window.scrollY > 700);
  }, { passive: true });
  top?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 10. IntersectionObserver để làm nổi bật mục lục khi cuộn
  const links = qsa('#sidebar-danang a[href^="#"]');
  if (links.length && window.IntersectionObserver) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(a => {
            a.classList.toggle('active-link', a.getAttribute('href') === '#' + e.target.id);
          });
        }
      });
    }, { rootMargin: '-25% 0px -65% 0px' });

    qsa('#book-content h1[id], #book-content h2[id]').forEach(h => obs.observe(h));
  }
})();
