import crypto from 'node:crypto';

const COOKIE_NAME = 'vmo_session';
const MAX_AGE_SECONDS = 60 * 60 * 8;

function base64url(value) { return Buffer.from(value).toString('base64url'); }
function secret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET phải có ít nhất 32 ký tự');
  }
  return process.env.JWT_SECRET;
}

export function signSession(user) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    sub: String(user._id || user.username), username: user.username,
    fullName: user.fullName || user.username, role: user.role || 'student',
    iat: now, exp: now + MAX_AGE_SECONDS
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', secret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifySession(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', secret()).update(unsigned).digest('base64url');
  const actualBuffer = Buffer.from(parts[2]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
}

export function getSession(req) {
  const token = (req.headers.cookie || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  try { return verifySession(token); } catch { return null; }
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
