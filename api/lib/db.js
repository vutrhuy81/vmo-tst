const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
let client;
let clientPromise;

if (!process.env.MONGODB_URI) {
  throw new Error('Thiếu biến môi trường MONGODB_URI!');
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

async function getDb() {
  const conn = await clientPromise;
  return conn.db();
}

module.exports = { getDb };
