const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'easybooking';

let client;
let db;

async function connectToDb() {
  if (!uri) throw new Error('MONGO_URI is not set');

  client = new MongoClient(uri);
  await client.connect();

  db = client.db(dbName);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call connectToDb first.');
  return db;
}

module.exports = { connectToDb, getDb };
