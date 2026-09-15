const { getDb } = require('./lib/db');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = await getDb();
    const users = db.collection('users');
    const { action, username, password, fullName } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    if (action === 'register') {
      const exist = await users.findOne({ username });
      if (exist) return res.status(400).json({ error: 'Tên tài khoản đã tồn tại' });

      const hashedPassword = await bcrypt.hash(password, 10);
      await users.insertOne({
        username,
        password: hashedPassword,
        fullName: fullName || username,
        role: 'student',
        createdAt: new Date()
      });
      return res.status(201).json({ success: true, message: 'Đăng ký thành công' });
    }

    if (action === 'login') {
      const user = await users.findOne({ username });
      if (!user) return res.status(400).json({ error: 'Sai tài khoản hoặc mật khẩu' });

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ error: 'Sai tài khoản hoặc mật khẩu' });

      return res.status(200).json({
        success: true,
        user: { username: user.username, fullName: user.fullName, role: user.role }
      });
    }

    return res.status(400).json({ error: 'Hành động không hợp lệ' });
  } catch (err) {
    console.error('Lỗi Auth:', err);
    return res.status(500).json({ 
      error: 'Auth operation failed',
      details: err.message 
    });
  }
};
