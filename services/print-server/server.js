/**
 * HexaOne Store Print Server
 * Run on the shop PC (same LAN as thermal / label printer).
 *
 * Setup:
 *   cd services/print-server
 *   npm install
 *   set PRINT_API_KEY=your-secret-key
 *   node server.js
 *
 * Default: http://0.0.0.0:9123
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

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

function edgePaths() {
  const roots = [
    process.env['PROGRAMFILES(X86)'],
    process.env.PROGRAMFILES,
    process.env.LOCALAPPDATA,
  ].filter(Boolean);
  const out = [];
  for (const root of roots) {
    out.push(path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    out.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  return out.filter((p) => fs.existsSync(p));
}

async function htmlToPdf(htmlPath, pdfPath) {
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
  for (const browser of edgePaths()) {
    try {
      await execFileAsync(
        browser,
        ['--headless', '--disable-gpu', '--no-sandbox', `--print-to-pdf=${pdfPath}`, fileUrl],
        { timeout: 45000, windowsHide: true },
      );
      if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) {
        return { ok: true, browser: path.basename(browser) };
      }
    } catch {
      /* try next browser */
    }
  }
  return { ok: false };
}

async function printPdf(pdfPath, printerName) {
  try {
    const ptp = require('pdf-to-printer');
    await ptp.print(pdfPath, {
      printer: printerName || undefined,
      silent: true,
    });
    return { ok: true, method: 'pdf-to-printer' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function printHtmlWindows(htmlPath, printerName) {
  const pdfPath = htmlPath.replace(/\.html$/i, '.pdf');
  const pdfResult = await htmlToPdf(htmlPath, pdfPath);
  if (!pdfResult.ok) {
    throw new Error('Could not render HTML to PDF for printing (install Edge/Chrome on shop PC)');
  }

  const printResult = await printPdf(pdfPath, printerName);
  if (printResult.ok) {
    return { status: 'PRINTED', method: printResult.method, pdfPath };
  }

  const escapedPdf = pdfPath.replace(/'/g, "''");
  const ps = printerName
    ? `$p='${escapedPdf}'; Start-Process -FilePath $p -Verb PrintTo -ArgumentList '${printerName.replace(/'/g, "''")}'`
    : `$p='${escapedPdf}'; Start-Process -FilePath $p -Verb Print`;
  await execFileAsync('powershell', ['-NoProfile', '-Command', ps], {
    timeout: 60000,
    windowsHide: true,
  });
  return { status: 'PRINTED', method: 'powershell-printto', pdfPath };
}

async function dispatchPrintJob(htmlPath, printerName) {
  if (process.platform === 'win32') {
    return printHtmlWindows(htmlPath, printerName);
  }
  if (process.platform === 'linux' && printerName) {
    try {
      await execFileAsync('lp', ['-d', printerName, htmlPath], { timeout: 30000 });
      return { status: 'PRINTED', method: 'lp' };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'lp print failed');
    }
  }
  return { status: 'QUEUED', method: 'queue-only' };
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
      const printerName = body.printerName || process.env.DEFAULT_PRINTER || '';

      const htmlPath = path.join(QUEUE_DIR, `${jobId}.html`);
      fs.writeFileSync(htmlPath, html, 'utf8');

      let printResult;
      try {
        printResult = await dispatchPrintJob(htmlPath, printerName);
      } catch (printErr) {
        appendLog({
          jobId,
          invoiceNumber,
          printType,
          paperWidth,
          printerName: printerName || null,
          status: 'FAILED',
          htmlPath,
          error: printErr instanceof Error ? printErr.message : String(printErr),
        });
        return json(res, 500, {
          ok: false,
          error: printErr instanceof Error ? printErr.message : 'Print failed',
          jobId,
        });
      }

      appendLog({
        jobId,
        invoiceNumber,
        printType,
        paperWidth,
        printerName: printerName || null,
        status: printResult.status,
        method: printResult.method,
        htmlPath,
        pdfPath: printResult.pdfPath || null,
      });

      return json(res, 200, {
        ok: true,
        jobId,
        invoiceNumber,
        status: printResult.status,
        method: printResult.method,
        message:
          printResult.status === 'PRINTED'
            ? 'Sent to printer'
            : 'Print job queued on store server',
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
