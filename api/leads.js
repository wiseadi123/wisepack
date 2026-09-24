const https = require('https');
const { MongoClient } = require('mongodb');

// Fallback configuration if env vars are not set in Vercel project settings
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adi050levy_db_user:1UBSkvnyJPubmPe4@cluster0.zyiajl7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'wisepack';
const GREEN_API_ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE || '710722735138';
const GREEN_API_TOKEN_INSTANCE = process.env.GREEN_API_TOKEN_INSTANCE || 'f64af6e10b874cc5b9844eb3c02c0bfe6af45468eee048eb8a';
const GREEN_API_HOST = process.env.GREEN_API_HOST || 'https://7107.api.greenapi.com';
const SALES_AGENT_PHONE = process.env.SALES_AGENT_PHONE || '972509611808';

let cachedClient = null;
let cachedDb = null;

async function getDatabase() {
  if (cachedDb) return cachedDb;
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000
    });
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(MONGODB_DB_NAME);
  return cachedDb;
}

function formatChatId(rawPhone) {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('05')) {
    digits = '972' + digits.substring(1);
  } else if (digits.startsWith('5') && digits.length === 9) {
    digits = '972' + digits;
  }
  return `${digits}@c.us`;
}

async function sendGreenApiMessage(chatId, message) {
  if (!GREEN_API_ID_INSTANCE || !GREEN_API_TOKEN_INSTANCE) {
    return { success: false, reason: 'NO_CREDENTIALS' };
  }
  const hostUrl = GREEN_API_HOST.replace(/\/+$/, '');
  const url = `${hostUrl}/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN_INSTANCE}`;
  const payload = JSON.stringify({ chatId, message });

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const req = https.request(parsedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 9000
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => { resBody += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, response: resBody });
          } else {
            resolve({ success: false, status: res.statusCode, error: resBody });
          }
        });
      });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'TIMEOUT' }); });
      req.write(payload);
      req.end();
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let db;
  try {
    db = await getDatabase();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Database connection failed', details: err.message }));
    return;
  }

  const collection = db.collection('leads');

  // GET: Fetch all leads
  if (req.method === 'GET') {
    try {
      const leads = await collection.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      });
      res.end(JSON.stringify(leads));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch leads', details: err.message }));
      return;
    }
  }

  // POST
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const host = req.headers.host || 'localhost';
    const parsedUrl = new URL(req.url || '/', `http://${host}`);
    const isUpdateStatus = parsedUrl.searchParams.get('action') === 'update-status' || 
                           parsedUrl.pathname.includes('update-status') ||
                           (body.id && body.status && !body.fullName);

    // 1. Update Lead Status
    if (isUpdateStatus) {
      try {
        const { id, status } = body;
        const updatedAt = new Date().toISOString();
        const updateRes = await collection.findOneAndUpdate(
          { id: String(id) },
          { $set: { status, updatedAt } },
          { returnDocument: 'after', projection: { _id: 0 } }
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, lead: updateRes.value || updateRes }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to update status', details: err.message }));
        return;
      }
    }

    // 2. Create New Lead
    try {
      if (!body.fullName || !body.phone || !body.toolType) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields' }));
        return;
      }

      // Calculate sequential friendly ID (#1001, #1002, etc.)
      const allLeads = await collection.find({}, { projection: { id: 1, leadNumber: 1 } }).toArray();
      let maxNum = 1000;
      for (const l of allLeads) {
        const rawId = String(l.leadNumber || l.id || '').replace(/\D/g, '');
        const parsed = parseInt(rawId, 10);
        if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
      }
      const nextNum = maxNum + 1;
      const leadId = `${nextNum}`;

      const newLead = {
        id: leadId,
        leadNumber: nextNum,
        fullName: body.fullName,
        phone: body.phone,
        toolType: body.toolType,
        description: body.description || 'ללא פירוט',
        whatsappConsent: !!body.whatsappConsent,
        status: 'חדש',
        source: body.source || 'landing_page_form',
        createdAt: new Date().toISOString(),
        formattedTime: new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
      };

      // WhatsApp Automations via Green API
      const displayId = `#${leadId}`;
      const waResults = { agent: 'SKIPPED', customer: 'SKIPPED' };

      // 1. Alert to Sales Agent
      const agentChatId = formatChatId(SALES_AGENT_PHONE);
      if (agentChatId) {
        const agentMsg = 
`🔔 פנייה חדשה מהאתר — Wisepack
מספר פנייה: ${displayId}
שם: ${newLead.fullName}
טלפון: ${newLead.phone}
סוג כלי: ${newLead.toolType}
פרטי הבקשה: ${newLead.description}
מועד הפנייה: ${newLead.formattedTime}`;
        const agentRes = await sendGreenApiMessage(agentChatId, agentMsg);
        waResults.agent = agentRes.success ? 'SENT' : (agentRes.reason || 'FAILED');
      }

      // 2. Direct Confirmation to Customer
      if (newLead.whatsappConsent) {
        const custChatId = formatChatId(newLead.phone);
        if (custChatId) {
          const custMsg = 
`היי ${newLead.fullName}, תודה שפנית ל־Wisepack!
קיבלנו את הבקשה שלך בנוגע ל־${newLead.toolType} (פנייה ${displayId}). נציג יחזור אליך בהקדם בשעות הפעילות.

אפשר להשיב כאן עם תמונה של הסוללה ומדבקת הנתונים כדי לעזור לנו לבדוק התאמה ⚡`;
          const custRes = await sendGreenApiMessage(custChatId, custMsg);
          waResults.customer = custRes.success ? 'SENT' : (custRes.reason || 'FAILED');
        }
      } else {
        waResults.customer = 'NOT_REQUESTED';
      }

      newLead.whatsappDelivery = waResults;

      // Save directly to MongoDB Atlas
      await collection.insertOne(newLead);
      console.log(`[Vercel Serverless] ✅ Lead #${leadId} saved to MongoDB Atlas! WA:`, waResults);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        leadId: displayId,
        rawId: leadId,
        database: 'MongoDB Atlas',
        receivedAt: newLead.createdAt,
        whatsappDelivery: waResults
      }));
      return;
    } catch (err) {
      console.error('Error saving lead:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save lead', details: err.message }));
      return;
    }
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
};
