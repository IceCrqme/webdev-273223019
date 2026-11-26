const assert = require('node:assert/strict');
const { createEventDescriptionService } = require('../src/services/eventDescriptionService');

describe('Exercise 3: event description suggestions', () => {
  const input = {
    title: 'Community Garden Day',
    keywords: ['gardening', 'volunteers'],
  };

  it('AC-9: returns an editable description suggestion from the provider', async () => {
    const fakeClient = {
      isConfigured: () => true,
      generate: async () => 'Join us for a day of gardening and community.',
    };
    const service = createEventDescriptionService({ client: fakeClient });

    const result = await service.suggestDescription(input);

    assert.deepStrictEqual(result, {
      description: 'Join us for a day of gardening and community.',
      fallback: false,
    });
  });

  it('clears the timeout when a provider returns a suggestion promptly', async () => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const timeoutHandle = {};
    let scheduledDelay;
    let clearedHandle;
    global.setTimeout = (callback, delay) => {
      assert.strictEqual(typeof callback, 'function');
      scheduledDelay = delay;
      return timeoutHandle;
    };
    global.clearTimeout = (handle) => {
      clearedHandle = handle;
    };

    try {
      const service = createEventDescriptionService({
        client: {
          isConfigured: () => true,
          generate: async () => 'A timely suggestion.',
        },
        timeoutMs: 25,
      });

      assert.deepStrictEqual(await service.suggestDescription(input), {
        description: 'A timely suggestion.',
        fallback: false,
      });
      assert.strictEqual(scheduledDelay, 25);
      assert.strictEqual(clearedHandle, timeoutHandle);
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });

  it('AC-9: rejects malformed provider output in favor of a safe suggestion', async () => {
    const fakeClient = {
      isConfigured: () => true,
      generate: async () => ({ description: '<script>unsafe</script>' }),
    };
    const service = createEventDescriptionService({ client: fakeClient });

    const result = await service.suggestDescription(input);

    assert.strictEqual(result.fallback, true);
    assert.match(result.description, /Community Garden Day/);
    assert.doesNotMatch(result.description, /<script>/i);
  });

  it('AC-10: uses a deterministic fallback without calling an unconfigured provider', async () => {
    let calls = 0;
    const fakeClient = {
      isConfigured: () => false,
      generate: async () => {
        calls += 1;
        return 'Must not be used';
      },
    };
    const service = createEventDescriptionService({ client: fakeClient });

    const first = await service.suggestDescription(input);
    const second = await service.suggestDescription(input);

    assert.strictEqual(calls, 0);
    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.fallback, true);
    assert.match(first.description, /Community Garden Day/);
  });

  it('AC-10: aborts a hung provider request within the configured timeout', async () => {
    let receivedSignal;
    const fakeClient = {
      isConfigured: () => true,
      generate: ({ signal }) => {
        receivedSignal = signal;
        return new Promise(() => {});
      },
    };
    const service = createEventDescriptionService({
      client: fakeClient,
      timeoutMs: 15,
    });

    const startedAt = Date.now();
    const result = await service.suggestDescription(input);
    const elapsed = Date.now() - startedAt;

    assert.strictEqual(receivedSignal.aborted, true);
    assert.ok(elapsed < 500, `suggestion took ${elapsed}ms instead of timing out`);
    assert.strictEqual(result.fallback, true);
  });

  it('AC-10: returns the same fallback when the provider fails', async () => {
    const fakeClient = {
      isConfigured: () => true,
      generate: async () => {
        throw new Error('provider unavailable');
      },
    };
    const service = createEventDescriptionService({ client: fakeClient });

    const result = await service.suggestDescription(input);

    assert.strictEqual(result.fallback, true);
    assert.match(result.description, /Community Garden Day/);
  });

  it('rejects invalid titles and keyword lists before calling the provider', async () => {
    let calls = 0;
    const service = createEventDescriptionService({
      client: {
        isConfigured: () => true,
        generate: async () => {
          calls += 1;
          return 'Unused';
        },
      },
    });

    await assert.rejects(service.suggestDescription(null), { message: 'INVALID_TITLE' });
    await assert.rejects(
      service.suggestDescription({ title: '  ', keywords: [] }),
      { message: 'INVALID_TITLE' }
    );
    await assert.rejects(
      service.suggestDescription({ title: 'Event', keywords: ['valid', 42] }),
      { message: 'INVALID_KEYWORDS' }
    );
    assert.strictEqual(calls, 0);
  });

  it('sanitizes fallback details and rejects blank or oversized suggestions', async () => {
    const fallbackService = createEventDescriptionService({
      client: { isConfigured: () => false, generate: async () => '' },
    });
    const fallback = await fallbackService.suggestDescription({
      title: '  <Garden>   Day ',
      keywords: ['  <plants>  ', '   '],
    });
    assert.deepStrictEqual(fallback, {
      description: 'Join us for Garden Day. Topics include plants.',
      fallback: true,
    });
    const noTopics = await fallbackService.suggestDescription({
      title: 'Garden Day',
      keywords: [],
    });
    assert.deepStrictEqual(noTopics, {
      description: 'Join us for Garden Day.',
      fallback: true,
    });

    for (const suggestion of ['', 'x'.repeat(2001)]) {
      const service = createEventDescriptionService({
        client: { isConfigured: () => true, generate: async () => suggestion },
      });
      assert.strictEqual((await service.suggestDescription(input)).fallback, true);
    }
  });

  it('rejects invalid timeout and model client configuration', () => {
    const validClient = { isConfigured: () => false, generate: async () => '' };
    assert.throws(
      () => createEventDescriptionService({ client: validClient, timeoutMs: 0 }),
      { message: 'INVALID_TIMEOUT' }
    );
    assert.throws(
      () => createEventDescriptionService({ client: { generate: async () => '' } }),
      { message: 'INVALID_MODEL_CLIENT' }
    );
  });
});
