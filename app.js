/**
 * VMO ĐÀ NẴNG 2026-2027 - CORE APPLICATION LOGIC
 * Quản lý tương tác Tabs, Bộ lọc đề, Tìm kiếm nhanh, Lời giải & MathJax, Giao diện Sáng/Tối
 */

(() => {
  const qs = (s, c = document) => c.querySelector(s);
  const qsa = (s, c = document) => [...c.querySelectorAll(s)];

  const search = qs('#searchInput');
  const searchSummary = qs('#searchSummary');

  // Khởi động MathJax typeset an toàn
  function typeset(el) {
    if (window.MathJax && window.MathJax.typesetPromise) {
      MathJax.typesetPromise(el ? [el] : undefined).catch(() => {});
    }
  }

  // 1. Chuyển đổi Tab nội dung chính & đồng bộ Sidebar tương ứng
  window.switchTab = function (tabId, btn) {
    qsa('.tab-pane').forEach(x => x.classList.remove('active'));
    qsa('.tab-btn').forEach(x => x.classList.remove('active'));

    const targetPane = qs('#' + tabId);
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

    // Đồng bộ lại các nút AI Hướng dẫn giải & Nút Nộp bài Database nếu cần
    window.reinitAIGuide?.();
    window.reinitDatabaseUI?.();
    if (isT) window.injectTstSources?.();
    if (isH) window.injectHistorySources?.();

    // Render công thức toán nếu tab vừa mở chưa được biên dịch
    if (isM && window.MathJax && window.MathJax.typesetPromise) {
      MathJax.typesetPromise([qs('#tab-mock')]).catch(() => {});
    }
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
    const isEn = (window.currentLang === 'en');
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
        button.textContent = isEn ? '🔗 Reference Solutions' : '🔗 Lời giải tham khảo';
        button.setAttribute('aria-expanded', 'false');
        button.onclick = () => toggleSolution(button);

        const content = document.createElement('div');
        content.className = 'solution-content';

        const heading = document.createElement('strong');
        heading.textContent = isEn ? 'Solution Sources:' : 'Nguồn lời giải:';
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
    const isEn = (window.currentLang === 'en');
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
        button.textContent = isEn ? '🔗 Reference Solutions' : '🔗 Lời giải tham khảo';
        button.setAttribute('aria-expanded', 'false');
        button.onclick = () => toggleSolution(button);

        const content = document.createElement('div');
        content.className = 'solution-content';

        const heading = document.createElement('strong');
        heading.textContent = isEn ? 'Solution Sources:' : 'Nguồn lời giải:';
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

  // Chạy gắn nguồn tham khảo TST & History
  injectTstSources();
  injectHistorySources();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectTstSources();
      injectHistorySources();
    });
  }

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
