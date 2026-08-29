import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://127.0.0.1:4173/dominio-siglos-de-acero/';
const outputDir = new URL('../output/final/', import.meta.url).pathname;
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

console.log('e2e: desktop menu');
await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await page.click('#start-game-btn');
await page.waitForSelector('#campaign-overlay:not([hidden])');
console.log('e2e: campaign archive');
assert.equal(await page.locator('.operation-file').count(), 4);
assert.equal(await page.locator('.operation-file:not(.is-locked)').count(), 1);
assert.match(await page.locator('#campaign-briefing').innerText(), /telégrafo|ferrocarril/i);
await page.screenshot({ path: `${outputDir}campaign-desktop.png`, fullPage: true });

await page.selectOption('#campaign-difficulty', 'mariscal');
await page.click('#campaign-continue-btn');
await page.waitForSelector('#game-hud:not([hidden])');
console.log('e2e: gameplay');
await page.evaluate(() => window.advanceTime(5000));
let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.mode, 'jugando');
assert.equal(state.teams.player.era, 0);
assert.equal(state.campaign.active.escenario.id, 'vapor-las-lineas-del-alba');
assert.ok(state.teams.player.poblacion >= 10);
assert.ok(state.entities.filter((entity) => entity.teamId === 'player').length >= 10);

await page.click('#toggle-diplomacy-btn');
await page.waitForSelector('#diplomacy-panel:not([hidden])');
console.log('e2e: diplomacy');
await page.click('[data-faction="directorio-danubio"] [data-diplomacy-action]');
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.equal(state.diplomacy.relations.find((entry) => entry.factionId === 'directorio-danubio').tratados[0].tipo, 'noAgresion');
await page.screenshot({ path: `${outputDir}diplomacy-desktop.png`, fullPage: true });

await page.keyboard.press(process.platform === 'darwin' ? 'Meta+s' : 'Control+s');
await page.waitForTimeout(100);
assert.ok(await page.evaluate(() => localStorage.getItem('dominio:archivo-estrategico:v1')));
const timeBeforeReload = state.time;
await page.reload({ waitUntil: 'domcontentloaded' });
console.log('e2e: restore');
assert.equal(await page.locator('#continue-game-btn').isEnabled(), true);
await page.click('#continue-game-btn');
await page.waitForSelector('#game-hud:not([hidden])');
state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
assert.ok(state.time >= timeBeforeReload);
assert.equal(state.diplomacy.relations.find((entry) => entry.factionId === 'directorio-danubio').tratados[0].tipo, 'noAgresion');
await page.waitForTimeout(850);
await page.screenshot({ path: `${outputDir}gameplay-desktop.png`, fullPage: true });

await context.close();
await browser.close();
assert.deepEqual(errors, []);
console.log(JSON.stringify({ ok: true, screenshots: 3, restoredTime: state.time, errors }, null, 2));
