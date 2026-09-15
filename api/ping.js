const { getDb } = require('./lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    hasMongoUri: !!process.env.MONGODB_URI,
    database: 'disconnected'
  };

  if (process.env.MONGODB_URI) {
    try {
      const db = await getDb();
      await db.command({ ping: 1 });
      result.database = 'connected';
    } catch (err) {
      result.database = 'error';
      result.dbError = err.message;
    }
  }

  return res.status(200).json(result);
};
