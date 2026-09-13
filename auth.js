/**
 * Hệ thống Xác thực & Quản lý Tài khoản VMO Đà Nẵng 2026 - 2027
 * Lưu trữ đồng bộ qua localStorage (Client-side Security & Persistence cho Vercel)
 */
const VMOAuth = (() => {
  const USERS_KEY = 'vmo_auth_users';
  const SESSION_KEY = 'vmo_auth_session';

  // Khởi tạo tài khoản mặc định nếu chưa có
  const DEFAULT_USERS = [
    {
      username: 'admin',
      password: '123456',
      role: 'admin',
      name: 'Quản trị viên tối cao',
      createdAt: '2026-09-01T00:00:00.000Z'
    },
    { username: 'hoangkien',
      password: '123456',
      role: 'admin',
      name: 'Quản trị viên tối cao',
      createdAt: '2026-09-01T00:00:00.000Z'
    },
    { username: 'test1',
      password: 'password@123',
      role: 'admin',
      name: 'Quản trị viên tối cao',
      createdAt: '2026-09-01T00:00:00.000Z'
    }
  ];

  function initStorage() {
    try {
      const existing = localStorage.getItem(USERS_KEY);
      if (!existing) {
        localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  // Tự động chạy khởi tạo
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
      name: user.name || user.username,
      loginAt: Date.now()
    };
    try {
      const str = JSON.stringify(sessionData);
      if (remember) {
        localStorage.setItem(SESSION_KEY, str);
      } else {
        sessionStorage.setItem(SESSION_KEY, str);
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
    } catch (e) {}
  }

  function login(username, password, remember = true) {
    initStorage();
    const uClean = (username || '').trim().toLowerCase();
    const pClean = (password || '').trim();

    if (!uClean || !pClean) {
      return { success: false, message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu!' };
    }

    const users = getUsers();
    const found = users.find(u => u.username.toLowerCase() === uClean && u.password === pClean);

    if (found) {
      setSession(found, remember);
      return { success: true, user: found };
    } else {
      return { success: false, message: 'Tên đăng nhập hoặc mật khẩu không chính xác!' };
    }
  }

  function logout() {
    clearSession();
    window.location.replace('login.html');
  }

  function requireAuth(redirectUrl = 'login.html') {
    const sess = getSession();
    if (!sess) {
      window.location.replace(redirectUrl);
      return null;
    }
    return sess;
  }

  function redirectIfLoggedIn(redirectUrl = 'index.html') {
    const sess = getSession();
    if (sess) {
      window.location.replace(redirectUrl);
      return true;
    }
    return false;
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

    // Kiểm tra không để mất hết Admin
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
    updatePassword
  };
})();

// Export globally
window.VMOAuth = VMOAuth;
