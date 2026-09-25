const https = require('https');
const { MongoClient } = require('mongodb');

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
    console.error('MongoDB error in api/spec:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Database connection failed', details: err.message }));
    return;
  }

  const collection = db.collection('leads');
  const host = req.headers.host || 'wisepack30.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = `${proto}://${host}`;

  const parsedUrl = new URL(req.url || '/', baseUrl);
  const leadIdQuery = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('leadId');

  // --- GET: Retrieve lead and existing spec info ---
  if (req.method === 'GET') {
    if (!leadIdQuery) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing lead id' }));
      return;
    }

    try {
      const cleanId = String(leadIdQuery).replace(/^#/, '');
      const lead = await collection.findOne(
        { $or: [{ id: cleanId }, { id: `#${cleanId}` }, { leadNumber: parseInt(cleanId, 10) || 0 }] },
        { projection: { _id: 0 } }
      );

      if (!lead) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Lead not found' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      });
      res.end(JSON.stringify({
        success: true,
        lead: {
          id: lead.id,
          fullName: lead.fullName,
          phone: lead.phone,
          toolType: lead.toolType,
          description: lead.description,
          specStatus: lead.specStatus || 'NONE',
          spec: lead.spec || null,
          specSentAt: lead.specSentAt || null,
          specCompletedAt: lead.specCompletedAt || null
        }
      }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch lead spec', details: err.message }));
      return;
    }
  }

  // --- POST: Send spec link or Submit spec data ---
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const action = body.action || parsedUrl.searchParams.get('action');
    const targetLeadId = String(body.leadId || body.id || leadIdQuery || '').replace(/^#/, '');

    if (!targetLeadId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing leadId' }));
      return;
    }

    // 1. ACTION: SEND SPEC FORM TO CUSTOMER VIA WHATSAPP
    if (action === 'send' || action === 'send-spec') {
      try {
        const lead = await collection.findOne(
          { $or: [{ id: targetLeadId }, { id: `#${targetLeadId}` }, { leadNumber: parseInt(targetLeadId, 10) || 0 }] }
        );

        if (!lead) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Lead not found' }));
          return;
        }

        const displayId = String(lead.id).startsWith('#') ? lead.id : `#${lead.id}`;
        const specUrl = `${baseUrl}/spec.html?id=${lead.id}`;

        const waMessage = 
`היי ${lead.fullName},
כדי שנתאים ונבנה את הסוללה המושלמת בדיוק ל${lead.toolType} שלך (פנייה ${displayId}), הכנו עבורך טופס אפיון קצר ונוח לבחירת מידות (אורך, רוחב, גובה), אמפר וסוגי חיבורים עם תמונות להמחשה ⚡

למילוי המפרט הקצר:
${specUrl}

נשמח לעמוד לרשותך,
מעבדת Wisepack 🔋`;

        let waStatus = 'NOT_SENT';
        const customerChatId = formatChatId(lead.phone);
        if (customerChatId) {
          const waRes = await sendGreenApiMessage(customerChatId, waMessage);
          waStatus = waRes.success ? 'SENT' : (waRes.reason || 'FAILED');
        }

        const now = new Date().toISOString();
        await collection.updateOne(
          { id: lead.id },
          { 
            $set: { 
              specStatus: 'SENT',
              specSentAt: now,
              specUrl,
              updatedAt: now
            } 
          }
        );

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          specStatus: 'SENT',
          specUrl,
          whatsappStatus: waStatus,
          message: 'טופס האפיון נשלח ללקוח בוואטסאפ בהצלחה'
        }));
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to send spec form', details: err.message }));
        return;
      }
    }

    // 2. ACTION: SUBMIT SPEC FORM DATA FROM CUSTOMER
    try {
      const lead = await collection.findOne(
        { $or: [{ id: targetLeadId }, { id: `#${targetLeadId}` }, { leadNumber: parseInt(targetLeadId, 10) || 0 }] }
      );

      if (!lead) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Lead not found' }));
        return;
      }

      const displayId = String(lead.id).startsWith('#') ? lead.id : `#${lead.id}`;

      const specData = {
        length: body.length || '',
        width: body.width || '',
        height: body.height || '',
        unit: body.unit || 'cm',
        shape: body.shape || 'מלבני סטנדרטי',
        voltage: body.voltage || '',
        capacityAh: body.capacityAh || '',
        dischargeRate: body.dischargeRate || '',
        dischargeConnector: body.dischargeConnector || 'XT60',
        chargeConnector: body.chargeConnector || 'XT30',
        chargePortsCount: parseInt(body.chargePortsCount, 10) || 1,
        bmsFeatures: Array.isArray(body.bmsFeatures) ? body.bmsFeatures : (body.bmsFeatures ? [body.bmsFeatures] : []),
        notes: body.notes || '',
        customerName: body.customerName || lead.fullName,
        customerPhone: body.customerPhone || lead.phone,
        submittedAt: new Date().toISOString()
      };

      const now = new Date().toISOString();
      await collection.updateOne(
        { id: lead.id },
        {
          $set: {
            spec: specData,
            specStatus: 'COMPLETED',
            specCompletedAt: now,
            status: lead.status === 'חדש' ? 'בטיפול' : lead.status,
            updatedAt: now
          }
        }
      );

      // 1. Notify Wisepack Sales Agent on WhatsApp
      const agentChatId = formatChatId(SALES_AGENT_PHONE);
      if (agentChatId) {
        const featuresText = specData.bmsFeatures.length > 0 ? specData.bmsFeatures.join(', ') : 'ללא תוספות מיוחדות';
        const agentMessage = 
`📋 התקבל מפרט טכני חדש לסוללה!
מספר פנייה: ${displayId}
לקוח: ${lead.fullName} (${lead.phone})
סוג כלי: ${lead.toolType}
מידות: אורך ${specData.length} ס״מ, רוחב ${specData.width} ס״מ, גובה ${specData.height} ס״מ (${specData.shape})
מתח וקיבולת: ${specData.voltage}V | ${specData.capacityAh}Ah
מחבר ראשי (פריקה): ${specData.dischargeConnector}
מחבר טעינה: ${specData.chargeConnector} (${specData.chargePortsCount} יציאות)
תוספות BMS: ${featuresText}
הערות נוספות: ${specData.notes || 'אין'}`;

        await sendGreenApiMessage(agentChatId, agentMessage);
      }

      // 2. Confirm to Customer on WhatsApp
      const customerChatId = formatChatId(lead.phone);
      if (customerChatId) {
        const customerConfirmation = 
`היי ${lead.fullName},
המפרט הטכני שלך לסוללת ${lead.toolType} (פנייה ${displayId}) נקלט בהצלחה במעבדת Wisepack! ⚡

הטכנאים שלנו מתחילים כעת בחישוב התאים, המבנה והמחברים שבחרת. נציג יחזור אליך בהקדם לתיאום סופי. תודה!`;

        await sendGreenApiMessage(customerChatId, customerConfirmation);
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        message: 'המפרט הטכני נשמר בהצלחה והודעה נשלחה למעבדה!',
        spec: specData
      }));
      return;
    } catch (err) {
      console.error('Error submitting spec:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to save spec', details: err.message }));
      return;
    }
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
