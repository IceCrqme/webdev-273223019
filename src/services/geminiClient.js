const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function generate({ title, keywords, signal }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('MODEL_NOT_CONFIGURED');

  const response = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Suggest an editable event description using only these details. Do not invent dates, locations, capacities, or other facts.\nTitle: ${title}\nKeywords: ${keywords.join(', ')}`,
        }],
      }],
      generationConfig: {
        responseMimeType: 'text/plain',
        maxOutputTokens: 300,
      },
    }),
  });

  if (!response.ok) throw new Error('MODEL_PROVIDER_ERROR');
  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) throw new Error('MODEL_INVALID_RESPONSE');

  return parts.map((part) => part?.text).filter((text) => typeof text === 'string').join('\n');
}

module.exports = {
  isConfigured,
  generate,
};
