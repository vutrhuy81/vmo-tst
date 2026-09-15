const { getDb } = require('./lib/db');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await getDb();
    const users = db.collection('users');

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ success: false, error: 'Payload không hợp lệ' });
      }
    }

    const { action, username, password, fullName } = body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const cleanUsername = String(username).trim().toLowerCase();

    // Đăng ký tài khoản
    if (action === 'register') {
      const exist = await users.findOne({ username: cleanUsername });
      if (exist) {
        return res.status(400).json({ success: false, error: 'Tên tài khoản đã tồn tại' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      await users.insertOne({
        username: cleanUsername,
        password: hashedPassword,
        fullName: fullName ? String(fullName).trim() : cleanUsername,
        role: 'student',
        createdAt: new Date()
      });

      return res.status(201).json({ success: true, message: 'Đăng ký thành công' });
    }

    // Đăng nhập
    if (action === 'login') {
      const user = await users.findOne({ username: cleanUsername });
      if (!user) {
        return res.status(400).json({ success: false, error: 'Sai tài khoản hoặc mật khẩu' });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(400).json({ success: false, error: 'Sai tài khoản hoặc mật khẩu' });
      }

      return res.status(200).json({
        success: true,
        user: { 
          username: user.username, 
          fullName: user.fullName || user.username, 
          role: user.role || 'student' 
        }
      });
    }

    return res.status(400).json({ success: false, error: 'Hành động (action) không hợp lệ' });
  } catch (err) {
    console.error('LỖI THỰC THI AUTH:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Lỗi xác thực hệ thống',
      details: err.message 
    });
  }
};
