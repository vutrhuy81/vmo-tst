/**
 * Quản lý Giao diện Tài khoản & Phân quyền Admin
 * VMO Đà Nẵng 2026 - 2027
 */
function initAccountMgmt() {
  // 1. Kiểm tra xác thực ngay khi trang load
  const session = VMOAuth.requireAuth('login.html');
  if (!session) return;

  const currentUserNameEl = document.getElementById('currentUserName');
  const currentUserRoleEl = document.getElementById('currentUserRole');
  const btnOpenUserMgmt = document.getElementById('btnOpenUserMgmt');
  const btnLogout = document.getElementById('btnLogout');
  const modalOverlay = document.getElementById('accountMgmtModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const usersTableBody = document.getElementById('usersTableBody');
  const addUserForm = document.getElementById('addUserForm');
  const modalAlert = document.getElementById('modalAlert');
  const totalUsersCount = document.getElementById('totalUsersCount');
  const adminUsersCount = document.getElementById('adminUsersCount');

  // 2. Hiển thị thông tin người dùng lên thanh điều hướng
  const userAvatarContainer = document.getElementById('userAvatarContainer');
  if (userAvatarContainer) {
    if (session.photoURL) {
      userAvatarContainer.innerHTML = `<img src="${session.photoURL}" alt="${session.name || 'User'}" class="user-avatar-img" referrerpolicy="no-referrer">`;
    } else {
      userAvatarContainer.innerHTML = `<span>👤</span>`;
    }
  }

  if (currentUserNameEl) {
    currentUserNameEl.textContent = session.name || session.username;
  }
  if (currentUserRoleEl) {
    const isAdmin = session.role === 'admin';
    const isEn = (window.currentLang === 'en');
    currentUserRoleEl.textContent = isAdmin ? 'Admin' : (isEn ? 'Member' : 'Thành viên');
    currentUserRoleEl.className = 'user-role-badge ' + (isAdmin ? 'role-admin' : 'role-user');
  }

  // Lắng nghe sự kiện đổi ngôn ngữ để cập nhật vai trò người dùng trên thanh điều hướng
  window.addEventListener('langchange', (e) => {
    const isEn = (e.detail?.lang === 'en');
    if (currentUserRoleEl) {
      const isAdmin = session.role === 'admin';
      currentUserRoleEl.textContent = isAdmin ? 'Admin' : (isEn ? 'Member' : 'Thành viên');
    }
    if (modalOverlay && modalOverlay.classList.contains('active')) {
      renderUsers();
    }
  });

  // Nếu không phải Admin thì ẩn nút "Quản lý tài khoản"
  if (btnOpenUserMgmt) {
    if (session.role !== 'admin') {
      btnOpenUserMgmt.style.display = 'none';
    } else {
      btnOpenUserMgmt.style.display = 'inline-flex';
    }
  }

  // 3. Xử lý Đăng xuất ngay lập tức, không dùng confirm() vì trình duyệt/iframe chặn
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      btnLogout.style.opacity = '0.75';
      btnLogout.innerHTML = '<span>⏳ Đang đăng xuất...</span>';
      await VMOAuth.logout('user_action');
    });
  }

  // 4. Mở / Đóng Modal Quản lý Tài khoản
  function openModal() {
    if (session.role !== 'admin') {
      return;
    }
    renderUsers();
    hideAlert();
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (btnOpenUserMgmt) {
    btnOpenUserMgmt.addEventListener('click', openModal);
  }
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
  }

  // Đóng modal khi click ra ngoài vùng card
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }

  // 5. Hiển thị thông báo trong Modal
  function showAlert(msg, isSuccess = true) {
    if (!modalAlert) return;
    modalAlert.textContent = msg;
    modalAlert.className = 'vmo-alert-box ' + (isSuccess ? 'vmo-alert-success' : 'vmo-alert-error');
    modalAlert.style.display = 'block';
  }

  function hideAlert() {
    if (!modalAlert) return;
    modalAlert.style.display = 'none';
  }

  // 6. Hiển thị danh sách Người dùng trong bảng
  let showPlainPasswords = false;
  window.togglePasswordVisibilityInTable = function() {
    showPlainPasswords = !showPlainPasswords;
    renderUsers();
  };

  function renderUsers() {
    if (!usersTableBody) return;
    const users = VMOAuth.getUsers();

    if (totalUsersCount) totalUsersCount.textContent = users.length;
    if (adminUsersCount) {
      const admins = users.filter(u => u.role === 'admin').length;
      adminUsersCount.textContent = admins;
    }

    usersTableBody.innerHTML = '';
    const isEn = (window.currentLang === 'en');

    users.forEach((u, idx) => {
      const isCurrent = u.username.toLowerCase() === session.username.toLowerCase();
      const isAdminRole = u.role === 'admin';
      const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN') : (isEn ? 'Default' : 'Mặc định');

      const tr = document.createElement('tr');

      // Password display
      const pwDisplay = showPlainPasswords ? u.password : '••••••••';

      tr.innerHTML = `
        <td style="text-align:center; font-weight:600;">${idx + 1}</td>
        <td>
          <strong>${u.username}</strong>
          ${isCurrent ? `<span style="font-size:0.75rem; color:#16a34a; margin-left:4px;">${isEn ? '(You)' : '(Bạn)'}</span>` : ''}
          ${u.name && u.name !== u.username ? `<br><small style="color:#64748b;">${u.name}</small>` : ''}
        </td>
        <td>
          <span class="user-role-badge ${isAdminRole ? 'role-admin' : 'role-user'}">
            ${isAdminRole ? 'Admin' : (isEn ? 'Member' : 'Thành viên')}
          </span>
        </td>
        <td class="user-pw-cell">
          <span>${pwDisplay}</span>
        </td>
        <td style="font-size:0.8rem; color:#64748b;">${createdDate}</td>
        <td style="text-align:right;">
          <button type="button" class="btn-icon-action btn-edit-pw" onclick="handleChangePassword('${u.username}')" title="${isEn ? 'Change password' : 'Đổi mật khẩu'}">
            ✏️ ${isEn ? 'Change PW' : 'Đổi MK'}
          </button>
          ${!isCurrent ? `
            <button type="button" class="btn-icon-action btn-del" onclick="handleDeleteUser('${u.username}')" title="${isEn ? 'Delete account' : 'Xóa tài khoản'}">
              🗑️ ${isEn ? 'Delete' : 'Xóa'}
            </button>
          ` : `<span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">${isEn ? 'In use' : 'Đang dùng'}</span>`}
        </td>
      `;
      usersTableBody.appendChild(tr);
    });
  }

  // 7. Xử lý Đổi Mật khẩu
  window.handleChangePassword = function(targetUsername) {
    let newPw = null;
    try {
      newPw = prompt(`Nhập mật khẩu mới cho tài khoản "${targetUsername}" (tối thiểu 4 ký tự):`);
    } catch (e) {
      newPw = null;
    }
    if (newPw === null) return;
    const cleanPw = newPw.trim();
    if (cleanPw.length < 4) {
      showAlert('Mật khẩu mới phải có độ dài từ 4 ký tự trở lên!', false);
      return;
    }
    const res = VMOAuth.updatePassword(targetUsername, cleanPw);
    if (res.success) {
      showAlert(res.message, true);
      renderUsers();
    } else {
      showAlert(res.message, false);
    }
  };

  // 8. Xử lý Xóa Tài khoản
  window.handleDeleteUser = function(targetUsername) {
    let confirmed = true;
    try {
      confirmed = confirm(`Bạn có chắc chắn muốn xóa tài khoản "${targetUsername}" không?`);
    } catch (e) {
      confirmed = true;
    }
    if (!confirmed) return;

    const res = VMOAuth.deleteUser(targetUsername);
    if (res.success) {
      showAlert(res.message, true);
      renderUsers();
    } else {
      showAlert(res.message, false);
    }
  };

  // 9. Xử lý Tạo Tài khoản Mới
  if (addUserForm) {
    addUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const u = document.getElementById('newUsername').value.trim();
      const p = document.getElementById('newPassword').value.trim();
      const r = document.getElementById('newRole').value;
      const n = document.getElementById('newName').value.trim();

      const res = VMOAuth.createUser(u, p, r, n);
      if (res.success) {
        showAlert(res.message, true);
        addUserForm.reset();
        renderUsers();
      } else {
        showAlert(res.message, false);
      }
    });
  }
}

// Khởi chạy khi DOM đã sẵn sàng (hỗ trợ cả trường hợp script chạy sau khi DOMContentLoaded đã kích hoạt)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAccountMgmt);
} else {
  initAccountMgmt();
}
