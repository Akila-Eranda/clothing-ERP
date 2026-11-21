'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');

const APPROVED_ORIGIN = 'http://localhost:3000';
const APPROVED_PROJECT = 'hexaone-e2e-wave1';
const APPROVED_NETWORK = 'hexaone_e2e_wave1_network';
const APPROVED_IMAGE = 'hexaone-e2e-wave1-runner:local';
const API_PREFIX = '/api/v1';
const API_PORT = 3101;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const FORWARDED_HEADERS = new Set([
  'accept',
  'authorization',
  'content-type',
  'origin',
  'x-branch-id',
  'x-cash-approval-token',
  'x-pos-cashier-token',
  'x-pos-counter-id',
  'x-request-id',
  'x-tenant-id',
]);
const PREFLIGHT_HEADERS = new Set([...FORWARDED_HEADERS].filter((header) => header !== 'origin'));
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const DOCKER_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 5_000;
const DOCKER_EXEC_SCRIPT = String.raw`
const http = require('node:http');
const input = [];
let inputSize = 0;
process.stdin.on('data', (chunk) => {
  inputSize += chunk.length;
  if (inputSize > 2 * 1024 * 1024) process.exit(2);
  input.push(chunk);
});
process.stdin.on('end', () => {
  let request;
  try { request = JSON.parse(Buffer.concat(input).toString('utf8')); }
  catch { process.exit(2); return; }
  if (!request || !['GET','POST','PUT','PATCH','DELETE'].includes(request.method) ||
      typeof request.path !== 'string' || !/^\/api\/v1(?:\/|$)/.test(request.path) ||
      typeof request.body !== 'string' || !request.headers || typeof request.headers !== 'object') {
    process.exit(2); return;
  }
  const body = Buffer.from(request.body, 'base64');
  if (body.length > 1024 * 1024) { process.exit(2); return; }
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: 3101,
    method: request.method,
    path: request.path,
    headers: request.headers,
  }, (response) => {
    const chunks = [];
    let size = 0;
    response.on('data', (chunk) => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) {
        upstream.destroy();
        process.exit(3);
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => {
      process.stdout.write(JSON.stringify({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('base64'),
      }));
    });
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => process.exit(1));
  if (body.length) upstream.write(body);
  upstream.end();
});
`;

class RelayError extends Error {
  constructor(statusCode, safeCode) {
    super(safeCode);
    this.statusCode = statusCode;
    this.safeCode = safeCode;
  }
}

function dockerOutput(args, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const stdout = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new RelayError(502, 'runner-inspection-failed'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        child.kill();
        finish(new RelayError(502, 'runner-inspection-failed'));
        return;
      }
      stdout.push(chunk);
    });
    child.on('error', () => finish(new RelayError(502, 'runner-inspection-failed')));
    child.on('close', (code) => {
      if (code !== 0) {
        finish(new RelayError(502, 'runner-inspection-failed'));
        return;
      }
      try {
        finish(null, Buffer.concat(stdout).toString('utf8'));
      } catch {
        finish(new RelayError(502, 'runner-inspection-failed'));
      }
    });
  });
}

async function dockerJson(args, timeoutMs) {
  try {
    return JSON.parse(await dockerOutput(args, timeoutMs));
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError(502, 'runner-inspection-failed');
  }
}

async function findApprovedRunner() {
  const result = await dockerOutput([
    'ps',
    '--no-trunc',
    '--filter', `label=com.docker.compose.project=${APPROVED_PROJECT}`,
    '--filter', 'label=com.docker.compose.service=e2e-runner',
    '--filter', 'status=running',
    '--format', '{{.ID}}',
  ]);
  const ids = result.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/i.test(ids[0])) {
    throw new RelayError(503, 'runner-not-unique');
  }
  return ids[0];
}

async function inspectApprovedRunner(runnerId) {
  const containers = await dockerJson(['inspect', '--type', 'container', runnerId]);
  const networks = await dockerJson(['network', 'inspect', APPROVED_NETWORK]);
  const container = Array.isArray(containers) ? containers[0] : null;
  const network = Array.isArray(networks) ? networks[0] : null;
  if (!container || !network) throw new RelayError(503, 'runner-isolation-check-failed');
  assertRunnerIsolation(container, network);
}

function assertRunnerIsolation(container, network) {
  if (!container || !network) throw new RelayError(503, 'runner-isolation-check-failed');
  const labels = container.Config && container.Config.Labels;
  const env = new Set((container.Config && container.Config.Env) || []);
  const attachedNetworks = Object.keys((container.NetworkSettings && container.NetworkSettings.Networks) || {});
  const portBindings = container.HostConfig && container.HostConfig.PortBindings;
  const networkLabels = network.Labels || {};
  const networkMode = container.HostConfig && container.HostConfig.NetworkMode;

  if (
    container.State?.Running !== true ||
    container.Config?.Image !== APPROVED_IMAGE ||
    labels?.['com.docker.compose.project'] !== APPROVED_PROJECT ||
    labels?.['com.docker.compose.service'] !== 'e2e-runner' ||
    env.has('E2E_WAVE1=1') === false ||
    env.has('E2E_WAVE1_RUNNER_MODE=container') === false ||
    env.has(`E2E_WAVE1_PROJECT=${APPROVED_PROJECT}`) === false ||
    env.has(`E2E_WAVE1_NETWORK=${APPROVED_NETWORK}`) === false ||
    attachedNetworks.length !== 1 ||
    attachedNetworks[0] !== APPROVED_NETWORK ||
    networkMode !== APPROVED_NETWORK ||
    (portBindings && Object.keys(portBindings).length !== 0) ||
    Object.values(container.NetworkSettings?.Ports || {}).some(
      (bindings) => Array.isArray(bindings) && bindings.some((binding) => binding.HostPort),
    ) ||
    network.Name !== APPROVED_NETWORK ||
    network.Internal !== true ||
    networkLabels['com.docker.compose.project'] !== APPROVED_PROJECT ||
    networkLabels['com.docker.compose.network'] !== 'e2e'
  ) {
    throw new RelayError(503, 'runner-isolation-check-failed');
  }
}

async function verifyApprovedRunner(expectedRunnerId) {
  const runnerId = await findApprovedRunner();
  if (expectedRunnerId && runnerId !== expectedRunnerId) {
    throw new RelayError(503, 'runner-identity-changed');
  }
  await inspectApprovedRunner(runnerId);
  return runnerId;
}

function dockerExecRequest(runnerId, request, timeoutMs = DOCKER_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['exec', '-i', runnerId, 'node', '-e', DOCKER_EXEC_SCRIPT],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'ignore'] },
    );
    const output = [];
    let size = 0;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new RelayError(504, 'upstream-timeout'));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES * 2) {
        child.kill();
        finish(new RelayError(502, 'upstream-response-too-large'));
        return;
      }
      output.push(chunk);
    });
    child.on('error', () => finish(new RelayError(502, 'upstream-unavailable')));
    child.on('close', (code) => {
      if (code !== 0) {
        finish(new RelayError(502, 'upstream-unavailable'));
        return;
      }
      try {
        const response = JSON.parse(Buffer.concat(output).toString('utf8'));
        const body = Buffer.from(response.body, 'base64');
        if (
          !Number.isInteger(response.statusCode) ||
          response.statusCode < 100 ||
          response.statusCode > 599 ||
          body.length > MAX_RESPONSE_BYTES
        ) {
          throw new Error('Invalid upstream response');
        }
        finish(null, { statusCode: response.statusCode, headers: response.headers || {}, body });
      } catch {
        finish(new RelayError(502, 'upstream-invalid-response'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({
      method: request.method,
      path: request.path,
      headers: request.headers,
      body: request.body.toString('base64'),
    }));
  });
}

function sendError(response, statusCode, safeCode) {
  if (response.headersSent || response.destroyed) return;
  const body = Buffer.from(JSON.stringify({ error: safeCode }));
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
}

function readRequestBody(request, maxBytes) {
  const declaredLength = Number(request.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    request.resume();
    return Promise.reject(new RelayError(413, 'request-too-large'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        request.resume();
        reject(new RelayError(413, 'request-too-large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks));
    });
    request.on('error', () => {
      if (!tooLarge) reject(new RelayError(400, 'invalid-request'));
    });
  });
}

function addCorsHeaders(response, origin) {
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('access-control-allow-credentials', 'true');
  response.setHeader('vary', 'Origin');
}

function handlePreflight(request, response, origin) {
  const method = String(request.headers['access-control-request-method'] || '').toUpperCase();
  const requestedHeaders = String(request.headers['access-control-request-headers'] || '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (!METHODS.has(method) || requestedHeaders.some((header) => !PREFLIGHT_HEADERS.has(header))) {
    sendError(response, 403, 'preflight-not-allowed');
    return;
  }
  addCorsHeaders(response, origin);
  response.setHeader('vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  response.setHeader('access-control-allow-methods', [...METHODS, 'OPTIONS'].join(', '));
  response.setHeader('access-control-allow-headers', requestedHeaders.join(', '));
  response.setHeader('access-control-max-age', '600');
  response.writeHead(204);
  response.end();
}

function cleanResponseHeaders(headers) {
  const cleaned = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower.startsWith('access-control-') || lower === 'vary') continue;
    if (value !== undefined) cleaned[lower] = value;
  }
  return cleaned;
}

function createRelayServer({
  dockerClient = { verifyApprovedRunner: (expectedRunnerId) => verifyApprovedRunner(expectedRunnerId) },
  forward = dockerExecRequest,
  logger = () => {},
  maxRequestBytes = MAX_REQUEST_BYTES,
  timeoutMs = DOCKER_TIMEOUT_MS,
  port = API_PORT,
} = {}) {
  let approvedRunnerId;

  const server = http.createServer(async (request, response) => {
    try {
      const origin = request.headers.origin;
      if (origin && origin !== APPROVED_ORIGIN) {
        sendError(response, 403, 'origin-not-allowed');
        return;
      }
      const url = new URL(request.url || '/', 'http://relay.invalid');
      if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) {
        sendError(response, 404, 'path-not-allowed');
        return;
      }
      if (request.method === 'OPTIONS') {
        if (origin !== APPROVED_ORIGIN) {
          sendError(response, 403, 'origin-not-allowed');
          return;
        }
        handlePreflight(request, response, origin);
        return;
      }
      if (!METHODS.has(request.method)) {
        response.setHeader('allow', [...METHODS, 'OPTIONS'].join(', '));
        sendError(response, 405, 'method-not-allowed');
        return;
      }

      const body = await readRequestBody(request, maxRequestBytes);
      if (!approvedRunnerId) approvedRunnerId = await dockerClient.verifyApprovedRunner();
      else await dockerClient.verifyApprovedRunner(approvedRunnerId);

      const headers = {};
      for (const [name, value] of Object.entries(request.headers)) {
        const lower = name.toLowerCase();
        if (FORWARDED_HEADERS.has(lower) && typeof value === 'string') headers[lower] = value;
      }
      const upstream = await forward(approvedRunnerId, {
        method: request.method,
        path: `${url.pathname}${url.search}`,
        headers,
        body,
      }, timeoutMs);

      const responseHeaders = cleanResponseHeaders(upstream.headers);
      responseHeaders['content-length'] = upstream.body.length;
      responseHeaders['cache-control'] = 'no-store';
      for (const [name, value] of Object.entries(responseHeaders)) response.setHeader(name, value);
      if (origin) addCorsHeaders(response, origin);
      response.writeHead(upstream.statusCode);
      response.end(upstream.body);
    } catch (error) {
      const status = error instanceof RelayError ? error.statusCode : 502;
      const code = error instanceof RelayError ? error.safeCode : 'upstream-unavailable';
      logger(`relay request failed: ${code}`);
      sendError(response, status, code);
    }
  });

  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;

  return {
    server,
    async listen() {
      approvedRunnerId = await dockerClient.verifyApprovedRunner();
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          const address = server.address();
          if (!address || address.address !== '127.0.0.1') {
            server.close();
            reject(new RelayError(500, 'loopback-bind-failed'));
            return;
          }
          resolve();
        });
      });
      return server.address();
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

if (require.main === module) {
  const relay = createRelayServer({
    logger: (message) => console.error(message),
  });
  relay.listen()
    .then(() => console.log('Wave 1 API relay listening on 127.0.0.1:3101.'))
    .catch(() => {
      console.error('Wave 1 API relay refused to start: runner identity or loopback bind verification failed.');
      process.exitCode = 1;
    });
  const shutdown = () => relay.close().catch(() => { process.exitCode = 1; });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  APPROVED_ORIGIN,
  API_PREFIX,
  API_PORT,
  RelayError,
  assertRunnerIsolation,
  createRelayServer,
  dockerExecRequest,
  findApprovedRunner,
  inspectApprovedRunner,
  verifyApprovedRunner,
};
