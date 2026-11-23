const geminiClient = require('./geminiClient');

const MAX_DESCRIPTION_LENGTH = 2000;
const DEFAULT_TIMEOUT_MS = 5000;

function validateInput(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim()) {
    throw new Error('INVALID_TITLE');
  }
  if (!Array.isArray(input.keywords) ||
      input.keywords.some((keyword) => typeof keyword !== 'string')) {
    throw new Error('INVALID_KEYWORDS');
  }

  return {
    title: input.title.trim(),
    keywords: input.keywords.map((keyword) => keyword.trim()).filter(Boolean),
  };
}

function makeFallback({ title, keywords }) {
  const safeTitle = title.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  const safeKeywords = keywords
    .map((keyword) => keyword.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const topics = safeKeywords.length ? ` Topics include ${safeKeywords.join(', ')}.` : '';

  return {
    description: `Join us for ${safeTitle}.${topics}`,
    fallback: true,
  };
}

function isValidSuggestion(value) {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_DESCRIPTION_LENGTH &&
    !/[<>]/.test(value);
}

function createEventDescriptionService({
  client = geminiClient,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('INVALID_TIMEOUT');
  }
  if (!client || typeof client.isConfigured !== 'function' || typeof client.generate !== 'function') {
    throw new Error('INVALID_MODEL_CLIENT');
  }

  async function suggestDescription(input) {
    const details = validateInput(input);
    if (!client.isConfigured()) return makeFallback(details);

    const controller = new AbortController();
    let timeoutHandle;
    const timeout = new Promise((resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error('MODEL_TIMEOUT'));
      }, timeoutMs);
    });

    try {
      const request = Promise.resolve().then(() => client.generate({
        ...details,
        signal: controller.signal,
      }));
      const suggestion = await Promise.race([request, timeout]);
      if (!isValidSuggestion(suggestion)) return makeFallback(details);

      return {
        description: suggestion.trim(),
        fallback: false,
      };
    } catch (error) {
      return makeFallback(details);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  return { suggestDescription };
}

module.exports = { createEventDescriptionService };
