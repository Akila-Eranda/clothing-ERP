'use strict';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const {
  createRelayServer,
  assertRunnerIsolation,
  RelayError,
} = require('./e2e-wave1-browser-relay.cjs');

const servers = [];
const SECRET_PASSWORD = 'do-not-log-this-password';
const SECRET_TOKEN = 'do-not-log-this-token';

function approvedContainer() {
  return {
    State: { Running: true },
    Config: {
      Image: 'hexaone-e2e-wave1-runner:local',
      Labels: {
        'com.docker.compose.project': 'hexaone-e2e-wave1',
        'com.docker.compose.service': 'e2e-runner',
      },
      Env: [
        'E2E_WAVE1=1',
        'E2E_WAVE1_RUNNER_MODE=container',
        'E2E_WAVE1_PROJECT=hexaone-e2e-wave1',
        'E2E_WAVE1_NETWORK=hexaone_e2e_wave1_network',
      ],
    },
    HostConfig: { NetworkMode: 'hexaone_e2e_wave1_network', PortBindings: {} },
    NetworkSettings: {
      Networks: { hexaone_e2e_wave1_network: {} },
      Ports: {},
    },
  };
}

function approvedNetwork() {
  return {
    Name: 'hexaone_e2e_wave1_network',
    Internal: true,
    Labels: {
      'com.docker.compose.project': 'hexaone-e2e-wave1',
      'com.docker.compose.network': 'e2e',
    },
  };
}

async function startRelay(options = {}) {
  const relay = createRelayServer({
    port: 0,
    dockerClient: {
      async verifyApprovedRunner(existingId) {
        if (existingId && existingId !== 'approved-runner-id') throw new Error('wrong runner');
        return 'approved-runner-id';
      },
    },
    async forward(_runnerId, request) {
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({
          received: request.path,
          method: request.method,
          authorization: request.headers.authorization,
          body: request.body.toString('utf8'),
        })),
      };
    },
    ...options,
  });
  const address = await relay.listen();
  servers.push(relay);
  return { relay, baseUrl: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((relay) => relay.close()));
});

test('accepts only the dedicated runner and internal network identity', async (context) => {
  await context.test('approved runner identity', async () => {
    assert.doesNotThrow(() => assertRunnerIsolation(approvedContainer(), approvedNetwork()));
  });
  const mutations = [
    ['wrong project', (container) => { container.Config.Labels['com.docker.compose.project'] = 'other'; }],
    ['wrong image', (container) => { container.Config.Image = 'other:latest'; }],
    ['additional network', (container) => { container.NetworkSettings.Networks.other = {}; }],
    ['published port', (container) => { container.HostConfig.PortBindings = { '3101/tcp': [{ HostPort: '3101' }] }; }],
    ['non-internal network', (_container, network) => { network.Internal = false; }],
  ];
  for (const [label, mutate] of mutations) {
    await context.test(`rejects ${label}`, async () => {
      const container = approvedContainer();
      const network = approvedNetwork();
      mutate(container, network);
      assert.throws(() => assertRunnerIsolation(container, network), {
        safeCode: 'runner-isolation-check-failed',
      });
    });
  }
});

test('forwards login POST JSON and returns JSON response', async () => {
  let forwarded;
  const { baseUrl } = await startRelay({
    async forward(_runnerId, request) {
      forwarded = request;
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"success":true,"data":{"ok":true}}'),
      };
    },
  });
  const body = JSON.stringify({ email: 'admin@wave1.test', password: SECRET_PASSWORD });
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, data: { ok: true } });
  assert.equal(forwarded.method, 'POST');
  assert.equal(forwarded.path, '/api/v1/auth/login');
  assert.equal(forwarded.body.toString('utf8'), body);
});

test('forwards authorization header without logging its value', async () => {
  let forwarded;
  const logs = [];
  const { baseUrl } = await startRelay({
    logger: (line) => logs.push(line),
    async forward(_runnerId, request) {
      forwarded = request;
      return { statusCode: 200, headers: {}, body: Buffer.from('ok') };
    },
  });
  const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { origin: 'http://localhost:3000', authorization: `Bearer ${SECRET_TOKEN}` },
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded.headers.authorization, `Bearer ${SECRET_TOKEN}`);
  assert.equal(logs.join('\n').includes(SECRET_TOKEN), false);
});

test('preserves query strings and JSON response bodies', async () => {
  let forwarded;
  const { baseUrl } = await startRelay({
    async forward(_runnerId, request) {
      forwarded = request;
      return {
        statusCode: 201,
        headers: { 'content-type': 'application/json', connection: 'close' },
        body: Buffer.from('{"data":[1,2]}'),
      };
    },
  });
  const response = await fetch(`${baseUrl}/api/v1/customers/history?page=2&search=Jane`, {
    headers: { origin: 'http://localhost:3000' },
  });
  assert.equal(forwarded.path, '/api/v1/customers/history?page=2&search=Jane');
  assert.deepEqual(await response.json(), { data: [1, 2] });
  assert.equal(response.headers.get('connection'), 'keep-alive');
});

test('answers approved CORS preflight for localhost frontend', async () => {
  let forwarded = false;
  const { baseUrl } = await startRelay({
    async forward() {
      forwarded = true;
      throw new Error('preflight should not reach Docker');
    },
  });
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, content-type, x-tenant-id',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.match(response.headers.get('access-control-allow-headers'), /authorization/);
  assert.equal(forwarded, false);
});

test('rejects unapproved origins', async () => {
  let forwarded = false;
  const { baseUrl } = await startRelay({
    async forward() {
      forwarded = true;
      throw new Error('unapproved origin should be rejected');
    },
  });
  const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
    headers: { origin: 'http://localhost:3002' },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'origin-not-allowed' });
  assert.equal(forwarded, false);
});

test('rejects paths outside the API prefix', async () => {
  const { baseUrl } = await startRelay();
  const response = await fetch(`${baseUrl}/api/v2/auth/me`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'path-not-allowed' });
});

test('rejects preflight paths outside the API prefix', async () => {
  const { baseUrl } = await startRelay();
  const response = await fetch(`${baseUrl}/outside`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:3000',
      'access-control-request-method': 'GET',
    },
  });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'path-not-allowed' });
});

test('rejects unsupported methods', async () => {
  const { baseUrl } = await startRelay();
  const response = await fetch(`${baseUrl}/api/v1/auth/me`, { method: 'PROPFIND' });
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: 'method-not-allowed' });
});

test('enforces the request body size limit', async () => {
  const { baseUrl } = await startRelay({ maxRequestBytes: 16 });
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'larger-than-limit' }),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'request-too-large' });
});

test('maps upstream timeout to a safe 504 response', async () => {
  const logs = [];
  const { baseUrl } = await startRelay({
    timeoutMs: 20,
    logger: (line) => logs.push(line),
    async forward() {
      throw new RelayError(504, 'upstream-timeout');
    },
  });
  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: 'upstream-timeout' });
  assert.equal(logs.join('\n').includes(SECRET_TOKEN), false);
});

test('maps upstream failures without exposing details', async () => {
  const logs = [];
  const { baseUrl } = await startRelay({
    logger: (line) => logs.push(line),
    async forward() {
      throw new Error(`upstream failed ${SECRET_PASSWORD}`);
    },
  });
  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'upstream-unavailable' });
  assert.equal(logs.join('\n').includes(SECRET_PASSWORD), false);
});

test('never logs request bodies, passwords, tokens, or authorization values', async () => {
  const logs = [];
  const { baseUrl } = await startRelay({
    logger: (line) => logs.push(line),
    async forward() {
      const error = new Error(`failed ${SECRET_PASSWORD} ${SECRET_TOKEN}`);
      error.statusCode = 502;
      error.safeCode = 'upstream-unavailable';
      throw error;
    },
  });
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      authorization: `Bearer ${SECRET_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ password: SECRET_PASSWORD }),
  });
  assert.equal(response.status, 502);
  const output = logs.join('\n');
  assert.equal(output.includes(SECRET_PASSWORD), false);
  assert.equal(output.includes(SECRET_TOKEN), false);
  assert.doesNotMatch(output, /authorization|password|token/i);
});
