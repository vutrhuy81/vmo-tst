const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('LỖI: Chưa có biến MONGODB_URI trong môi trường!');
}

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('Biến môi trường MONGODB_URI chưa được thiết lập!');
  }

  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout sau 5s thay vì treo function
    connectTimeoutMS: 10000,
  });

  await client.connect();
  const db = client.db(); // Tự lấy database 'vmo_db' trong connection string
  
  cachedClient = client;
  cachedDb = db;
  return cachedDb;
}

module.exports = { getDb };
