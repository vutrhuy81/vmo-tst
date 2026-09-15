const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.warn('CẢNH BÁO: Chưa có biến MONGODB_URI trong môi trường!');
}

let cachedClient = null;
let cachedPromise = null;

async function getDb(dbName = 'vmo_tst') {
  if (!process.env.MONGODB_URI) {
    throw new Error('Biến môi trường MONGODB_URI chưa được thiết lập trên Vercel!');
  }

  if (cachedClient) {
    return cachedClient.db(dbName);
  }

  if (!cachedPromise) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    });

    cachedPromise = client.connect().then((connectedClient) => {
      cachedClient = connectedClient;
      return cachedClient;
    });
  }

  const client = await cachedPromise;
  // Ưu tiên database khai báo trong URI, nếu không có sẽ lấy fallback dbName ('vmo_tst')
  return client.db(client.options.dbName || dbName);
}

module.exports = { getDb };
