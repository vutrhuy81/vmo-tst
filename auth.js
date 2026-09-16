/**
 * Hệ thống Xác thực & Quản lý Tài khoản VMO Đà Nẵng 2026 - 2027
 * Tích hợp:
 * - Local & Firebase Google Authentication
 * - Giám sát tương tác & Tự động Đăng xuất sau 5 phút không hoạt động (Auto-Logout Idle Tracker)
 * - Đồng bộ phiên đa tab thời gian thực
 */
const VMOAuth = (() => {
  const USERS_KEY = 'vmo_auth_users';
  const SESSION_KEY = 'vmo_auth_session';
  const LAST_ACTIVITY_KEY = 'vmo_last_activity_time';

  // Khởi tạo tài khoản mặc định nội bộ
  const DEFAULT_USERS = [];

  function initStorage() {
    try {
      const existing = localStorage.getItem(USERS_KEY);
      if (!existing) {
        localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      }
    } catch (e) {
      console.warn('LocalStorage init warning:', e);
    }
  }

  initStorage();

  function getUsers() {
    try {
      initStorage();
      const raw = localStorage.getItem(USERS_KEY);
      const list = raw ? JSON.parse(raw) : DEFAULT_USERS;
      return Array.isArray(list) ? list : DEFAULT_USERS;
    } catch (e) {
      return DEFAULT_USERS;
    }
  }

  function saveUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      return true;
    } catch (e) {
      console.error('Không thể lưu danh sách người dùng:', e);
      return false;
    }
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const sess = JSON.parse(raw);
      if (!sess || !sess.username) return null;
      return sess;
    } catch (e) {
      return null;
    }
  }

  function setSession(user, remember = true) {
    const sessionData = {
      username: user.username,
      role: user.role || 'user',
      name: user.fullName || user.name || user.username,
      photoURL: user.photoURL || '',
      uid: user.uid || '',
      provider: user.provider || 'local',
      loginAt: Date.now()
    };
    try {
      const str = JSON.stringify(sessionData);
      if (remember) {
        localStorage.setItem(SESSION_KEY, str);
      } else {
        sessionStorage.setItem(SESSION_KEY, str);
      }
      // Ghi nhận mốc thời gian hoạt động ngay khi đăng nhập
      if (window.VMOIdleTracker) {
        window.VMOIdleTracker.recordActivity();
        window.VMOIdleTracker.start();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    } catch (e) {}
  }

  async function login(username, password, remember = true) {
    const uClean = (username || '').trim().toLowerCase();
    const pClean = (password || '').trim();

    if (!uClean || !pClean) {
      return { success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!' };
    }

    try {
      const response = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ action: 'login', username: uClean, password: pClean })
      });
      const data = await response.json();
      if (!response.ok || !data.success) return { success: false, message: data.error || 'Đăng nhập thất bại!' };
      setSession(data.user, remember);
      return { success: true, user: data.user };
    } catch { return { success: false, message: 'Không thể kết nối máy chủ xác thực.' }; }
  }

  async function logout(reason = '') {
    if (window.VMOIdleTracker) {
      window.VMOIdleTracker.stop();
    }

    // Xóa session cục bộ ngay lập tức để không bị kẹt phiên
    clearSession();
    try {
      await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ action: 'logout' }) });
    } catch (e) { console.warn('Không thể thông báo đăng xuất đến máy chủ:', e); }

    // Đăng xuất khỏi Firebase nếu đã kết nối (chạy song song có timeout an toàn)
    try {
      if (window.VMOFirebase && typeof window.VMOFirebase.signOutGoogle === 'function') {
        await Promise.race([
          window.VMOFirebase.signOutGoogle(),
          new Promise(resolve => setTimeout(resolve, 400))
        ]);
      }
    } catch (e) {
      console.warn('Lỗi khi đăng xuất Firebase:', e);
    }

    let targetUrl = 'login.html';
    if (reason) {
      targetUrl += `?reason=${encodeURIComponent(reason)}`;
    }

    // Chuyển hướng về trang đăng nhập
    try {
      window.location.href = targetUrl;
    } catch (e) {
      window.location.replace(targetUrl);
    }
  }

  function requireAuth(redirectUrl = 'login.html') {
    const sess = getSession();
    if (!sess) {
      window.location.replace(redirectUrl);
      return null;
    }

    // Kiểm tra xem phiên làm việc có bị quá 5 phút không hoạt động từ trước không
    const lastAct = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 phút

    if (lastAct && (now - lastAct) > TIMEOUT) {
      logout('idle_timeout');
      return null;
    }

    // Khởi động giám sát 5 phút không tác động
    if (window.VMOIdleTracker) {
      window.VMOIdleTracker.start();
    }

    return sess;
  }

  function redirectIfLoggedIn(redirectUrl = 'index.html') {
    const sess = getSession();
    if (!sess) return false;

    // Kiểm tra tính hợp lệ về thời gian
    const lastAct = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
    const now = Date.now();
    const TIMEOUT = 5 * 60 * 1000; // 5 phút
    if (lastAct && (now - lastAct) > TIMEOUT) {
      clearSession();
      return false;
    }

    window.location.replace(redirectUrl);
    return true;
  }

  function createUser(username, password, role = 'user', name = '') {
    const currentSession = getSession();
    if (!currentSession || currentSession.role !== 'admin') {
      return { success: false, message: 'Chỉ tài khoản Admin mới có quyền tạo người dùng!' };
    }

    const uClean = (username || '').trim();
    const pClean = (password || '').trim();
    const nClean = (name || '').trim() || uClean;

    if (uClean.length < 3) {
      return { success: false, message: 'Tên đăng nhập phải có ít nhất 3 ký tự!' };
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(uClean)) {
      return { success: false, message: 'Tên đăng nhập chỉ được chứa chữ cái, số, gạch dưới, gạch ngang!' };
    }
    if (pClean.length < 4) {
      return { success: false, message: 'Mật khẩu phải có ít nhất 4 ký tự!' };
    }

    const users = getUsers();
    const exists = users.some(u => u.username.toLowerCase() === uClean.toLowerCase());
    if (exists) {
      return { success: false, message: `Tài khoản "${uClean}" đã tồn tại trên hệ thống!` };
    }

    const newUser = {
      username: uClean,
      password: pClean,
      role: role === 'admin' ? 'admin' : 'user',
      name: nClean,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    // Đồng bộ hồ sơ tài khoản lên Firestore nếu có
    if (window.VMODataService && window.VMODataService.syncUserProfile) {
      window.VMODataService.syncUserProfile({
        uid: 'user_' + uClean.toLowerCase(),
        email: uClean.includes('@') ? uClean : `${uClean}@vmo.danang.edu.vn`,
        displayName: nClean || uClean,
        username: uClean,
        role: role === 'admin' ? 'admin' : 'student',
        authProvider: 'password'
      }).catch(err => console.warn('Lỗi đồng bộ user lên Firestore:', err));
    }

    return { success: true, message: `Tạo tài khoản "${uClean}" thành công!`, user: newUser };
  }

  function deleteUser(usernameToDelete) {
    const currentSession = getSession();
    if (!currentSession || currentSession.role !== 'admin') {
      return { success: false, message: 'Chỉ tài khoản Admin mới có quyền xóa người dùng!' };
    }

    const uTarget = (usernameToDelete || '').trim().toLowerCase();
    if (uTarget === currentSession.username.toLowerCase()) {
      return { success: false, message: 'Bạn không thể tự xóa tài khoản của chính mình đang đăng nhập!' };
    }

    const users = getUsers();
    const target = users.find(u => u.username.toLowerCase() === uTarget);
    if (!target) {
      return { success: false, message: 'Không tìm thấy tài khoản cần xóa!' };
    }

    if (target.role === 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return { success: false, message: 'Không thể xóa Admin duy nhất còn lại của hệ thống!' };
      }
    }

    const remaining = users.filter(u => u.username.toLowerCase() !== uTarget);
    saveUsers(remaining);
    return { success: true, message: `Đã xóa thành công tài khoản "${usernameToDelete}"!` };
  }

  function updatePassword(username, newPassword) {
    const currentSession = getSession();
    if (!currentSession) {
      return { success: false, message: 'Vui lòng đăng nhập!' };
    }

    const uTarget = (username || '').trim().toLowerCase();
    const isSelf = currentSession.username.toLowerCase() === uTarget;
    const isAdmin = currentSession.role === 'admin';

    if (!isSelf && !isAdmin) {
      return { success: false, message: 'Bạn không có quyền đổi mật khẩu của tài khoản khác!' };
    }

    const pClean = (newPassword || '').trim();
    if (pClean.length < 4) {
      return { success: false, message: 'Mật khẩu mới phải có ít nhất 4 ký tự!' };
    }

    const users = getUsers();
    const userIndex = users.findIndex(u => u.username.toLowerCase() === uTarget);
    if (userIndex === -1) {
      return { success: false, message: 'Không tìm thấy tài khoản!' };
    }

    users[userIndex].password = pClean;
    users[userIndex].updatedAt = new Date().toISOString();
    saveUsers(users);

    return { success: true, message: `Đã cập nhật mật khẩu cho tài khoản "${users[userIndex].username}"!` };
  }

  return {
    initStorage,
    getUsers,
    saveUsers,
    getSession,
    setSession,
    clearSession,
    login,
    logout,
    requireAuth,
    redirectIfLoggedIn,
    createUser,
    deleteUser,
    updatePassword,
    LAST_ACTIVITY_KEY
  };
})();

/**
 * =========================================================================
 * VMOIdleTracker: Bộ giám sát tự động đăng xuất sau 5 phút không tương tác
 * =========================================================================
 * - Chuẩn thương mại hóa bảo mật cấp cao
 * - Thời gian chờ tối đa: 5 phút (300,000 ms)
 * - Cảnh báo trước 30 giây (ở phút thứ 4:30) kèm đồng hồ đếm ngược
 * - Tự động đồng bộ liên tab (Cross-tab activity synchronization)
 * - Tối ưu hiệu năng: throttle bắt sự kiện chuột & cuộn
 */
const VMOIdleTracker = (() => {
  const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 phút = 300,000 ms
  const WARNING_TIME_MS = 30 * 1000;   // 30 giây cảnh báo đếm ngược trước khi logout
  const WARNING_THRESHOLD_MS = IDLE_LIMIT_MS - WARNING_TIME_MS; // 4 phút 30 giây

  let checkInterval = null;
  let isWarningVisible = false;
  let lastThrottleTime = 0;

  // Lấy mốc thời gian thao tác gần nhất
  function getLastActivity() {
    const val = localStorage.getItem(VMOAuth.LAST_ACTIVITY_KEY);
    return val ? parseInt(val, 10) : Date.now();
  }

  // Ghi nhận người dùng vừa có tương tác
  function recordActivity(force = false) {
    const now = Date.now();
    // Throttle để không spam localStorage khi di chuột liên tục (tối đa 1 lần / 2 giây)
    if (!force && (now - lastThrottleTime < 2000)) {
      return;
    }
    lastThrottleTime = now;
    localStorage.setItem(VMOAuth.LAST_ACTIVITY_KEY, now.toString());

    // Nếu cảnh báo đang hiện mà người dùng tương tác lại thì ẩn cảnh báo
    if (isWarningVisible) {
      hideWarningModal();
    }
  }

  // Xây dựng Modal Cảnh báo Đếm ngược
  function ensureWarningModal() {
    let overlay = document.getElementById('idleWarningModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'idleWarningModal';
      overlay.className = 'idle-modal-overlay';
      overlay.innerHTML = `
        <div class="idle-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="idleModalTitle">
          <div class="idle-icon-wrap">⏱️</div>
          <h2 id="idleModalTitle" class="idle-modal-title">Cảnh báo hết hạn phiên làm việc</h2>
          <p class="idle-modal-desc">
            Bạn đã không có thao tác nào trong gần 5 phút. Để bảo vệ dữ liệu và bảo mật phiên truy cập, hệ thống sẽ tự động đăng xuất sau:
          </p>
          <div class="idle-timer-badge">
            <span>⏳</span>
            <span id="idleCountdownText">30 giây</span>
          </div>
          <div class="idle-modal-actions">
            <button type="button" id="btnStayLoggedIn" class="btn-stay-active">
              ✅ Tiếp tục học tập
            </button>
            <button type="button" id="btnIdleLogoutNow" class="btn-idle-logout">
              🚪 Đăng xuất ngay
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const btnStay = document.getElementById('btnStayLoggedIn');
      if (btnStay) {
        btnStay.addEventListener('click', () => {
          recordActivity(true);
          hideWarningModal();
        });
      }

      const btnLogoutNow = document.getElementById('btnIdleLogoutNow');
      if (btnLogoutNow) {
        btnLogoutNow.addEventListener('click', () => {
          VMOAuth.logout('user_action');
        });
      }
    }
    return overlay;
  }

  function showWarningModal(remainingSeconds) {
    const overlay = ensureWarningModal();
    const textEl = document.getElementById('idleCountdownText');
    if (textEl) {
      textEl.textContent = `${remainingSeconds} giây`;
    }
    if (!isWarningVisible) {
      isWarningVisible = true;
      overlay.classList.add('active');
    }
  }

  function hideWarningModal() {
    const overlay = document.getElementById('idleWarningModal');
    if (overlay) {
      overlay.classList.remove('active');
    }
    isWarningVisible = false;
  }

  // Kiểm tra chu kỳ mỗi 1 giây
  function tick() {
    const session = VMOAuth.getSession();
    if (!session) {
      stop();
      return;
    }

    const now = Date.now();
    const last = getLastActivity();
    const elapsed = now - last;

    // Trường hợp 1: Đã đủ 5 phút không tương tác -> TỰ ĐỘNG ĐĂNG XUẤT
    if (elapsed >= IDLE_LIMIT_MS) {
      stop();
      hideWarningModal();
      console.warn('VMOIdleTracker: Đăng xuất tự động do không có tương tác sau 5 phút.');
      VMOAuth.logout('idle_timeout');
      return;
    }

    // Trường hợp 2: Đạt mốc 4 phút 30 giây -> BẬT CẢNH BÁO ĐẾM NGƯỢC 30s
    if (elapsed >= WARNING_THRESHOLD_MS) {
      const remainingMs = IDLE_LIMIT_MS - elapsed;
      const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
      showWarningModal(remainingSec);
    } else {
      if (isWarningVisible) {
        hideWarningModal();
      }
    }
  }

  // Lắng nghe tất cả các sự kiện tương tác của người dùng
  function bindActivityEvents() {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(evt => {
      window.addEventListener(evt, () => recordActivity(false), { passive: true });
    });

    // Đồng bộ đa tab: nếu học sinh thao tác ở tab khác thì tab này cũng làm mới
    window.addEventListener('storage', (e) => {
      if (e.key === VMOAuth.LAST_ACTIVITY_KEY) {
        if (isWarningVisible) {
          hideWarningModal();
        }
      }
    });
  }

  function start() {
    if (checkInterval) return;
    recordActivity(true);
    bindActivityEvents();
    checkInterval = setInterval(tick, 1000);
  }

  function stop() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    hideWarningModal();
  }

  return {
    start,
    stop,
    recordActivity,
    getLastActivity
  };
})();

// Export globally
window.VMOAuth = VMOAuth;
window.VMOIdleTracker = VMOIdleTracker;
