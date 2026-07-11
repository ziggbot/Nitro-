/**
 * Headless smoke test: boots the built game in Chromium, plays a few
 * seconds in the arena, and asserts the simulation actually advances.
 *
 * Usage: npm run build && npx vite preview --port 4173 &  node scripts/smoke.mjs
 * Env: BASE_URL (default http://localhost:4173), OUT_DIR for screenshots,
 *      CHROMIUM_PATH for a custom browser binary.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const OUT = process.env.OUT_DIR ?? '.';
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console: ' + msg.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/1-menu.png` });

// Click PLAY. Wide menu design is 960x560 scaled to fit (cap 1.2):
// at 1280x800 → scale 1.2, offset (64,64), PLAY at design (480,392).
await page.mouse.click(640, 534);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/2-arena.png` });

const sample = () =>
  page.evaluate(() => {
    const arena = window.__game?.scene.getScene('arena');
    if (!arena || !arena.player) return null;
    const p = arena.player;
    return {
      x: Math.round(p.x),
      y: Math.round(p.y),
      fuel: p.fuel,
      score: p.score,
      alive: p.alive,
      trailPts: p.trail.length,
      aliveCars: arena.cars.filter((c) => c.alive).length,
      botTravel: arena.cars.filter((c) => !c.driver.isPlayer && c.alive && c.trail.length > 3).length,
    };
  });

const before = await sample();
// Drive: steer around and boost briefly.
await page.mouse.move(900, 300);
await page.waitForTimeout(2000);
await page.mouse.move(400, 600);
await page.waitForTimeout(2000);
await page.mouse.down();
await page.waitForTimeout(1500);
await page.mouse.up();
await page.waitForTimeout(1500);
const after = await sample();
await page.screenshot({ path: `${OUT}/3-driving.png` });

// --- Mobile viewport pass: verify the narrow menu/garage layouts. ---
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
mobile.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.waitForTimeout(2500);
await mobile.screenshot({ path: `${OUT}/m1-menu.png` });
// GARAGE button in narrow design (420x810): (210,474) → screen ≈ (195,486).
await mobile.mouse.click(195, 486);
await mobile.waitForTimeout(1500);
await mobile.screenshot({ path: `${OUT}/m2-garage.png` });

await browser.close();

console.log('before:', JSON.stringify(before));
console.log('after: ', JSON.stringify(after));

const failures = [];
if (errors.length) failures.push(`page errors: ${errors.slice(0, 5).join(' | ')}`);
if (!before) failures.push('arena/player never appeared — PLAY click failed?');
if (before && after) {
  if (after.fuel >= before.fuel) failures.push('fuel did not drain — simulation frozen?');
  if (after.x === before.x && after.y === before.y) failures.push('player never moved');
  if (after.aliveCars < 2) failures.push('bots missing from arena');
  if (after.botTravel === 0) failures.push('no bot has driven anywhere');
}

if (failures.length) {
  console.error('SMOKE FAIL:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('SMOKE OK');
