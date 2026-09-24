const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adi050levy_db_user:1UBSkvnyJPubmPe4@cluster0.zyiajl7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'wisepack';

const DEFAULT_TOOLS = [
  'אופניים חשמליים',
  'טרקטורונים חשמליים',
  'שואבי אבק',
  'רחפנים',
  'כלי עבודה נטענים',
  'קולנועיות ורכבים קלים',
  'סוללות מיוחדות ופרויקטים',
  'כלים ומכשירים אחרים'
];

const LOCAL_FALLBACK_FILE = path.join(__dirname, '..', 'tool_types.json');

let cachedClient = null;
let cachedDb = null;

async function getDatabase() {
  if (cachedDb) return cachedDb;
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(MONGODB_DB_NAME);
  return cachedDb;
}

function getLocalFallback() {
  try {
    if (fs.existsSync(LOCAL_FALLBACK_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_FALLBACK_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (_) {}
  return [...DEFAULT_TOOLS];
}

function saveLocalFallback(tools) {
  try {
    fs.writeFileSync(LOCAL_FALLBACK_FILE, JSON.stringify(tools, null, 2), 'utf8');
  } catch (_) {}
}

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch (_) { return {}; }
    }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let db = null;
  try {
    db = await getDatabase();
  } catch (err) {
    console.warn('MongoDB connect notice (tool-types fallback):', err.message);
  }

  // --- GET Tool Types ---
  if (req.method === 'GET') {
    let tools = null;
    if (db) {
      try {
        const doc = await db.collection('settings').findOne({ key: 'tool_types' });
        if (doc && Array.isArray(doc.values) && doc.values.length > 0) {
          tools = doc.values;
        } else {
          // Initialize in Mongo
          tools = [...DEFAULT_TOOLS];
          await db.collection('settings').updateOne(
            { key: 'tool_types' },
            { $set: { key: 'tool_types', values: tools, updatedAt: new Date().toISOString() } },
            { upsert: true }
          );
        }
      } catch (err) {
        console.warn('Error reading from Mongo settings:', err.message);
      }
    }

    if (!tools) tools = getLocalFallback();

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });
    res.end(JSON.stringify({ success: true, toolTypes: tools, tools: tools }));
    return;
  }

  // --- POST: Add or Remove Tool Types ---
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const action = body.action; // 'add' or 'delete' or 'set'
    const name = (body.name || body.toolType || '').trim();

    let currentTools = [];
    if (db) {
      try {
        const doc = await db.collection('settings').findOne({ key: 'tool_types' });
        currentTools = doc && Array.isArray(doc.values) ? doc.values : [...DEFAULT_TOOLS];
      } catch (_) {
        currentTools = getLocalFallback();
      }
    } else {
      currentTools = getLocalFallback();
    }

    if (action === 'add' && name) {
      if (!currentTools.includes(name)) {
        currentTools.push(name);
      }
    } else if (action === 'delete' && name) {
      currentTools = currentTools.filter(t => t !== name);
    } else if (action === 'set' && Array.isArray(body.tools)) {
      currentTools = body.tools.map(t => String(t).trim()).filter(Boolean);
    }

    // Persist
    if (db) {
      try {
        await db.collection('settings').updateOne(
          { key: 'tool_types' },
          { $set: { key: 'tool_types', values: currentTools, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
      } catch (err) {
        console.warn('Error updating Mongo settings:', err.message);
      }
    }
    saveLocalFallback(currentTools);

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(JSON.stringify({ success: true, toolTypes: currentTools, tools: currentTools }));
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
