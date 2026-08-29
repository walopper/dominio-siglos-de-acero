import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.argv[2] || 'http://127.0.0.1:4173/dominio-siglos-de-acero/';
const archiveKey = 'dominio:archivo-estrategico:v1';
const scenarioIds = [
  'vapor-las-lineas-del-alba',
  'industria-trueno-coordinado',
  'atomo-el-sol-cautivo',
  'orbital-puente-de-selene',
];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

async function forceCompletedBattle(expectedScenarioId) {
  await page.evaluate(({ key, scenarioId }) => {
    const archive = JSON.parse(localStorage.getItem(key));
    if (!archive) throw new Error('No existe la operación autoguardada.');
    const match = JSON.parse(archive.match);
    const state = match.state;
    if (state.mission?.scenarioId !== scenarioId) throw new Error(`Escenario inesperado: ${state.mission?.scenarioId}`);

    state.controlPoints.forEach((point) => {
      point.ownerId = 'player';
      point.capture = 1;
      point.capturingTeamId = null;
    });

    const nextId = () => Math.max(0, ...state.entities.map((entity) => entity.id)) + 1;
    const ensureEntities = (type, count, kind) => {
      const matches = () => state.entities.filter((entity) => entity.alive && entity.teamId === 'player' && entity.type === type);
      while (matches().length < count) {
        const template = state.entities.find((entity) => entity.alive && entity.teamId === 'player' && entity.kind === kind);
        if (!template) throw new Error(`No hay plantilla ${kind} para ${type}.`);
        state.entities.push({
          ...structuredClone(template),
          id: nextId(),
          type,
          nombre: `Refuerzo ${type}`,
          complete: true,
          buildProgress: 1,
          alive: true,
          orders: [],
        });
      }
    };

    if (scenarioId === 'vapor-las-lineas-del-alba') {
      const telegraph = state.entities.find((entity) => entity.id === state.mission.roles.telegraphId);
      if (!telegraph) throw new Error('No se encontró la estación telegráfica.');
      telegraph.complete = true;
      telegraph.buildProgress = 1;
      telegraph.hp = telegraph.maxHp;
      state.time = Math.max(state.time, 100);
    }

    if (scenarioId === 'industria-trueno-coordinado') {
      archive.scenarioRuntime.destroyedHeavy = [9001, 9002, 9003, 9004];
      archive.scenarioRuntime.reconPoints = state.controlPoints.map((point) => point.id);
    }

    if (scenarioId === 'atomo-el-sol-cautivo') {
      ensureEntities('central', 4, 'building');
      state.time = Math.max(state.time, 190);
    }

    if (scenarioId === 'orbital-puente-de-selene') {
      ensureEntities('central', 4, 'building');
      ensureEntities('vivienda', 3, 'building');
      ensureEntities('dron', 8, 'unit');
      const initial = archive.scenarioRuntime.initial.resources;
      state.teams.player.recursos.acero = (initial.acero || 0) + 1000;
    }

    state.mode = 'finalizado';
    state.result = {
      outcome: 'victoria',
      winnerId: 'player',
      reason: 'Victoria de validación por supremacía estratégica.',
      time: state.time,
    };
    archive.match = JSON.stringify(match);
    localStorage.setItem(key, JSON.stringify(archive));
  }, { key: archiveKey, scenarioId: expectedScenarioId });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#continue-game-btn').evaluate((button) => button.click());
  await page.waitForSelector('#victory-overlay:not([hidden])');
}

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#start-game-btn').evaluate((button) => button.click());
  await page.waitForSelector('#campaign-overlay:not([hidden])');
  await page.locator('#campaign-continue-btn').evaluate((button) => button.click());
  await page.waitForSelector('#game-hud:not([hidden])');

  for (const [index, scenarioId] of scenarioIds.entries()) {
    await forceCompletedBattle(scenarioId);
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.campaign.progress.escenarios[scenarioId].victoria, true);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), archiveKey), null);
    await page.locator('#victory-next-btn').evaluate((button) => button.click());
    await page.waitForSelector('#campaign-overlay:not([hidden])');

    const completed = await page.locator('.operation-file[data-state="completado"]').count();
    assert.equal(completed, index + 1);
    assert.equal((await page.locator('#campaign-progress-label').innerText()).trim(), `${String(index + 1).padStart(2, '0')} / 04`);

    if (index < scenarioIds.length - 1) {
      assert.equal(await page.locator('.operation-file:not(.is-locked)').count(), index + 2);
      await page.locator('#campaign-continue-btn').evaluate((button) => button.click());
      await page.waitForFunction(() => document.querySelector('#campaign-overlay')?.hidden === true);
    } else {
      assert.match(await page.locator('#campaign-save-status').innerText(), /Campaña completada/i);
      assert.match(await page.locator('#campaign-continue-btn').innerText(), /Repetir operación/i);
      assert.match(await page.locator('#victory-title').innerText(), /campaña\s*está completa/i);
    }
  }

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, scenariosCompleted: scenarioIds.length, errors }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
