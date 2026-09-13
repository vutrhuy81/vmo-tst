/**
 * Quản lý Giao diện Tài khoản & Phân quyền Admin
 * VMO Đà Nẵng 2026 - 2027
 */
document.addEventListener('DOMContentLoaded', () => {
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
  if (currentUserNameEl) {
    currentUserNameEl.textContent = session.name || session.username;
  }
  if (currentUserRoleEl) {
    const isAdmin = session.role === 'admin';
    currentUserRoleEl.textContent = isAdmin ? 'Admin' : 'Thành viên';
    currentUserRoleEl.className = 'user-role-badge ' + (isAdmin ? 'role-admin' : 'role-user');
  }

  // Nếu không phải Admin thì ẩn nút "Quản lý tài khoản"
  if (btnOpenUserMgmt) {
    if (session.role !== 'admin') {
      btnOpenUserMgmt.style.display = 'none';
    } else {
      btnOpenUserMgmt.style.display = 'inline-flex';
    }
  }

  // 3. Xử lý Đăng xuất
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?')) {
        VMOAuth.logout();
      }
    });
  }

  // 4. Mở / Đóng Modal Quản lý Tài khoản
  function openModal() {
    if (session.role !== 'admin') {
      alert('Chỉ tài khoản Admin mới có quyền truy cập chức năng này!');
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
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });

  // 5. Hiển thị thông báo trong Modal
  function showAlert(msg, isSuccess = false) {
    if (!modalAlert) return;
    modalAlert.textContent = msg;
    modalAlert.className = 'vmo-alert-box active ' + (isSuccess ? 'vmo-alert-success' : 'vmo-alert-error');
  }

  function hideAlert() {
    if (!modalAlert) return;
    modalAlert.className = 'vmo-alert-box';
    modalAlert.style.display = 'none';
  }

  // 6. Render Danh sách Tài khoản
  let showPlainPasswords = false;

  window.togglePasswordVisibilityInTable = function() {
    showPlainPasswords = !showPlainPasswords;
    renderUsers();
  };

  function renderUsers() {
    const users = VMOAuth.getUsers();
    if (totalUsersCount) totalUsersCount.textContent = users.length;
    if (adminUsersCount) adminUsersCount.textContent = users.filter(u => u.role === 'admin').length;

    if (!usersTableBody) return;
    usersTableBody.innerHTML = '';

    users.forEach((u, idx) => {
      const isCurrent = u.username.toLowerCase() === session.username.toLowerCase();
      const isAdminRole = u.role === 'admin';
      const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'Mặc định';

      const tr = document.createElement('tr');

      // Password display
      const pwDisplay = showPlainPasswords ? u.password : '••••••••';

      tr.innerHTML = `
        <td style="text-align:center; font-weight:600;">${idx + 1}</td>
        <td>
          <strong>${u.username}</strong>
          ${isCurrent ? '<span style="font-size:0.75rem; color:#16a34a; margin-left:4px;">(Bạn)</span>' : ''}
          ${u.name && u.name !== u.username ? `<br><small style="color:#64748b;">${u.name}</small>` : ''}
        </td>
        <td>
          <span class="user-role-badge ${isAdminRole ? 'role-admin' : 'role-user'}">
            ${isAdminRole ? 'Admin' : 'Thành viên'}
          </span>
        </td>
        <td class="user-pw-cell">
          <span>${pwDisplay}</span>
        </td>
        <td style="font-size:0.8rem; color:#64748b;">${createdDate}</td>
        <td style="text-align:right;">
          <button type="button" class="btn-icon-action btn-edit-pw" onclick="handleChangePassword('${u.username}')" title="Đổi mật khẩu">
            ✏️ Đổi MK
          </button>
          ${!isCurrent ? `
            <button type="button" class="btn-icon-action btn-del" onclick="handleDeleteUser('${u.username}')" title="Xóa tài khoản">
              🗑️ Xóa
            </button>
          ` : '<span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">Đang dùng</span>'}
        </td>
      `;
      usersTableBody.appendChild(tr);
    });
  }

  // 7. Xử lý Đổi Mật khẩu
  window.handleChangePassword = function(targetUsername) {
    const newPw = prompt(`Nhập mật khẩu mới cho tài khoản "${targetUsername}" (tối thiểu 4 ký tự):`);
    if (newPw === null) return; // User cancelled
    const cleanPw = newPw.trim();
    if (cleanPw.length < 4) {
      alert('Mật khẩu mới phải có độ dài từ 4 ký tự trở lên!');
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
    if (!confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${targetUsername}" không?`)) {
      return;
    }
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
});
