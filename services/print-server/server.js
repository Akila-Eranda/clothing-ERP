/**
 * HexaOne Store Print Server
 * Run on the shop PC (same LAN as thermal printer). POS sends jobs via API proxy.
 *
 * Setup:
 *   cd services/print-server
 *   set PRINT_API_KEY=your-secret-key
 *   node server.js
 *
 * Default: http://0.0.0.0:9123
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '9123', 10);
const API_KEY = process.env.PRINT_API_KEY || 'shop-print-key';
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'print.log');
const QUEUE_DIR = path.join(DATA_DIR, 'queue');

for (const dir of [DATA_DIR, QUEUE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const recentLogs = [];

function appendLog(entry) {
  const line = JSON.stringify({ ...entry, at: new Date().toISOString() });
  fs.appendFileSync(LOG_FILE, line + '\n');
  recentLogs.unshift(entry);
  if (recentLogs.length > 200) recentLogs.pop();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-print-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  if (req.method === 'GET' && req.url === '/v1/health') {
    return json(res, 200, { ok: true, service: 'HexaOne Print Server', port: PORT });
  }

  if (req.method === 'GET' && req.url === '/v1/logs') {
    return json(res, 200, { data: recentLogs.slice(0, 50) });
  }

  if (req.method === 'POST' && req.url === '/v1/print') {
    const key = req.headers['x-print-key'];
    if (API_KEY && key !== API_KEY) {
      return json(res, 401, { ok: false, error: 'Invalid print API key' });
    }

    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const jobId = `job_${Date.now()}`;
      const html = body.html || '';
      const invoiceNumber = body.invoiceNumber || jobId;
      const paperWidth = body.paperWidth || '80mm';
      const printType = body.printType || 'SALE';

      const htmlPath = path.join(QUEUE_DIR, `${jobId}.html`);
      fs.writeFileSync(htmlPath, html, 'utf8');

      appendLog({
        jobId,
        invoiceNumber,
        printType,
        paperWidth,
        printerName: body.printerName || null,
        status: 'QUEUED',
        htmlPath,
      });

      // Windows: open default browser print dialog silently is not reliable;
      // queue file is saved for local print agent / manual reprint from data/queue.
      return json(res, 200, {
        ok: true,
        jobId,
        invoiceNumber,
        message: 'Print job queued on store server',
        htmlPath,
      });
    } catch (err) {
      appendLog({ status: 'FAILED', error: err.message });
      return json(res, 500, { ok: false, error: err.message });
    }
  }

  json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HexaOne Print Server listening on http://0.0.0.0:${PORT}`);
  console.log(`API key: ${API_KEY ? '(set)' : '(none)'}`);
  console.log(`Logs: ${LOG_FILE}`);
});
