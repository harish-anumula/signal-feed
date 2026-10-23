// Cost and latency of real Jev batches through OpenRouter, as the extension sends them (20 items a request).
// node test/bench.mjs [rounds]   Key: OPENROUTER_KEY or ~/.inpage/openrouter_key
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
const Core = createRequire(import.meta.url)('../extension/src/core.js');
const key = process.env.OPENROUTER_KEY || fs.readFileSync(`${os.homedir()}/.inpage/openrouter_key`, 'utf8').trim();
const html = fs.readFileSync(new URL('./pages/x.html', import.meta.url), 'utf8');
const texts = [...html.matchAll(/\["(?:noise|useful)", "[^"]*", "[^"]*", "([^"]+)"\]/g)].map((m) => m[1]);
const items = Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, surface: 'xPosts', content: `${texts[i % texts.length]} (${i})` }));
const rounds = Number(process.argv[2] || 3);
for (const [label, settings] of [['hide only', Core.mergeSettings()], ['hide + highlight', Core.mergeSettings({ interests: 'software engineering, machine learning' })]]) {
  const costs = [], times = [];
  for (let r = 0; r < rounds; r += 1) {
    const payload = Core.buildPayload(items, settings);
    const t = Date.now();
    const res = await fetch(Core.API_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Signal Feed bench' }, body: JSON.stringify(payload) });
    const body = await res.json();
    times.push(Date.now() - t);
    Core.parseResponse(items, payload, body);
    costs.push(Number(body.usage?.cost) || 0);
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`${label}: ${(avg(times) / 1000).toFixed(2)} s per 20 posts (max ${(Math.max(...times) / 1000).toFixed(2)} s), $${(avg(costs) / 20 * 1000).toFixed(4)} per 1,000 posts`);
}
