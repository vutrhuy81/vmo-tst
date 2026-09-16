import { getDb } from './lib/db.js';
import bcrypt from 'bcryptjs';
import { clearSessionCookie, getSession, setSessionCookie, signSession } from './lib/session.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ success: false, error: 'Payload không hợp lệ' });
      }
    }

    const { action, username, password, fullName } = body || {};

    if (action === 'me') {
      const session = getSession(req);
      return session ? res.status(200).json({ success: true, user: session })
        : res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
    }
    if (action === 'logout') {
      clearSessionCookie(res);
      return res.status(200).json({ success: true });
    }

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const db = await getDb();
    const users = db.collection('users');

    // Đăng ký tài khoản
    if (action === 'register') {
      if (String(password).length < 8) {
        return res.status(400).json({ success: false, error: 'Mật khẩu phải có ít nhất 8 ký tự' });
      }
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

      setSessionCookie(res, signSession(user));
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
