// Chrome for Testing (it still allows --load-extension; branded Chrome doesn't). Override with CHROME=/path.
import os from 'node:os';
export const CHROME = process.env.CHROME || `${os.homedir()}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
