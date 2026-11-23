const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function sendStdioLine(line) {
  const server = spawn(process.execPath, [
    path.join(__dirname, '../mcp-server/server.js'),
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  let timeout;
  const exitPromise = new Promise((resolve) => server.once('exit', resolve));
  const responsePromise = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('MCP server did not respond')), 3000);
    server.stdout.setEncoding('utf8');
    server.stdout.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timeout);
      resolve(JSON.parse(buffer.slice(0, newline)));
    });
    server.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  try {
    server.stdin.write(`${line}\n`);
    return await responsePromise;
  } finally {
    clearTimeout(timeout);
    if (server.exitCode === null && server.signalCode === null) server.kill();
    await exitPromise;
  }
}

describe('MCP JSON-RPC line handler errors', () => {
  it('returns Parse error for malformed JSON', async () => {
    const response = await sendStdioLine('{ invalid json');

    assert.deepStrictEqual(response, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
  });

  it('returns Invalid params for null JSON-RPC params', async () => {
    const response = await sendStdioLine(JSON.stringify({
      jsonrpc: '2.0',
      id: 43,
      method: 'tools/call',
      params: null,
    }));

    assert.deepStrictEqual(response, {
      jsonrpc: '2.0',
      id: 43,
      error: { code: -32602, message: 'Invalid params' },
    });
  });

  it('returns Internal error with the request ID when handling fails', async () => {
    const { createLineHandler } = require('../mcp-server/lineHandler');
    const sent = [];
    const processLine = createLineHandler({
      handleMessage: async () => {
        throw new Error('unexpected handler failure');
      },
      sendMessage: (message) => sent.push(message),
    });

    await processLine(JSON.stringify({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
    }));

    assert.deepStrictEqual(sent, [{
      jsonrpc: '2.0',
      id: 42,
      error: { code: -32603, message: 'Internal error' },
    }]);
  });
});
