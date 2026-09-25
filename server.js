const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Simple .env parser to avoid external dependencies
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (_) {}
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const LEADS_FILE = path.join(__dirname, 'leads.json');

// Green API Configurations (with resilient defaults for cloud/serverless)
const GREEN_API_ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE || '710722735138';
const GREEN_API_TOKEN_INSTANCE = process.env.GREEN_API_TOKEN_INSTANCE || 'f64af6e10b874cc5b9844eb3c02c0bfe6af45468eee048eb8a';
const GREEN_API_HOST = process.env.GREEN_API_HOST || 'https://7107.api.greenapi.com';
const SALES_AGENT_PHONE = process.env.SALES_AGENT_PHONE || '972509611808';

// MongoDB Atlas Configuration (with resilient defaults for cloud/serverless)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://adi050levy_db_user:1UBSkvnyJPubmPe4@cluster0.zyiajl7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'wisepack';

let mongoClient = null;
let leadsCollection = null;
let isMongoConnected = false;
let mongoConnectingPromise = null;

// Ensure local leads file exists as fallback (safe for read-only filesystem)
try {
  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
} catch (_) {}

/**
 * Initialize MongoDB Atlas connection & auto-sync local leads (cached for serverless)
 */
async function initMongoDB() {
  if (isMongoConnected && leadsCollection) {
    return;
  }
  if (mongoConnectingPromise) {
    return mongoConnectingPromise;
  }

  mongoConnectingPromise = (async () => {
    if (!MONGODB_URI) {
      console.warn('[MongoDB] No MONGODB_URI found, running in local fallback mode.');
      return;
    }
    try {
      if (!mongoClient) {
        mongoClient = new MongoClient(MONGODB_URI, {
          serverSelectionTimeoutMS: 6000,
          connectTimeoutMS: 6000
        });
        await mongoClient.connect();
      }
      const db = mongoClient.db(MONGODB_DB_NAME);
      leadsCollection = db.collection('leads');
      isMongoConnected = true;
      console.log(`[MongoDB] ✅ Connected successfully to MongoDB Atlas database: "${MONGODB_DB_NAME}"`);

      // Ensure helpful indexes
      try {
        await leadsCollection.createIndex({ id: 1 }, { unique: true });
        await leadsCollection.createIndex({ createdAt: -1 });
      } catch (_) {}

      // Sync local leads to MongoDB Atlas
      await syncLocalLeadsToMongo();
    } catch (err) {
      console.error('[MongoDB] ⚠️ Failed to connect to MongoDB Atlas:', err.message);
      isMongoConnected = false;
    } finally {
      mongoConnectingPromise = null;
    }
  })();

  return mongoConnectingPromise;
}

/**
 * Sync local leads.json into MongoDB Atlas without duplicate overwrite
 */
async function syncLocalLeadsToMongo() {
  if (!isMongoConnected || !leadsCollection) return;
  try {
    if (fs.existsSync(LEADS_FILE)) {
      const localLeads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
      let syncedCount = 0;
      for (const lead of localLeads) {
        const leadId = String(lead.id || lead.leadNumber);
        const res = await leadsCollection.updateOne(
          { id: leadId },
          { $setOnInsert: lead },
          { upsert: true }
        );
        if (res.upsertedCount > 0) syncedCount++;
      }
      if (syncedCount > 0) {
        console.log(`[MongoDB] Synced ${syncedCount} new leads from local storage to Atlas.`);
      }
    }
  } catch (e) {
    console.warn('[MongoDB] Sync error:', e.message);
  }
}

/**
 * Fetch all leads (prioritizing MongoDB Atlas, fallback to leads.json)
 */
async function getAllLeads() {
  if (isMongoConnected && leadsCollection) {
    try {
      const leads = await leadsCollection
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray();
      // Keep local file in sync safely if writable
      try {
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf-8');
      } catch (_) {}
      return leads;
    } catch (e) {
      console.warn('[MongoDB] Error reading from Atlas, falling back to local file:', e.message);
    }
  }
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
  } catch (err) {
    return [];
  }
}

/**
 * Save new lead (to MongoDB Atlas and local file)
 */
async function saveLead(lead) {
  const result = { atlas: false, local: false, error: null };

  // 1. Save to MongoDB Atlas
  if (isMongoConnected && leadsCollection) {
    try {
      const docToInsert = Object.assign({}, lead);
      delete docToInsert._id; // Ensure clean insert
      const insertRes = await leadsCollection.insertOne(docToInsert);
      result.atlas = !!insertRes.acknowledged;
      console.log(`[MongoDB] ✅ Lead #${lead.id} saved to Atlas collection "leads"`);
    } catch (e) {
      result.error = e.message;
      console.error('[MongoDB] Error saving lead to Atlas:', e.message);
    }
  } else {
    result.error = `Not connected to MongoDB (isMongoConnected=${isMongoConnected})`;
  }

  // 2. Save to local leads.json backup safely
  try {
    let existingLeads = [];
    try {
      existingLeads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    } catch (e) {
      existingLeads = [];
    }
    existingLeads = existingLeads.filter(l => String(l.id) !== String(lead.id));
    existingLeads.unshift(lead);
    fs.writeFileSync(LEADS_FILE, JSON.stringify(existingLeads, null, 2), 'utf-8');
    result.local = true;
  } catch (err) {
    // Expected on read-only serverless filesystems (Vercel)
  }

  return result;
}

/**
 * Update lead status in Atlas and local file
 */
async function updateLeadStatus(id, status) {
  const updatedAt = new Date().toISOString();
  let updatedLead = null;

  if (isMongoConnected && leadsCollection) {
    try {
      const res = await leadsCollection.findOneAndUpdate(
        { id: String(id) },
        { $set: { status, updatedAt } },
        { returnDocument: 'after', projection: { _id: 0 } }
      );
      if (res) updatedLead = res.value || res;
    } catch (e) {
      console.error('[MongoDB] Error updating status in Atlas:', e.message);
    }
  }

  // Update local file safely
  try {
    const existingLeads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    const idx = existingLeads.findIndex(l => String(l.id) === String(id) || String(l.leadNumber) === String(id));
    if (idx !== -1) {
      existingLeads[idx].status = status;
      existingLeads[idx].updatedAt = updatedAt;
      try {
        fs.writeFileSync(LEADS_FILE, JSON.stringify(existingLeads, null, 2), 'utf-8');
      } catch (_) {}
      if (!updatedLead) updatedLead = existingLeads[idx];
    }
  } catch (err) {}

  return updatedLead;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

/**
 * Format any phone number into Green API chatId format: 972XXXXXXXXX@c.us
 */
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

/**
 * Send WhatsApp text message via Green API
 */
async function sendGreenApiMessage(chatId, message) {
  if (!GREEN_API_ID_INSTANCE || !GREEN_API_TOKEN_INSTANCE) {
    console.warn('[Green API] Skipped message: Missing credentials');
    return { success: false, reason: 'NO_CREDENTIALS' };
  }

  const hostUrl = GREEN_API_HOST.replace(/\/+$/, '');
  const url = `${hostUrl}/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN_INSTANCE}`;

  const payload = JSON.stringify({
    chatId: chatId,
    message: message
  });

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const req = https.request(parsedUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      }, (res) => {
        let resBody = '';
        res.on('data', chunk => { resBody += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[Green API] Message sent successfully to ${chatId}`);
            resolve({ success: true, response: resBody });
          } else {
            console.error(`[Green API] Error status ${res.statusCode} for ${chatId}: ${resBody}`);
            resolve({ success: false, status: res.statusCode, error: resBody });
          }
        });
      });

      req.on('error', (err) => {
        console.error(`[Green API] Network error:`, err.message);
        resolve({ success: false, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        console.error(`[Green API] Timeout sending message to ${chatId}`);
        resolve({ success: false, error: 'TIMEOUT' });
      });

      req.write(payload);
      req.end();
    } catch (e) {
      console.error(`[Green API] Exception:`, e.message);
      resolve({ success: false, error: e.message });
    }
  });
}

/**
 * Trigger both notifications (Sales Agent + Customer) with friendly Lead #
 */
async function triggerWhatsAppAutomations(lead) {
  const results = {
    agent: 'SKIPPED',
    customer: 'SKIPPED'
  };

  const displayId = String(lead.id).startsWith('#') ? lead.id : `#${lead.id}`;

  // 1. Message to Sales Agent (050-9611808)
  const agentChatId = formatChatId(SALES_AGENT_PHONE);
  const agentMessage = 
`🔔 פנייה חדשה מהאתר — Wisepack
מספר פנייה: ${displayId}
שם: ${lead.fullName}
טלפון: ${lead.phone}
סוג כלי: ${lead.toolType}
פרטי הבקשה: ${lead.description || 'ללא פירוט'}
מועד הפנייה: ${lead.formattedTime || new Date().toLocaleString('he-IL')}`;

  const agentRes = await sendGreenApiMessage(agentChatId, agentMessage);
  results.agent = agentRes.success ? 'SENT' : (agentRes.reason || 'FAILED');

  // 2. Message to Customer (if consented)
  if (lead.whatsappConsent) {
    const customerChatId = formatChatId(lead.phone);
    if (customerChatId) {
      const customerMessage = 
`היי ${lead.fullName}, תודה שפנית ל־Wisepack!
קיבלנו את הבקשה שלך בנוגע ל־${lead.toolType} (פנייה ${displayId}). נציג יחזור אליך בהקדם בשעות הפעילות.

אפשר להשיב כאן עם תמונה של הסוללה ומדבקת הנתונים כדי לעזור לנו לבדוק התאמה ⚡`;

      const customerRes = await sendGreenApiMessage(customerChatId, customerMessage);
      results.customer = customerRes.success ? 'SENT' : (customerRes.reason || 'FAILED');
    }
  } else {
    results.customer = 'NOT_REQUESTED';
  }

  return results;
}

/**
 * Robust body parser supporting both pre-parsed serverless objects & Node streams
 */
async function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch (e) {
        return {};
      }
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2e6) req.socket && req.socket.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/**
 * Universal Request Handler (Runs natively in standalone Node.js and inside Vercel Serverless)
 */
async function requestHandler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse requested URL
  const host = req.headers.host || 'localhost';
  const effectiveUrl = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'] || req.url || '/';
  const parsedUrl = new URL(effectiveUrl, `http://${host}`);
  let pathname = parsedUrl.pathname;

  // Resolve Vercel serverless rewrites if pointing to /api or /api/index
  if (pathname === '/api/index' || pathname === '/api' || pathname === '/api/') {
    const rawUrl = new URL(req.url || '/', `http://${host}`);
    if (rawUrl.pathname && rawUrl.pathname !== '/api/index') {
      pathname = rawUrl.pathname;
    }
  }

  // Route: /leads -> Serve leads.html dashboard
  if (pathname === '/leads' || pathname === '/leads/') {
    const leadsHtmlPath = path.join(PUBLIC_DIR, 'leads.html');
    try {
      const data = fs.readFileSync(leadsHtmlPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error loading leads dashboard');
      return;
    }
  }

  // Route: /spec -> Serve spec.html (Battery Specification & Dimensions Form)
  if (pathname === '/spec' || pathname === '/spec/' || pathname === '/spec.html' || pathname === '/battery-spec') {
    const specHtmlPath = path.join(PUBLIC_DIR, 'spec.html');
    try {
      const data = fs.readFileSync(specHtmlPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error loading spec form');
      return;
    }
  }

  // If calling an API route, ensure MongoDB Atlas is connected
  if (pathname.startsWith('/api/') || pathname === '/api') {
    await initMongoDB();
  }

  // API Endpoint: Battery Specification & Customization
  if (pathname === '/api/spec' || pathname.startsWith('/api/spec')) {
    const specHandler = require('./api/spec.js');
    return specHandler(req, res);
  }

  // API Endpoint: Tool Types Management (Dropdown Options)
  if (pathname === '/api/tool-types' || pathname.endsWith('/tool-types')) {
    const toolTypesHandler = require('./api/tool-types.js');
    return toolTypesHandler(req, res);
  }

  // API Endpoint: Auth Login
  if ((pathname === '/api/auth/login' || pathname.endsWith('/auth/login')) && req.method === 'POST') {
    const body = await parseBody(req);
    const { username, password } = body;
    if (username === 'adicore123' && password === 'c38410a3') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        token: 'ok_adicore123', 
        user: 'adicore123',
        mongoConnected: isMongoConnected
      }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'שם משתמש או סיסמה שגויים' }));
    }
    return;
  }

  // API Endpoint: Health & Database Status
  if ((pathname === '/api/status' || pathname.endsWith('/status')) && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      mongo: isMongoConnected ? 'connected' : 'offline',
      database: MONGODB_DB_NAME,
      greenApi: !!GREEN_API_ID_INSTANCE,
      time: new Date().toISOString()
    }));
    return;
  }

  // API Endpoint: Update Lead Status
  if ((pathname === '/api/leads/update-status' || pathname.endsWith('/update-status')) && req.method === 'POST') {
    const body = await parseBody(req);
    const { id, status } = body;
    const updatedLead = await updateLeadStatus(id, status);

    if (updatedLead) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, lead: updatedLead, mongoSaved: isMongoConnected }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Lead not found' }));
    }
    return;
  }

  // API Endpoint: Leads API (GET all, POST new)
  if (pathname === '/api/leads' || pathname.endsWith('/leads') || pathname === '/api/leads/' || pathname.endsWith('/leads/')) {
    if (req.method === 'GET') {
      try {
        const leads = await getAllLeads();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(leads));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read leads' }));
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const lead = await parseBody(req);

        // Validation
        if (!lead.fullName || !lead.phone || !lead.toolType) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required fields' }));
          return;
        }

        // Calculate clean sequential friendly ID (#1001, #1002, etc.)
        const allLeads = await getAllLeads();
        let maxNum = 1000;
        for (const l of allLeads) {
          const rawId = String(l.leadNumber || l.id || '').replace(/\D/g, '');
          const parsed = parseInt(rawId, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
        const nextLeadNumber = maxNum + 1;
        lead.leadNumber = nextLeadNumber;
        lead.id = `${nextLeadNumber}`;
        lead.status = lead.status || 'חדש';
        lead.createdAt = lead.createdAt || new Date().toISOString();
        lead.formattedTime = lead.formattedTime || new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });

        // Trigger Green API WhatsApp Automation with friendly lead number
        const automationStatus = await triggerWhatsAppAutomations(lead);
        lead.whatsappDelivery = automationStatus;

        // Save to MongoDB Atlas & Local Backup
        const saveResult = await saveLead(lead);

        console.log(`[Wisepack Lead Saved] ID: #${lead.id} | Name: ${lead.fullName} | Phone: ${lead.phone} | Mongo: ${isMongoConnected ? 'Atlas' : 'Local'} | WA:`, automationStatus, 'SaveResult:', saveResult);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          success: true, 
          leadId: `#${lead.id}`, 
          rawId: lead.id,
          receivedAt: lead.createdAt,
          database: isMongoConnected ? 'MongoDB Atlas' : 'Local JSON',
          mongoSaved: saveResult.atlas,
          mongoError: saveResult.error,
          whatsappDelivery: automationStatus
        }));
      } catch (err) {
        console.error('[Wisepack Error]', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
      return;
    }
  }

  // Static File Serving (for standalone node server)
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(relativePath));

  // Security check: keep within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found - Wisepack</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Standalone Server Instance
const server = http.createServer((req, res) => {
  requestHandler(req, res);
});

// If run directly via `node server.js`
if (require.main === module) {
  initMongoDB().then(() => {
    server.listen(PORT, () => {
      console.log(`\n===========================================`);
      console.log(`⚡ Wisepack Server running at http://localhost:${PORT}`);
      console.log(`🍃 Database: ${isMongoConnected ? 'MongoDB Atlas (Connected)' : 'Local JSON mode'}`);
      console.log(`📊 CRM Dashboard: http://localhost:${PORT}/leads`);
      console.log(`📄 Leads API: http://localhost:${PORT}/api/leads`);
      console.log(`📱 Green API: ${GREEN_API_ID_INSTANCE ? 'Enabled' : '(Not configured)'}`);
      console.log(`===========================================\n`);
    });
  });
}

module.exports = requestHandler;
module.exports.initMongoDB = initMongoDB;
