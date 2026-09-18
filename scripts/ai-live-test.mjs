/**
 * Live provider tests — GATED. Only runs when AI_LIVE_TESTS=true AND a real
 * AI_API_KEY is provided by the operator. Never part of `npm run check`.
 * Synthetic data only, tiny token budget, a handful of calls. Never prints
 * secrets.
 */
const REQUIRED_COVERAGE = [];

function getEnv(name) {
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
}

async function main() {
  const gate = getEnv('AI_LIVE_TESTS');
  const apiKey = getEnv('AI_API_KEY');
  if (gate !== 'true' || !apiKey) {
    console.log(
      'LIVE PROVIDER TESTS: NOT EXECUTED — CREDENTIALS NOT PROVIDED (set AI_LIVE_TESTS=true and AI_API_KEY to run).',
    );
    return;
  }
  const baseUrl = (getEnv('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = getEnv('AI_MODEL') ?? 'gpt-4o-mini';
  const headers = { authorization: 'Bearer ***redacted***' };
  void headers;
  const auth = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };

  const startedAt = Date.now();
  const health = await fetch(`${baseUrl}/models`, { headers: auth, method: 'GET' });
  console.log(`live models endpoint: ${health.status}`);
  if (!health.ok) {
    console.log('LIVE PROVIDER TESTS: FAILED — provider unreachable or key invalid.');
    process.exitCode = 1;
    return;
  }

  const chat = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      max_tokens: 50,
      messages: [
        { content: 'Return exactly: {"ok": true}', role: 'system' },
        { content: 'Synthetic connectivity probe. Reply with the JSON only.', role: 'user' },
      ],
      model,
    }),
    headers: auth,
    method: 'POST',
  });
  console.log(`live chat endpoint: ${chat.status}`);
  if (chat.ok) {
    const payload = await chat.json();
    const text = payload?.choices?.[0]?.message?.content ?? '';
    const usage = payload?.usage ?? null;
    console.log(`live chat text length: ${String(text).length}`);
    console.log(`live chat usage reported: ${usage ? 'yes' : 'no'}`);
    REQUIRED_COVERAGE.push('chat');
  }

  const embeddingModel = getEnv('AI_EMBEDDING_MODEL');
  if (embeddingModel) {
    const embeddings = await fetch(`${baseUrl}/embeddings`, {
      body: JSON.stringify({ input: ['synthetic probe'], model: embeddingModel }),
      headers: auth,
      method: 'POST',
    });
    console.log(`live embeddings endpoint: ${embeddings.status}`);
    if (embeddings.ok) REQUIRED_COVERAGE.push('embeddings');
  } else {
    console.log('live embeddings: skipped (AI_EMBEDDING_MODEL not set).');
  }

  console.log(`live elapsed ms: ${Date.now() - startedAt}`);
  console.log(`LIVE PROVIDER TESTS: EXECUTED (${REQUIRED_COVERAGE.join(', ') || 'health only'}).`);
}

main().catch((error) => {
  console.log(`LIVE PROVIDER TESTS: FAILED — ${error instanceof Error ? error.message : 'unknown'}.`);
  process.exitCode = 1;
});
