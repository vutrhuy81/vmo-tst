import { getDb } from './lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    database: 'disconnected'
  };

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    result.database = 'connected';
  } catch (error) {
    result.database = 'error';

    // Không nên công khai toàn bộ thông tin kết nối
    if (process.env.NODE_ENV !== 'production') {
      result.dbError = error.message;
    }
  }

  return res.status(200).json(result);
}
