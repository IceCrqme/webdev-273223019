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
});
