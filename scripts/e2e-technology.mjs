import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://127.0.0.1:5173/';
const outputDir = new URL('../output/technology-e2e/', import.meta.url).pathname;
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#start-game-btn');
await page.click('#campaign-continue-btn');
await page.waitForSelector('#game-hud:not([hidden])');

let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.campaign.appliedBonuses.applied, true);
assert.deepEqual(
  { carbon: state.campaign.operationMetrics.carbon, telegrafo: state.campaign.operationMetrics.telegrafo, convoy: state.campaign.operationMetrics.convoy },
  { carbon: 0, telegrafo: 0, convoy: 0 },
);

await page.evaluate(() => window.advanceTime(60_000));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.campaign.operationMetrics.telegrafo, 1);

await page.keyboard.press('F2');
await page.waitForTimeout(50);
await page.keyboard.press('F2');
await page.waitForTimeout(50);
await page.keyboard.press('F2');
assert.match(await page.locator('#selected-entity-name').innerText(), /estación telegráfica/i);
await page.keyboard.press('Control+1');
const steamButton = page.locator('#action-grid .command-button[data-hotkey="2"]');
await steamButton.click();
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.teams.player.technologies.active.id, 'maquina-de-vapor');

await page.evaluate(() => window.advanceTime(10_000));
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#continue-game-btn');
await page.waitForSelector('#game-hud:not([hidden])');
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.teams.player.technologies.active.id, 'maquina-de-vapor');
assert.ok(state.teams.player.technologies.active.progress >= 9.9);
assert.deepEqual(Object.keys(state.controlGroups), ['1']);
await page.keyboard.press('1');
await page.waitForTimeout(50);
assert.match(await page.locator('#selected-entity-name').innerText(), /estación telegráfica/i);

await page.evaluate(() => window.advanceTime(30_000));
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.teams.player.technologies.active, null);
assert.ok(state.teams.player.technologies.researched.includes('maquina-de-vapor'));
await page.screenshot({ path: `${outputDir}technology-complete.png`, fullPage: true });

await browser.close();
assert.deepEqual(errors, []);
console.log(JSON.stringify({ ok: true, technology: 'maquina-de-vapor', missionMetrics: state.campaign.operationMetrics }, null, 2));
