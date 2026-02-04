const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;

let client;
let db;

async function connectToDb() {
  try {
    if (!uri) throw new Error('MONGO_URI is not set');

    client = new MongoClient(uri);
    await client.connect();

    console.log('Successfully connected to MongoDB');
    db = client.db(); 
    return db;
  } catch (err) {
    console.error('Failed to connect to MongoDB', err.message);
    process.exit(1);
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call connectToDb first.');
  }
  return db;
}

module.exports = { connectToDb, getDb };
