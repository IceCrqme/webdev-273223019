function createLineHandler({ handleMessage, sendMessage }) {
  return async function processLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      sendMessage({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
      return;
    }

    try {
      await handleMessage(message);
    } catch {
      sendMessage({
        jsonrpc: '2.0',
        id: message?.id ?? null,
        error: { code: -32603, message: 'Internal error' },
      });
    }
  };
}

module.exports = { createLineHandler };
