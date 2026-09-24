const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adi050levy_db_user:1UBSkvnyJPubmPe4@cluster0.zyiajl7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'wisepack';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let mongoStatus = 'unknown';
  let leadCount = 0;

  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);
    leadCount = await db.collection('leads').countDocuments();
    mongoStatus = 'connected';
    await client.close();
  } catch (err) {
    mongoStatus = 'error: ' + err.message;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    platform: 'Vercel Serverless',
    mongo: mongoStatus,
    database: MONGODB_DB_NAME,
    totalLeadsInAtlas: leadCount,
    time: new Date().toISOString()
  }));
};
