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

    // Cho phép giao diện kiểm tra hệ thống đã có tài khoản hay chưa.
    // Không trả về thông tin người dùng hoặc dữ liệu nhạy cảm.
    if (action === 'bootstrap_status') {
      const db = await getDb();
      const userCount = await db.collection('users').countDocuments({}, { limit: 1 });
      return res.status(200).json({ success: true, needsBootstrap: userCount === 0 });
    }

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const db = await getDb();
    const users = db.collection('users');

    // Khởi tạo quản trị viên duy nhất khi database hoàn toàn chưa có người dùng.
    // Sau lần tạo đầu tiên, hành động này tự động bị khóa.
    if (action === 'bootstrap_admin') {
      if (String(password).length < 8) {
        return res.status(400).json({ success: false, error: 'Mật khẩu phải có ít nhất 8 ký tự' });
      }

      const existingUser = await users.findOne({}, { projection: { _id: 1 } });
      if (existingUser) {
        return res.status(409).json({ success: false, error: 'Hệ thống đã được khởi tạo' });
      }

      await users.createIndex({ username: 1 }, { unique: true });
      const hashedPassword = await bcrypt.hash(password, 12);
      const adminUser = {
        username: cleanUsername,
        password: hashedPassword,
        fullName: fullName ? String(fullName).trim() : cleanUsername,
        role: 'admin',
        createdAt: new Date(),
        bootstrapAdmin: true
      };
      await users.insertOne(adminUser);

      setSessionCookie(res, signSession(adminUser));
      return res.status(201).json({
        success: true,
        message: 'Khởi tạo quản trị viên thành công',
        user: {
          username: adminUser.username,
          fullName: adminUser.fullName,
          role: adminUser.role
        }
      });
    }

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
