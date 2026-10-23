// Shared by the tests, the eval and the image scripts: which browser to drive, and the OpenRouter key.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Playwright's own Chromium (`npx playwright install chromium`) by default, in its full build: the lighter headless
// shell can't load extensions, and branded Chrome no longer allows --load-extension. Set CHROME=/path/to/chrome
// to use another build, such as Chrome for Testing.
export const BROWSER = process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chromium' };

// OPENROUTER_KEY, or the first line of .openrouter-key at the repo root (gitignored).
export function openRouterKey() {
  if (process.env.OPENROUTER_KEY) return process.env.OPENROUTER_KEY.trim();
  const file = path.join(root, '.openrouter-key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').split('\n')[0].trim();
  throw new Error('Set OPENROUTER_KEY, or put your key in .openrouter-key at the repo root (it is gitignored).');
}
