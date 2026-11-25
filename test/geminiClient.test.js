const assert = require('node:assert/strict');
const geminiClient = require('../src/services/geminiClient');

describe('Gemini client', () => {
  let originalFetch;
  let originalApiKey;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalApiKey = process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  });

  it('sends a bounded text-generation request and extracts text parts', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    let requestUrl;
    let requestOptions;
    global.fetch = async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'A useful suggestion.' }, { text: 42 }, { text: 'More detail.' }],
            },
          }],
        }),
      };
    };

    assert.strictEqual(geminiClient.isConfigured(), true);
    const result = await geminiClient.generate({
      title: 'Garden day',
      keywords: ['plants', 'community'],
      signal: new AbortController().signal,
    });

    assert.match(requestUrl, /gemini-2\.0-flash:generateContent$/);
    assert.strictEqual(requestOptions.method, 'POST');
    assert.strictEqual(requestOptions.headers['x-goog-api-key'], 'test-key');
    assert.strictEqual(requestOptions.signal.aborted, false);
    assert.deepStrictEqual(JSON.parse(requestOptions.body).generationConfig, {
      responseMimeType: 'text/plain',
      maxOutputTokens: 300,
    });
    assert.strictEqual(result, 'A useful suggestion.\nMore detail.');
  });

  it('does not make a request when the API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    let called = false;
    global.fetch = async () => {
      called = true;
    };

    assert.strictEqual(geminiClient.isConfigured(), false);
    await assert.rejects(
      geminiClient.generate({ title: 'Garden day', keywords: [], signal: undefined }),
      { message: 'MODEL_NOT_CONFIGURED' }
    );
    assert.strictEqual(called, false);
  });

  it('surfaces provider and malformed-response errors', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    global.fetch = async () => ({ ok: false });
    await assert.rejects(
      geminiClient.generate({ title: 'Garden day', keywords: [], signal: undefined }),
      { message: 'MODEL_PROVIDER_ERROR' }
    );

    global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [] }) });
    await assert.rejects(
      geminiClient.generate({ title: 'Garden day', keywords: [], signal: undefined }),
      { message: 'MODEL_INVALID_RESPONSE' }
    );
  });
});
