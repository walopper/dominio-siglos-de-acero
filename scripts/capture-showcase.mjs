import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const showcase = process.argv[2] ?? 'combat';
const output = process.argv[3] ?? `output/${showcase}-capture/shot-0.png`;
const waitMs = Number(process.argv[4] ?? 700);
fs.mkdirSync(path.dirname(output), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push({ type: 'console.error', text: message.text() });
});
page.on('pageerror', (error) => errors.push({ type: 'pageerror', text: String(error) }));
page.setDefaultTimeout(120_000);
await page.goto(`http://127.0.0.1:5173/?showcase=${encodeURIComponent(showcase)}`, {
  waitUntil: 'domcontentloaded',
  timeout: 120_000,
});
await page.waitForTimeout(waitMs);
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await page.screenshot({ path: output, timeout: 120_000 });
const state = await page.evaluate(() => window.render_game_to_text?.() ?? null);
if (state) fs.writeFileSync(path.join(path.dirname(output), 'state-0.json'), state);
if (errors.length) fs.writeFileSync(path.join(path.dirname(output), 'errors-0.json'), JSON.stringify(errors, null, 2));
await browser.close();
